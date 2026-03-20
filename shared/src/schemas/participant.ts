import { z } from "zod";

const scalarValueSchema = z.union([z.string(), z.number(), z.boolean()]);
const listValueSchema = z.array(z.string());

export const conditionOperatorSchema = z.enum(["eq", "neq", "in", "not_in", "contains", "gt", "gte", "lt", "lte"]);

export const leafConditionSchema = z.object({
  type: z.literal("leaf"),
  field: z.string().min(1),
  operator: conditionOperatorSchema,
  value: z.union([scalarValueSchema, listValueSchema]),
});

export const conditionExpressionSchema: z.ZodType<any> = z.lazy(() =>
  z.union([
    leafConditionSchema,
    z.object({
      type: z.literal("group"),
      combinator: z.enum(["AND", "OR"]),
      children: z.array(conditionExpressionSchema).min(1),
    }),
  ]),
);

export const distributionItemSchema = z.object({
  value: z.union([z.string(), z.array(z.string())]),
  percentage: z.number().min(0).max(100),
  label: z.string().optional(),
});

export const ruleAssignmentSchema = z.object({
  attribute: z.string().min(1),
  mode: z.enum(["distribution", "fixed"]),
  fixedValue: z.union([scalarValueSchema, listValueSchema]).optional(),
  distribution: z.array(distributionItemSchema).optional(),
});

export const participantRuleInputSchema = z.object({
  name: z.string().min(1).max(120),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(0).max(1000),
  scope: conditionExpressionSchema.optional(),
  assignment: ruleAssignmentSchema,
  note: z.string().max(500).optional(),
});

export const participantRuleSchema = participantRuleInputSchema.extend({
  id: z.string(),
  templateId: z.string(),
});

export const participantTemplateInputSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  dimensions: z.array(z.string()).default([]),
  sampleSizePreview: z.number().int().min(10).max(5000).default(200),
});

export const participantTemplateSchema = participantTemplateInputSchema.extend({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  rules: z.array(participantRuleSchema),
});

export const participantIdentitySchema = z.object({
  region: z.string().optional(),
  country: z.string().optional(),
  continent: z.string().optional(),
  gender: z.string().optional(),
  ageRange: z.string().optional(),
  educationLevel: z.string().optional(),
  occupation: z.string().optional(),
  incomeRange: z.string().optional(),
  interests: z.array(z.string()).default([]),
  maritalStatus: z.string().optional(),
  customTags: z.array(z.string()).default([]),
  noise: z.record(z.string(), z.unknown()).default({}),
  extra: z.record(z.string(), z.unknown()).default({}),
});

export const templatePreviewSchema = z.object({
  sampleSize: z.number().int(),
  attributeDistributions: z.record(z.string(), z.array(z.object({ label: z.string(), count: z.number().int(), percentage: z.number() }))),
  conflicts: z.array(z.object({ ruleIds: z.array(z.string()), message: z.string(), severity: z.enum(["warning", "error"]) })),
});

export type ConditionExpression = z.infer<typeof conditionExpressionSchema>;
export type ParticipantRuleInput = z.infer<typeof participantRuleInputSchema>;
export type ParticipantTemplateInput = z.infer<typeof participantTemplateInputSchema>;
export type ParticipantIdentity = z.infer<typeof participantIdentitySchema>;
export type ParticipantTemplateDto = z.infer<typeof participantTemplateSchema>;
export type TemplatePreview = z.infer<typeof templatePreviewSchema>;
