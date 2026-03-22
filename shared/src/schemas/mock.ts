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

export const mockRunCreateInputSchema = z.object({
  name: z.string().min(1).max(120),
  participantTemplateId: z.string(),
  surveyId: z.string(),
  llmConfigId: z.string(),
  participantCount: z.number().int().min(1).max(1000),
  concurrency: z.number().int().min(1).max(64),
  reuseIdentity: z.boolean().default(false),
  reusePersonaPrompt: z.boolean().default(false),
  extraSystemPrompt: z.string().optional(),
  extraRespondentPrompt: z.string().optional(),
});

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

export const mockRunSchema = mockRunCreateInputSchema.extend({
  id: z.string(),
  status: runStatusSchema,
  progress: mockRunProgressSchema,
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  canceledAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const personaGenerationPayloadSchema = z.object({
  identity: participantIdentitySchema,
  survey: surveySchema,
  extraPrompt: z.string().optional(),
});

export const responseGenerationPayloadSchema = z.object({
  survey: surveySchema,
  identity: participantIdentitySchema,
  personaPrompt: z.string(),
  extraSystemPrompt: z.string().optional(),
  extraRespondentPrompt: z.string().optional(),
});

export type MockRunCreateInput = z.infer<typeof mockRunCreateInputSchema>;
export type MockRunStartInput = z.infer<typeof mockRunStartInputSchema>;
export type MockRunAppendInput = z.infer<typeof mockRunAppendInputSchema>;
export type StructuredAnswer = z.infer<typeof structuredAnswerSchema>;
export type MockRunDto = z.infer<typeof mockRunSchema>;
