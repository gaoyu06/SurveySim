import { z } from "zod";

export const reportFilterSchema = z.object({
  attributes: z.record(z.string(), z.union([z.string(), z.array(z.string())])).default({}),
  groupBy: z.string().optional(),
});

export const questionReportSchema = z.object({
  questionId: z.string(),
  title: z.string(),
  type: z.string(),
  singleChoice: z.array(z.object({ label: z.string(), count: z.number().int(), percentage: z.number() })).optional(),
  multiChoice: z.array(z.object({ label: z.string(), count: z.number().int(), percentage: z.number() })).optional(),
  rating: z.object({ mean: z.number(), median: z.number(), stdDev: z.number(), distribution: z.array(z.object({ label: z.string(), count: z.number().int() })) }).optional(),
  openText: z.object({ answers: z.array(z.string()), summary: z.string().optional(), keywords: z.array(z.string()).default([]) }).optional(),
});

export const reportSchema = z.object({
  runId: z.string(),
  filters: reportFilterSchema,
  totalResponses: z.number().int(),
  groupedBy: z.string().optional(),
  groups: z.array(z.object({ key: z.string(), label: z.string(), count: z.number().int() })).default([]),
  questions: z.array(questionReportSchema),
});

export type ReportFilter = z.infer<typeof reportFilterSchema>;
export type ReportDto = z.infer<typeof reportSchema>;
