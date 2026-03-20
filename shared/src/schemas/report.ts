import { z } from "zod";

export const reportFilterSchema = z.object({
  attributes: z.record(z.string(), z.union([z.string(), z.array(z.string())])).default({}),
  groupBy: z.string().optional(),
});

export const reportComparisonInputSchema = z.object({
  runIds: z.array(z.string()).min(2),
  attributes: z.record(z.string(), z.union([z.string(), z.array(z.string())])).default({}),
  groupBy: z.string().optional(),
});

export const groupedChoiceMetricSchema = z.object({
  groupKey: z.string(),
  groupLabel: z.string(),
  count: z.number().int(),
  percentage: z.number(),
});

export const groupedRatingMetricSchema = z.object({
  groupKey: z.string(),
  groupLabel: z.string(),
  mean: z.number(),
  median: z.number(),
  stdDev: z.number(),
  count: z.number().int(),
});

export const groupedOpenTextMetricSchema = z.object({
  groupKey: z.string(),
  groupLabel: z.string(),
  count: z.number().int(),
  sampleAnswers: z.array(z.string()).default([]),
});

export const matrixChoiceMetricSchema = z.object({
  columnId: z.string(),
  label: z.string(),
  count: z.number().int(),
  percentage: z.number(),
});

export const groupedMatrixChoiceMetricSchema = z.object({
  groupKey: z.string(),
  groupLabel: z.string(),
  count: z.number().int(),
  percentage: z.number(),
});

export const matrixRowReportSchema = z.object({
  rowId: z.string(),
  rowLabel: z.string(),
  responses: z.number().int(),
  columns: z.array(matrixChoiceMetricSchema),
  groupedColumns: z.record(z.string(), z.array(groupedMatrixChoiceMetricSchema)).optional(),
});

export const questionReportSchema = z.object({
  questionId: z.string(),
  title: z.string(),
  type: z.string(),
  singleChoice: z.array(z.object({ label: z.string(), count: z.number().int(), percentage: z.number() })).optional(),
  multiChoice: z.array(z.object({ label: z.string(), count: z.number().int(), percentage: z.number() })).optional(),
  rating: z
    .object({
      mean: z.number(),
      median: z.number(),
      stdDev: z.number(),
      distribution: z.array(z.object({ label: z.string(), count: z.number().int() })),
    })
    .optional(),
  openText: z.object({ answers: z.array(z.string()), summary: z.string().optional(), keywords: z.array(z.string()).default([]) }).optional(),
  matrixSingleChoice: z
    .object({
      rows: z.array(matrixRowReportSchema),
    })
    .optional(),
  groupedSingleChoice: z.record(z.string(), z.array(groupedChoiceMetricSchema)).optional(),
  groupedMultiChoice: z.record(z.string(), z.array(groupedChoiceMetricSchema)).optional(),
  groupedRating: z.array(groupedRatingMetricSchema).optional(),
  groupedOpenText: z.array(groupedOpenTextMetricSchema).optional(),
});

const reportGroupSchema = z.object({
  key: z.string(),
  label: z.string(),
  count: z.number().int(),
});

export const reportSchema = z.object({
  runId: z.string(),
  filters: reportFilterSchema,
  totalResponses: z.number().int(),
  groupedBy: z.string().optional(),
  groups: z.array(reportGroupSchema).default([]),
  questions: z.array(questionReportSchema),
});

export const reportComparisonRunSchema = z.object({
  runId: z.string(),
  runName: z.string(),
  surveyId: z.string(),
  totalResponses: z.number().int(),
  groupedBy: z.string().optional(),
  groups: z.array(reportGroupSchema).default([]),
  questions: z.array(questionReportSchema),
});

export const reportComparisonSchema = z.object({
  runIds: z.array(z.string()).min(2),
  filters: reportFilterSchema,
  groupedBy: z.string().optional(),
  runs: z.array(reportComparisonRunSchema),
});

export type ReportFilter = z.infer<typeof reportFilterSchema>;
export type ReportDto = z.infer<typeof reportSchema>;
export type ReportComparisonInput = z.infer<typeof reportComparisonInputSchema>;
export type ReportComparisonDto = z.infer<typeof reportComparisonSchema>;
