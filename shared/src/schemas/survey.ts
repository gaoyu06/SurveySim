import { z } from "zod";

export const questionTypeSchema = z.enum([
  "single_choice",
  "multi_choice",
  "single_choice_other",
  "multi_choice_other",
  "rating",
  "open_text",
  "paragraph",
  "section_title",
  "respondent_instruction",
]);

export const surveyOptionSchema = z.object({
  id: z.string(),
  label: z.string().min(1),
  value: z.string().min(1),
  displayOrder: z.number().int(),
  allowOther: z.boolean().optional(),
});

export const surveyValidationSchema = z.object({
  minSelections: z.number().int().optional(),
  maxSelections: z.number().int().optional(),
  minRating: z.number().optional(),
  maxRating: z.number().optional(),
  step: z.number().optional(),
  minLength: z.number().int().optional(),
  maxLength: z.number().int().optional(),
});

export const surveyQuestionSchema = z.object({
  id: z.string(),
  code: z.string().optional(),
  type: questionTypeSchema,
  title: z.string().min(1),
  description: z.string().optional(),
  required: z.boolean().default(false),
  displayOrder: z.number().int(),
  respondentInstructions: z.string().optional(),
  options: z.array(surveyOptionSchema).default([]),
  validation: surveyValidationSchema.optional(),
});

export const surveySectionSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  displayOrder: z.number().int(),
  questions: z.array(surveyQuestionSchema).default([]),
});

export const surveySchema = z.object({
  survey: z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    respondentInstructions: z.string().optional(),
    language: z.string().default("auto"),
  }),
  sections: z.array(surveySectionSchema).min(1),
});

export const surveyImportInputSchema = z.object({
  title: z.string().optional(),
  rawText: z.string().min(1),
  llmConfigId: z.string().optional(),
});

export const surveyDraftSchema = z.object({
  rawText: z.string(),
  schema: surveySchema,
  extractionNotes: z.array(z.string()).default([]),
});

export const surveySaveInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  rawText: z.string().min(1),
  schema: surveySchema,
});

export type SurveySchemaDto = z.infer<typeof surveySchema>;
export type SurveyDraft = z.infer<typeof surveyDraftSchema>;
export type SurveySaveInput = z.infer<typeof surveySaveInputSchema>;
