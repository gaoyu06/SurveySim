import { z } from "zod";
import { participantIdentitySchema } from "./participant.js";
import { surveySchema } from "./survey.js";

export const runStageSchema = z.enum(["identity", "persona", "response"]);
export const runStatusSchema = z.enum(["draft", "queued", "running", "completed", "failed", "canceling", "canceled"]);
export const participantRunStatusSchema = z.enum(["pending", "running", "completed", "failed", "skipped", "canceled"]);
export const mockRunStartModeSchema = z.enum(["continue", "restart"]);

export const structuredAnswerSchema = z.object({
  questionId: z.string(),
  selectedOptionIds: z.array(z.string()).default([]),
  matrixAnswers: z
    .array(
      z.object({
        rowId: z.string(),
        selectedOptionIds: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  otherText: z.string().optional(),
  ratingValue: z.number().optional(),
  textAnswer: z.string().optional(),
  isSkipped: z.boolean().optional(),
  skipReason: z.enum(["optional", "uncertain", "fatigue", "not_applicable"]).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const mockRunCreateBaseSchema = z.object({
  name: z.string().min(1).max(120),
  participantTemplateId: z.string(),
  contentTaskId: z.string().min(1),
  llmConfigId: z.string(),
  participantCount: z.number().int().min(1).max(1000),
  concurrency: z.number().int().min(1).max(64),
  reuseIdentity: z.boolean().default(false),
  reusePersonaPrompt: z.boolean().default(false),
  extraSystemPrompt: z.string().optional(),
  extraRespondentPrompt: z.string().optional(),
});

export const mockRunCreateInputSchema = z.union([
  mockRunCreateBaseSchema,
  mockRunCreateBaseSchema.omit({ contentTaskId: true }).extend({ surveyId: z.string().min(1) }),
]).transform((value) => ({
  ...value,
  contentTaskId: "contentTaskId" in value ? value.contentTaskId : value.surveyId,
  surveyId: "surveyId" in value ? value.surveyId : value.contentTaskId,
}));

export const mockRunStartInputSchema = z.object({
  mode: mockRunStartModeSchema.default("restart"),
});

export const mockRunAppendInputSchema = z.object({
  additionalCount: z.number().int().min(1).max(1000),
});

export const participantInstanceSchema = z.object({
  id: z.string(),
  ordinal: z.number().int(),
  status: participantRunStatusSchema,
  identity: participantIdentitySchema,
  progressPercent: z.number().int().min(0).max(100).optional(),
  personaPrompt: z.string().optional(),
  personaStatus: participantRunStatusSchema.optional(),
  responseStatus: participantRunStatusSchema.optional(),
  errorMessage: z.string().optional(),
});

export const mockRunProgressSchema = z.object({
  total: z.number().int(),
  identityCompleted: z.number().int(),
  personaCompleted: z.number().int(),
  responseCompleted: z.number().int(),
  failed: z.number().int(),
  canceled: z.number().int(),
});

export const mockRunSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(120),
  ownerId: z.string().optional(),
  ownerEmail: z.string().email().optional(),
  isOwnedByCurrentUser: z.boolean().optional(),
  participantTemplateId: z.string(),
  contentTaskId: z.string(),
  surveyId: z.string(),
  llmConfigId: z.string(),
  participantCount: z.number().int().min(1).max(1000),
  concurrency: z.number().int().min(1).max(64),
  reuseIdentity: z.boolean(),
  reusePersonaPrompt: z.boolean(),
  extraSystemPrompt: z.string().optional(),
  extraRespondentPrompt: z.string().optional(),
  status: runStatusSchema,
  progress: mockRunProgressSchema,
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  canceledAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const personaGenerationPayloadSchema = z.union([
  z.object({
    identity: participantIdentitySchema,
    contentTask: surveySchema,
    extraPrompt: z.string().optional(),
  }),
  z.object({
    identity: participantIdentitySchema,
    survey: surveySchema,
    extraPrompt: z.string().optional(),
  }),
]).transform((value) => ({
  identity: value.identity,
  contentTask: "contentTask" in value ? value.contentTask : value.survey,
  survey: "survey" in value ? value.survey : value.contentTask,
  extraPrompt: value.extraPrompt,
}));

export const responseGenerationPayloadSchema = z.union([
  z.object({
    contentTask: surveySchema,
    identity: participantIdentitySchema,
    personaPrompt: z.string(),
    extraSystemPrompt: z.string().optional(),
    extraRespondentPrompt: z.string().optional(),
  }),
  z.object({
    survey: surveySchema,
    identity: participantIdentitySchema,
    personaPrompt: z.string(),
    extraSystemPrompt: z.string().optional(),
    extraRespondentPrompt: z.string().optional(),
  }),
]).transform((value) => ({
  contentTask: "contentTask" in value ? value.contentTask : value.survey,
  survey: "survey" in value ? value.survey : value.contentTask,
  identity: value.identity,
  personaPrompt: value.personaPrompt,
  extraSystemPrompt: value.extraSystemPrompt,
  extraRespondentPrompt: value.extraRespondentPrompt,
}));

export type MockRunCreateInput = z.infer<typeof mockRunCreateInputSchema>;
export type MockRunStartInput = z.infer<typeof mockRunStartInputSchema>;
export type MockRunAppendInput = z.infer<typeof mockRunAppendInputSchema>;
export type StructuredAnswer = z.infer<typeof structuredAnswerSchema>;
export type MockRunDto = z.infer<typeof mockRunSchema>;
