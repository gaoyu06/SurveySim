import { z } from "zod";
import { getBuiltinParticipantAttributes, normalizeParticipantAttributeKey } from "../constants.js";

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

export const participantAttributePresetValueSchema = z.object({
  value: z.string().min(1).transform((value) => normalizeParticipantAttributeKey(value)),
  label: z.string().min(1).max(120),
});

export const participantAttributeDefinitionSchema = z.object({
  key: z.string().min(1).transform((value) => normalizeParticipantAttributeKey(value)),
  displayName: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  valueType: z.enum(["single", "multi"]),
  presetValues: z.array(participantAttributePresetValueSchema).default([]),
  builtin: z.boolean().optional(),
});

export const participantArchetypeProfileSchema = z.object({
  label: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  scenarioContext: z.string().max(240).optional(),
  seedTags: z.array(z.string().min(1).max(80)).default([]),
  seedPrompt: z.string().max(2000).optional(),
});

export const participantRandomConfigSchema = z.object({
  seed: z.string().min(1).max(120).optional(),
  randomnessLevel: z.enum(["low", "medium", "high"]).default("medium"),
  noiseProfile: z.enum(["conservative", "balanced", "expressive"]).default("balanced"),
});

export const participantTemplateInputSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  archetypeProfile: participantArchetypeProfileSchema.optional(),
  attributes: z.array(participantAttributeDefinitionSchema).default(getBuiltinParticipantAttributes()),
  randomConfig: participantRandomConfigSchema.default({ randomnessLevel: "medium", noiseProfile: "balanced" }),
  sampleSizePreview: z.number().int().min(10).max(5000).default(200),
});

export const participantTemplateSchema = participantTemplateInputSchema.extend({
  id: z.string(),
  ownerId: z.string().optional(),
  ownerEmail: z.string().email().optional(),
  isOwnedByCurrentUser: z.boolean().optional(),
  isPublic: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
  rules: z.array(participantRuleSchema),
});

export const participantIdentitySchema = z
  .object({
    name: z.string().optional(),
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
    noise: z
      .object({
        languageStyle: z.string().optional(),
        decisiveness: z.number().min(0).max(1).optional(),
        lifeMoment: z.string().optional(),
        extremityBias: z.number().min(0).max(1).optional(),
        centralTendency: z.number().min(0).max(1).optional(),
        acquiescence: z.number().min(0).max(1).optional(),
        fatigue: z.number().min(0).max(1).optional(),
        attention: z.number().min(0).max(1).optional(),
        topicFamiliarity: z.number().min(0).max(1).optional(),
        socialDesirability: z.number().min(0).max(1).optional(),
        straightlining: z.number().min(0).max(1).optional(),
        noveltySeeking: z.number().min(0).max(1).optional(),
        skipOptionalRate: z.number().min(0).max(1).optional(),
        openTextVerbosity: z.number().min(0).max(1).optional(),
      })
      .catchall(z.unknown())
      .default({}),
    extra: z.record(z.string(), z.unknown()).default({}),
  })
  .passthrough();

export const templatePreviewSchema = z.object({
  sampleSize: z.number().int(),
  attributeDistributions: z.record(z.string(), z.array(z.object({ label: z.string(), count: z.number().int(), percentage: z.number() }))),
  conflicts: z.array(z.object({ ruleIds: z.array(z.string()), message: z.string(), severity: z.enum(["warning", "error"]) })),
});

export const participantTemplateAiGenerateInputSchema = z.object({
  prompt: z.string().min(1),
  archetypeProfile: participantArchetypeProfileSchema.optional(),
  attributes: z.array(participantAttributeDefinitionSchema).default([]),
  randomConfig: participantRandomConfigSchema.default({ randomnessLevel: "medium", noiseProfile: "balanced" }),
  llmConfigId: z.string().optional(),
  templateName: z.string().optional(),
  templateDescription: z.string().optional(),
});

export const participantTemplateAiGenerateResultSchema = z.object({
  template: participantTemplateInputSchema.pick({
    name: true,
    description: true,
    archetypeProfile: true,
    attributes: true,
    randomConfig: true,
    sampleSizePreview: true,
  }),
  rules: z.array(participantRuleInputSchema),
  notes: z.array(z.string()).default([]),
});

export const participantTemplateAiGenerateJsonlRecordSchema = z.discriminatedUnion("recordType", [
  z.object({
    recordType: z.literal("template"),
    name: z.string().min(1).max(120),
    description: z.string().max(1000).optional(),
    archetypeProfile: participantArchetypeProfileSchema.optional(),
    attributes: z.array(participantAttributeDefinitionSchema).default([]),
    randomConfig: participantRandomConfigSchema.default({ randomnessLevel: "medium", noiseProfile: "balanced" }),
    sampleSizePreview: z.number().int().min(10).max(5000).default(300),
  }),
  z.object({
    recordType: z.literal("rule"),
    name: z.string().min(1).max(120),
    enabled: z.boolean().default(true),
    priority: z.number().int().min(0).max(1000),
    scope: conditionExpressionSchema.optional(),
    assignment: ruleAssignmentSchema,
    note: z.string().max(500).optional(),
  }),
  z.object({
    recordType: z.literal("note"),
    text: z.string().min(1),
  }),
]);

export const participantTemplateAiGenerateRecordEventSchema = z.object({
  type: z.literal("record"),
  index: z.number().int().min(1),
  status: z.enum(["validated", "repaired", "skipped"]),
  record: participantTemplateAiGenerateJsonlRecordSchema.optional(),
  rawLine: z.string(),
  repairedLine: z.string().optional(),
  message: z.string().optional(),
});

export const participantTemplateAiGenerateStreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("status"),
    stage: z.enum(["queued", "generating", "validating", "repairing", "completed", "interrupted"]),
    message: z.string(),
    lines: z.number().int().min(0).optional(),
  }),
  participantTemplateAiGenerateRecordEventSchema,
  z.object({
    type: z.literal("result"),
    result: participantTemplateAiGenerateResultSchema,
  }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
  }),
]);

export const participantPublicVisibilityInputSchema = z.object({
  isPublic: z.boolean(),
});

export type ConditionExpression = z.infer<typeof conditionExpressionSchema>;
export type ParticipantRuleInput = z.infer<typeof participantRuleInputSchema>;
export type ParticipantTemplateInput = z.infer<typeof participantTemplateInputSchema>;
export type ParticipantIdentity = z.infer<typeof participantIdentitySchema>;
export type ParticipantTemplateDto = z.infer<typeof participantTemplateSchema>;
export type TemplatePreview = z.infer<typeof templatePreviewSchema>;
export type ParticipantAttributePresetValueDto = z.infer<typeof participantAttributePresetValueSchema>;
export type ParticipantAttributeDefinitionDto = z.infer<typeof participantAttributeDefinitionSchema>;
export type ParticipantArchetypeProfileDto = z.infer<typeof participantArchetypeProfileSchema>;
export type ParticipantRandomConfigDto = z.infer<typeof participantRandomConfigSchema>;
export type ParticipantTemplateAiGenerateInput = z.infer<typeof participantTemplateAiGenerateInputSchema>;
export type ParticipantTemplateAiGenerateResult = z.infer<typeof participantTemplateAiGenerateResultSchema>;
export type ParticipantTemplateAiGenerateJsonlRecord = z.infer<typeof participantTemplateAiGenerateJsonlRecordSchema>;
export type ParticipantTemplateAiGenerateRecordEvent = z.infer<typeof participantTemplateAiGenerateRecordEventSchema>;
export type ParticipantTemplateAiGenerateStreamEvent = z.infer<typeof participantTemplateAiGenerateStreamEventSchema>;
export type ParticipantPublicVisibilityInput = z.infer<typeof participantPublicVisibilityInputSchema>;
