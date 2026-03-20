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
    const participants = run.participantInstances.filter((participant) => matchesAttributes(fromJson<ParticipantIdentity>(participant.identity), filters.attributes));

    const grouped = new Map<string, number>();
    if (filters.groupBy) {
      for (const participant of participants) {
        const identity = fromJson<ParticipantIdentity>(participant.identity);
        const groupValue = (identity as Record<string, unknown>)[filters.groupBy];
        const label = Array.isArray(groupValue) ? groupValue.join(", ") : String(groupValue ?? "Unknown");
        grouped.set(label, (grouped.get(label) ?? 0) + 1);
      }
    }

    const questionReports: ReportDto["questions"] = [];

    for (const section of schema.sections) {
      for (const question of section.questions) {
        if (["paragraph", "section_title", "respondent_instruction"].includes(question.type)) continue;
        const answers = participants
          .flatMap((participant) => participant.surveyResponse?.answers ?? [])
          .filter((answer) => answer.questionId === question.id)
          .map((answer) => fromJson<StructuredAnswer>(answer.answer));

        if (["single_choice", "single_choice_other"].includes(question.type)) {
          const items = question.options.map((option) => ({
            label: option.label,
            count: answers.filter((answer) => answer.selectedOptionIds.includes(option.id)).length,
            percentage: 0,
          }));
          for (const item of items) {
            item.percentage = participants.length ? Number(((item.count / participants.length) * 100).toFixed(2)) : 0;
          }
          questionReports.push({ questionId: question.id, title: question.title, type: question.type, singleChoice: items });
          continue;
        }

        if (["multi_choice", "multi_choice_other"].includes(question.type)) {
          const items = question.options.map((option) => ({
            label: option.label,
            count: answers.filter((answer) => answer.selectedOptionIds.includes(option.id)).length,
            percentage: 0,
          }));
          for (const item of items) {
            item.percentage = participants.length ? Number(((item.count / participants.length) * 100).toFixed(2)) : 0;
          }
          questionReports.push({ questionId: question.id, title: question.title, type: question.type, multiChoice: items });
          continue;
        }

        if (question.type === "rating") {
          const values = answers.map((answer) => answer.ratingValue).filter((value): value is number => typeof value === "number").sort((a, b) => a - b);
          const distribution = Array.from(new Set(values)).sort((a, b) => a - b).map((value) => ({ label: String(value), count: values.filter((item) => item === value).length }));
          const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
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
          });
          continue;
        }

        const openAnswers = answers.map((answer) => answer.textAnswer ?? answer.otherText ?? "").filter(Boolean);
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

        questionReports.push({
          questionId: question.id,
          title: question.title,
          type: question.type,
          openText: { answers: openAnswers, summary, keywords },
        });
      }
    }

    const report: ReportDto = {
      runId,
      filters,
      totalResponses: participants.filter((participant) => participant.surveyResponse?.status === "COMPLETED").length,
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
