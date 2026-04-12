import { z } from "zod";

// ── Enums ──
export const evaluationStatusSchema = z.enum(["draft", "running", "completed", "failed"]);
export type EvaluationStatus = z.infer<typeof evaluationStatusSchema>;

// ── Evaluation dimensions ──
export const evaluationDimensionSchema = z.enum([
  "cultural_adaptation",
  "emotional_fidelity",
  "naturalness",
  "timing_rhythm",
  "character_voice",
  "localization_quality",
  "overall",
]);
export type EvaluationDimension = z.infer<typeof evaluationDimensionSchema>;

// ── Evaluator profile (simulated audience member) ──
export const evaluatorProfileSchema = z.object({
  name: z.string(),
  age: z.number(),
  gender: z.string(),
  culturalBackground: z.string(),
  viewingHabits: z.string(),
  evaluationFocus: z.string(),
});
export type EvaluatorProfile = z.infer<typeof evaluatorProfileSchema>;

// ── Per-dimension score from a single evaluator ──
export const evaluatorDimensionScoreSchema = z.object({
  dimension: evaluationDimensionSchema,
  score: z.number().min(1).max(10),
  reason: z.string(),
});
export type EvaluatorDimensionScore = z.infer<typeof evaluatorDimensionScoreSchema>;

// ── A single suggestion from an evaluator ──
export const evaluationSuggestionSchema = z.object({
  id: z.string(),
  evaluatorIndex: z.number(),
  location: z.string().optional(),
  originalText: z.string().optional(),
  suggestedText: z.string(),
  reason: z.string(),
});
export type EvaluationSuggestion = z.infer<typeof evaluationSuggestionSchema>;

// ── Full result from a single evaluator ──
export const evaluatorResultSchema = z.object({
  profile: evaluatorProfileSchema,
  dimensionScores: z.array(evaluatorDimensionScoreSchema),
  suggestions: z.array(evaluationSuggestionSchema),
  overallImpression: z.string(),
});
export type EvaluatorResult = z.infer<typeof evaluatorResultSchema>;

// ── Aggregate scores across all evaluators ──
export const evaluationAggregateSchema = z.object({
  cultural_adaptation: z.number(),
  emotional_fidelity: z.number(),
  naturalness: z.number(),
  timing_rhythm: z.number(),
  character_voice: z.number(),
  localization_quality: z.number(),
  overall: z.number(),
});
export type EvaluationAggregate = z.infer<typeof evaluationAggregateSchema>;

// ── Project input / output ──
export const translationProjectCreateInputSchema = z.object({
  title: z.string().min(1).max(200),
  dramaTheme: z.string().optional(),
  targetMarket: z.string().optional(),
  targetCulture: z.string().optional(),
  sourceLanguage: z.string().optional(),
  targetLanguage: z.string().optional(),
});
export type TranslationProjectCreateInput = z.infer<typeof translationProjectCreateInputSchema>;

export const translationProjectUpdateInputSchema = translationProjectCreateInputSchema.partial();
export type TranslationProjectUpdateInput = z.infer<typeof translationProjectUpdateInputSchema>;

export const translationProjectSchema = z.object({
  id: z.string(),
  title: z.string(),
  dramaTheme: z.string().nullable(),
  targetMarket: z.string().nullable(),
  targetCulture: z.string().nullable(),
  sourceLanguage: z.string().nullable(),
  targetLanguage: z.string().nullable(),
  versionCount: z.number(),
  latestVersion: z
    .object({
      id: z.string(),
      versionNumber: z.number(),
      createdAt: z.string(),
    })
    .nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TranslationProjectDto = z.infer<typeof translationProjectSchema>;

// ── Version input / output ──
export const translationVersionCreateInputSchema = z.object({
  sourceText: z.string().optional(),
  translatedText: z.string().min(1),
  parentVersionId: z.string().optional(),
});
export type TranslationVersionCreateInput = z.infer<typeof translationVersionCreateInputSchema>;

export const translationVersionSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  versionNumber: z.number(),
  sourceText: z.string().nullable(),
  translatedText: z.string(),
  parentVersionId: z.string().nullable(),
  changeSummary: z.string().nullable(),
  evaluations: z.array(
    z.object({
      id: z.string(),
      status: evaluationStatusSchema,
      evaluatorCount: z.number(),
      createdAt: z.string(),
    }),
  ),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TranslationVersionDto = z.infer<typeof translationVersionSchema>;

// ── Evaluation input / output ──
export const translationEvaluationStartInputSchema = z.object({
  evaluatorCount: z.number().int().min(1).max(20).default(5),
  concurrency: z.number().int().min(1).max(20).default(3),
  participantTemplateId: z.string().optional(),
  llmConfigId: z.string().optional(),
});
export type TranslationEvaluationStartInput = z.infer<typeof translationEvaluationStartInputSchema>;

export const translationEvaluationSchema = z.object({
  id: z.string(),
  versionId: z.string(),
  evaluatorCount: z.number(),
  status: evaluationStatusSchema,
  results: z.array(evaluatorResultSchema).nullable(),
  aggregateScores: evaluationAggregateSchema.nullable(),
  allSuggestions: z.array(evaluationSuggestionSchema).nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TranslationEvaluationDto = z.infer<typeof translationEvaluationSchema>;

// ── Auto-fix input ──
export const translationAutoFixInputSchema = z.object({
  selectedSuggestionIds: z.array(z.string()).min(1),
});
export type TranslationAutoFixInput = z.infer<typeof translationAutoFixInputSchema>;
