import { reportFilterSchema, type ParticipantIdentity, type ReportDto, type ReportFilter, type StructuredAnswer, type SurveySchemaDto } from "@formagents/shared";
import { prisma } from "../../lib/db.js";
import { fromJson, toJson } from "../../lib/json.js";
import { LlmService } from "../llm/llm.service.js";

function percentile(values: number[], fraction: number) {
  if (values.length === 0) return 0;
  const position = (values.length - 1) * fraction;
  const base = Math.floor(position);
  const rest = position - base;
  if (values[base + 1] !== undefined) {
    return values[base] + rest * (values[base + 1] - values[base]);
  }
  return values[base];
}

function stdDev(values: number[]) {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function matchesAttributes(identity: ParticipantIdentity, filters: ReportFilter["attributes"]) {
  return Object.entries(filters).every(([key, rawValue]) => {
    const fieldValue = (identity as Record<string, unknown>)[key];
    const values = Array.isArray(fieldValue) ? fieldValue.map(String) : fieldValue !== undefined ? [String(fieldValue)] : [];
    const targets = Array.isArray(rawValue) ? rawValue.map(String) : [String(rawValue)];
    return values.some((value) => targets.includes(value));
  });
}

function getGroupInfo(identity: ParticipantIdentity, groupBy?: string) {
  if (!groupBy) {
    return { key: "__all__", label: "All respondents" };
  }
  const groupValue = (identity as Record<string, unknown>)[groupBy];
  const label = Array.isArray(groupValue) ? groupValue.join(", ") : String(groupValue ?? "Unknown");
  return { key: label, label };
}

function getQuestionAnswers(participants: Array<{
  identity: ParticipantIdentity;
  answers: StructuredAnswer[];
}>, questionId: string) {
  return participants.flatMap((participant) =>
    participant.answers
      .filter((answer) => answer.questionId === questionId)
      .map((answer) => ({ identity: participant.identity, answer })),
  );
}

export class ReportService {
  private readonly llmService = new LlmService();

  async getReport(userId: string, runId: string, input: unknown): Promise<ReportDto> {
    const filters = reportFilterSchema.parse(input ?? {});
    const run = await prisma.mockRun.findFirst({
      where: { id: runId, userId },
      include: {
        survey: true,
        participantInstances: { include: { surveyResponse: { include: { answers: true } } }, orderBy: { ordinal: "asc" } },
        aggregatedReport: true,
      },
    });

    if (!run) throw new Error("Mock run not found");
    const schema = fromJson<SurveySchemaDto>(run.survey.schema);
    const participants = run.participantInstances
      .map((participant) => ({
        identity: fromJson<ParticipantIdentity>(participant.identity),
        responseStatus: participant.surveyResponse?.status,
        answers: (participant.surveyResponse?.answers ?? []).map((answer) => fromJson<StructuredAnswer>(answer.answer)),
      }))
      .filter((participant) => matchesAttributes(participant.identity, filters.attributes));

    const grouped = new Map<string, number>();
    if (filters.groupBy) {
      for (const participant of participants) {
        const group = getGroupInfo(participant.identity, filters.groupBy);
        grouped.set(group.label, (grouped.get(group.label) ?? 0) + 1);
      }
    }

    const questionReports: ReportDto["questions"] = [];

    for (const section of schema.sections) {
      for (const question of section.questions) {
        if (["paragraph", "section_title", "respondent_instruction"].includes(question.type)) continue;
        const answers = getQuestionAnswers(participants, question.id);

        if (["single_choice", "single_choice_other"].includes(question.type)) {
          const items = question.options.map((option) => ({
            label: option.label,
            count: answers.filter(({ answer }) => answer.selectedOptionIds.includes(option.id)).length,
            percentage: 0,
          }));
          for (const item of items) {
            item.percentage = participants.length ? Number(((item.count / participants.length) * 100).toFixed(2)) : 0;
          }

          const groupedSingleChoice = filters.groupBy
            ? Object.fromEntries(
                question.options.map((option) => [
                  option.id,
                  Array.from(grouped.entries()).map(([label, total]) => {
                    const count = answers.filter(({ identity, answer }) => {
                      return getGroupInfo(identity, filters.groupBy).label === label && answer.selectedOptionIds.includes(option.id);
                    }).length;
                    return {
                      groupKey: label,
                      groupLabel: label,
                      count,
                      percentage: total ? Number(((count / total) * 100).toFixed(2)) : 0,
                    };
                  }),
                ]),
              )
            : undefined;

          questionReports.push({
            questionId: question.id,
            title: question.title,
            type: question.type,
            singleChoice: items,
            groupedSingleChoice,
          });
          continue;
        }

        if (["multi_choice", "multi_choice_other"].includes(question.type)) {
          const items = question.options.map((option) => ({
            label: option.label,
            count: answers.filter(({ answer }) => answer.selectedOptionIds.includes(option.id)).length,
            percentage: 0,
          }));
          for (const item of items) {
            item.percentage = participants.length ? Number(((item.count / participants.length) * 100).toFixed(2)) : 0;
          }

          const groupedMultiChoice = filters.groupBy
            ? Object.fromEntries(
                question.options.map((option) => [
                  option.id,
                  Array.from(grouped.entries()).map(([label, total]) => {
                    const count = answers.filter(({ identity, answer }) => {
                      return getGroupInfo(identity, filters.groupBy).label === label && answer.selectedOptionIds.includes(option.id);
                    }).length;
                    return {
                      groupKey: label,
                      groupLabel: label,
                      count,
                      percentage: total ? Number(((count / total) * 100).toFixed(2)) : 0,
                    };
                  }),
                ]),
              )
            : undefined;

          questionReports.push({
            questionId: question.id,
            title: question.title,
            type: question.type,
            multiChoice: items,
            groupedMultiChoice,
          });
          continue;
        }

        if (question.type === "rating") {
          const values = answers.map(({ answer }) => answer.ratingValue).filter((value): value is number => typeof value === "number").sort((a, b) => a - b);
          const distribution = Array.from(new Set(values)).sort((a, b) => a - b).map((value) => ({ label: String(value), count: values.filter((item) => item === value).length }));
          const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

          const groupedRating = filters.groupBy
            ? Array.from(grouped.keys()).map((label) => {
                const groupValues = answers
                  .filter(({ identity, answer }) => getGroupInfo(identity, filters.groupBy).label === label && typeof answer.ratingValue === "number")
                  .map(({ answer }) => answer.ratingValue as number)
                  .sort((a, b) => a - b);
                const groupMean = groupValues.length ? groupValues.reduce((sum, value) => sum + value, 0) / groupValues.length : 0;
                return {
                  groupKey: label,
                  groupLabel: label,
                  mean: Number(groupMean.toFixed(2)),
                  median: Number(percentile(groupValues, 0.5).toFixed(2)),
                  stdDev: Number(stdDev(groupValues).toFixed(2)),
                  count: groupValues.length,
                };
              })
            : undefined;

          questionReports.push({
            questionId: question.id,
            title: question.title,
            type: question.type,
            rating: {
              mean: Number(mean.toFixed(2)),
              median: Number(percentile(values, 0.5).toFixed(2)),
              stdDev: Number(stdDev(values).toFixed(2)),
              distribution,
            },
            groupedRating,
          });
          continue;
        }

        const openAnswers = answers.map(({ answer }) => answer.textAnswer ?? answer.otherText ?? "").filter(Boolean);
        let summary: string | undefined;
        let keywords: string[] = [];

        if (openAnswers.length > 0) {
          try {
            const config = await this.llmService.getRuntimeConfig(userId, run.llmConfigId);
            const openSummary = await this.llmService.generateJson<{ summary: string; keywords: string[] }>(
              config,
              [
                { role: "system", content: "Summarize open survey responses into JSON with summary and keywords." },
                { role: "user", content: openAnswers.join("\n---\n") },
              ],
              'Return JSON: {"summary": string, "keywords": string[] }',
            );
            summary = openSummary.summary;
            keywords = openSummary.keywords ?? [];
          } catch {
            summary = undefined;
            keywords = [];
          }
        }

        const groupedOpenText = filters.groupBy
          ? Array.from(grouped.keys()).map((label) => {
              const groupAnswers = answers
                .filter(({ identity }) => getGroupInfo(identity, filters.groupBy).label === label)
                .map(({ answer }) => answer.textAnswer ?? answer.otherText ?? "")
                .filter(Boolean);
              return {
                groupKey: label,
                groupLabel: label,
                count: groupAnswers.length,
                sampleAnswers: groupAnswers.slice(0, 3),
              };
            })
          : undefined;

        questionReports.push({
          questionId: question.id,
          title: question.title,
          type: question.type,
          openText: { answers: openAnswers, summary, keywords },
          groupedOpenText,
        });
      }
    }

    const report: ReportDto = {
      runId,
      filters,
      totalResponses: participants.filter((participant) => participant.responseStatus === "COMPLETED").length,
      groupedBy: filters.groupBy,
      groups: Array.from(grouped.entries()).map(([label, count]) => ({ key: label, label, count })),
      questions: questionReports,
    };

    await prisma.aggregatedReport.upsert({
      where: { mockRunId: runId },
      create: { mockRunId: runId, payload: toJson(report) },
      update: { payload: toJson(report) },
    });

    return report;
  }
}
