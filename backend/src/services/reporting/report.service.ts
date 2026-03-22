import {
  reportComparisonInputSchema,
  reportFilterSchema,
  type ParticipantIdentity,
  type ReportComparisonDto,
  type ReportDto,
  type ReportFilter,
  type StructuredAnswer,
  type SurveySchemaDto,
} from "@surveysim/shared";
import { prisma } from "../../lib/db.js";
import { fromJson, toJson } from "../../lib/json.js";
import { readStructuredAnswers } from "../survey-response-answer-reader.js";

type LoadedRun = Awaited<ReturnType<ReportService["loadRun"]>>;

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

function getQuestionAnswers(
  participants: Array<{
    identity: ParticipantIdentity;
    answers: StructuredAnswer[];
  }>,
  questionId: string,
) {
  return participants.flatMap((participant) =>
    participant.answers
      .filter((answer) => answer.questionId === questionId)
      .map((answer) => ({ identity: participant.identity, answer })),
  );
}

function round(value: number) {
  return Number(value.toFixed(2));
}

function buildBaseQuestionMeta(
  questionId: string,
  title: string,
  type: string,
  answerCount: number,
  totalResponses: number,
  suggestedChart: "bar" | "pie" | "line" | "stacked_bar" | "table" | "none",
) {
  return {
    questionId,
    title,
    type,
    responseCount: answerCount,
    responseRate: totalResponses ? round((answerCount / totalResponses) * 100) : 0,
    suggestedChart,
  };
}

function buildDiagnostics(
  answers: Array<{
    answer: StructuredAnswer;
  }>,
  totalResponses: number,
) {
  const skippedCount = answers.filter(({ answer }) => answer.isSkipped).length;
  const confidenceValues = answers
    .map(({ answer }) => answer.confidence)
    .filter((value): value is number => typeof value === "number");

  return {
    skippedCount,
    skippedRate: totalResponses ? round((skippedCount / totalResponses) * 100) : 0,
    meanConfidence: confidenceValues.length ? round(confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length) : 0,
  };
}

export class ReportService {
  async getReport(userId: string, runId: string, input: unknown): Promise<ReportDto> {
    const filters = reportFilterSchema.parse(input ?? {});
    const run = await this.loadRun(userId, runId);
    const report = await this.buildReport(run, filters);

    await prisma.aggregatedReport.upsert({
      where: { mockRunId: runId },
      create: { mockRunId: runId, payload: toJson(report) },
      update: { payload: toJson(report) },
    });

    return report;
  }

  async compareRuns(userId: string, input: unknown): Promise<ReportComparisonDto> {
    const payload = reportComparisonInputSchema.parse(input);
    const runs = await Promise.all(payload.runIds.map((runId) => this.loadRun(userId, runId)));

    const surveyIds = new Set(runs.map((run) => run.surveyId));
    if (surveyIds.size > 1) {
      throw new Error("Comparison only supports runs from the same survey");
    }

    const builtRuns = await Promise.all(
      runs.map(async (run) => {
        const report = await this.buildReport(run, payload);
        return {
          runId: report.runId,
          runName: run.name,
          surveyId: run.surveyId,
          totalResponses: report.totalResponses,
          groupedBy: report.groupedBy,
          groups: report.groups,
          questions: report.questions,
        };
      }),
    );

    return {
      runIds: payload.runIds,
      filters: {
        attributes: payload.attributes,
        groupBy: payload.groupBy,
      },
      groupedBy: payload.groupBy,
      runs: builtRuns,
    };
  }

  private async loadRun(userId: string, runId: string) {
    const run = await prisma.mockRun.findFirst({
      where: { id: runId, userId },
      include: {
        survey: true,
        participantInstances: {
          include: {
            surveyResponse: { include: { answers: true } },
          },
          orderBy: { ordinal: "asc" },
        },
      },
    });

    if (!run) throw new Error("Mock run not found");
    return run;
  }

  private async buildReport(run: LoadedRun, filters: ReportFilter): Promise<ReportDto> {
    const schema = fromJson<SurveySchemaDto>(run.survey.schema);
    const participants = run.participantInstances
      .map((participant) => ({
        identity: fromJson<ParticipantIdentity>(participant.identity),
        responseStatus: participant.surveyResponse?.status,
        answers: readStructuredAnswers(participant.surveyResponse),
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
        const completedResponses = participants.filter((participant) => participant.responseStatus === "COMPLETED").length;

        if (["single_choice", "single_choice_other"].includes(question.type)) {
          const effectiveAnswers = answers.filter(({ answer }) => !answer.isSkipped);
          const items = question.options.map((option) => {
            const count = effectiveAnswers.filter(({ answer }) => answer.selectedOptionIds.includes(option.id)).length;
            return {
              label: option.label,
              count,
              percentage: participants.length ? round((count / participants.length) * 100) : 0,
            };
          });

          const groupedSingleChoice = filters.groupBy
            ? Object.fromEntries(
                question.options.map((option) => [
                  option.id,
                  Array.from(grouped.entries()).map(([label, total]) => {
                    const count = answers.filter(({ identity, answer }) => {
                      return getGroupInfo(identity, filters.groupBy).label === label && !answer.isSkipped && answer.selectedOptionIds.includes(option.id);
                    }).length;
                    return {
                      groupKey: label,
                      groupLabel: label,
                      count,
                      percentage: total ? round((count / total) * 100) : 0,
                    };
                  }),
                ]),
              )
            : undefined;

          questionReports.push({
            ...buildBaseQuestionMeta(question.id, question.title, question.type, answers.length, completedResponses, items.length <= 5 ? "pie" : "bar"),
            questionId: question.id,
            title: question.title,
            type: question.type,
            singleChoice: items,
            groupedSingleChoice,
            diagnostics: buildDiagnostics(answers, completedResponses),
          });
          continue;
        }

        if (["multi_choice", "multi_choice_other"].includes(question.type)) {
          const effectiveAnswers = answers.filter(({ answer }) => !answer.isSkipped);
          const items = question.options.map((option) => {
            const count = effectiveAnswers.filter(({ answer }) => answer.selectedOptionIds.includes(option.id)).length;
            return {
              label: option.label,
              count,
              percentage: participants.length ? round((count / participants.length) * 100) : 0,
            };
          });

          const groupedMultiChoice = filters.groupBy
            ? Object.fromEntries(
                question.options.map((option) => [
                  option.id,
                  Array.from(grouped.entries()).map(([label, total]) => {
                    const count = answers.filter(({ identity, answer }) => {
                      return getGroupInfo(identity, filters.groupBy).label === label && !answer.isSkipped && answer.selectedOptionIds.includes(option.id);
                    }).length;
                    return {
                      groupKey: label,
                      groupLabel: label,
                      count,
                      percentage: total ? round((count / total) * 100) : 0,
                    };
                  }),
                ]),
              )
            : undefined;

          questionReports.push({
            ...buildBaseQuestionMeta(question.id, question.title, question.type, answers.length, completedResponses, "bar"),
            questionId: question.id,
            title: question.title,
            type: question.type,
            multiChoice: items,
            groupedMultiChoice,
            diagnostics: buildDiagnostics(answers, completedResponses),
          });
          continue;
        }

        if (question.type === "rating") {
          const values = answers
            .filter(({ answer }) => !answer.isSkipped)
            .map(({ answer }) => answer.ratingValue)
            .filter((value): value is number => typeof value === "number")
            .sort((a, b) => a - b);
          const distribution = Array.from(new Set(values))
            .sort((a, b) => a - b)
            .map((value) => ({ label: String(value), count: values.filter((item) => item === value).length }));
          const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

          const groupedRating = filters.groupBy
            ? Array.from(grouped.keys()).map((label) => {
                const groupValues = answers
                  .filter(({ identity, answer }) => getGroupInfo(identity, filters.groupBy).label === label && !answer.isSkipped && typeof answer.ratingValue === "number")
                  .map(({ answer }) => answer.ratingValue as number)
                  .sort((a, b) => a - b);
                const groupMean = groupValues.length ? groupValues.reduce((sum, value) => sum + value, 0) / groupValues.length : 0;
                return {
                  groupKey: label,
                  groupLabel: label,
                  mean: round(groupMean),
                  median: round(percentile(groupValues, 0.5)),
                  stdDev: round(stdDev(groupValues)),
                  count: groupValues.length,
                };
              })
            : undefined;

          questionReports.push({
            ...buildBaseQuestionMeta(question.id, question.title, question.type, values.length, completedResponses, "line"),
            questionId: question.id,
            title: question.title,
            type: question.type,
            rating: {
              mean: round(mean),
              median: round(percentile(values, 0.5)),
              stdDev: round(stdDev(values)),
              distribution,
            },
            groupedRating,
            diagnostics: buildDiagnostics(answers, completedResponses),
          });
          continue;
        }

        if (question.type === "matrix_single_choice") {
          const matrix = question.matrix;
          if (!matrix) {
            questionReports.push({
              ...buildBaseQuestionMeta(question.id, question.title, question.type, 0, completedResponses, "table"),
              questionId: question.id,
              title: question.title,
              type: question.type,
              matrixSingleChoice: { rows: [] },
            });
            continue;
          }

          const rows = matrix.rows.map((row) => {
            const rowAnswers = answers.flatMap(({ identity, answer }) => {
              if (answer.isSkipped) return [];
              const matrixAnswer = answer.matrixAnswers.find((item) => item.rowId === row.id);
              return matrixAnswer ? [{ identity, selectedOptionIds: matrixAnswer.selectedOptionIds }] : [];
            });
            const responseCount = rowAnswers.length;

            const columns = matrix.columns.map((column) => {
              const count = rowAnswers.filter((item) => item.selectedOptionIds.includes(column.id)).length;
              return {
                columnId: column.id,
                label: column.label,
                count,
                percentage: responseCount ? round((count / responseCount) * 100) : 0,
              };
            });

            const groupedColumns = filters.groupBy
              ? Object.fromEntries(
                  matrix.columns.map((column) => [
                    column.id,
                    Array.from(grouped.entries()).map(([label, total]) => {
                      const count = rowAnswers.filter((item) => {
                        return getGroupInfo(item.identity, filters.groupBy).label === label && item.selectedOptionIds.includes(column.id);
                      }).length;

                      return {
                        groupKey: label,
                        groupLabel: label,
                        count,
                        percentage: total ? round((count / total) * 100) : 0,
                      };
                    }),
                  ]),
                )
              : undefined;

            return {
              rowId: row.id,
              rowLabel: row.label,
              responses: responseCount,
              columns,
              groupedColumns,
            };
          });

          questionReports.push({
            ...buildBaseQuestionMeta(question.id, question.title, question.type, answers.length, completedResponses, "stacked_bar"),
            questionId: question.id,
            title: question.title,
            type: question.type,
            matrixSingleChoice: { rows },
            diagnostics: buildDiagnostics(answers, completedResponses),
          });
          continue;
        }

        const openAnswers = answers
          .filter(({ answer }) => !answer.isSkipped)
          .map(({ answer }) => answer.textAnswer ?? answer.otherText ?? "")
          .filter(Boolean);
        const groupedOpenText = filters.groupBy
          ? Array.from(grouped.keys()).map((label) => {
              const groupAnswers = answers
                .filter(({ identity, answer }) => getGroupInfo(identity, filters.groupBy).label === label && !answer.isSkipped)
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
          ...buildBaseQuestionMeta(question.id, question.title, question.type, openAnswers.length, completedResponses, "none"),
            questionId: question.id,
            title: question.title,
            type: question.type,
            openText: { answers: openAnswers, keywords: [] },
            groupedOpenText,
            diagnostics: buildDiagnostics(answers, completedResponses),
          });
      }
    }

    return {
      runId: run.id,
      filters,
      totalResponses: participants.filter((participant) => participant.responseStatus === "COMPLETED").length,
      groupedBy: filters.groupBy,
      groups: Array.from(grouped.entries()).map(([label, count]) => ({ key: label, label, count })),
      questions: questionReports,
    };
  }
}
