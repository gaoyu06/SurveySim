import { z } from "zod";

export const contentScenarioTypeSchema = z.enum(["survey", "rating_task", "opinion_task"]);

export const questionTypeSchema = z.enum([
  "single_choice",
  "multi_choice",
  "single_choice_other",
  "multi_choice_other",
  "matrix_single_choice",
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

export const surveyMatrixRowSchema = z.object({
  id: z.string(),
  label: z.string().min(1),
  description: z.string().optional(),
  displayOrder: z.number().int(),
});

export const surveyMatrixColumnSchema = z.object({
  id: z.string(),
  label: z.string().min(1),
  value: z.string().min(1),
  displayOrder: z.number().int(),
});

export const surveyMatrixSchema = z.object({
  selectionMode: z.literal("single_per_row").default("single_per_row"),
  rows: z.array(surveyMatrixRowSchema).default([]),
  columns: z.array(surveyMatrixColumnSchema).default([]),
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
  matrix: surveyMatrixSchema.optional(),
  validation: surveyValidationSchema.optional(),
});

export const surveySectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  displayOrder: z.number().int(),
  questions: z.array(surveyQuestionSchema).default([]),
});

export const surveySchema = z.object({
  survey: z.object({
    scenarioType: contentScenarioTypeSchema.default("survey"),
    title: z.string().min(1),
    description: z.string().optional(),
    subject: z.string().optional(),
    taskInstructions: z.string().optional(),
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

export const surveyImportJsonlRecordSchema = z.discriminatedUnion("recordType", [
  z.object({
    recordType: z.literal("survey_meta"),
    scenarioType: contentScenarioTypeSchema.optional(),
    title: z.string().min(1),
    description: z.string().optional(),
    subject: z.string().optional(),
    taskInstructions: z.string().optional(),
    respondentInstructions: z.string().optional(),
    language: z.string().optional(),
  }),
  z.object({
    recordType: z.literal("section"),
    id: z.string().optional(),
    title: z.string().min(1),
    description: z.string().optional(),
  }),
  z.object({
    recordType: z.literal("question"),
    id: z.string().optional(),
    code: z.string().optional(),
    sectionTitle: z.string().optional(),
    type: questionTypeSchema,
    title: z.string().min(1),
    description: z.string().optional(),
    required: z.boolean().optional(),
    respondentInstructions: z.string().optional(),
    options: z.array(surveyOptionSchema.omit({ displayOrder: true })).default([]),
    matrix: z
      .object({
        selectionMode: z.literal("single_per_row").optional(),
        rows: z
          .array(
            z.object({
              id: z.string(),
              label: z.string().min(1),
              description: z.string().optional(),
            }),
          )
          .default([]),
        columns: z
          .array(
            z.object({
              id: z.string(),
              label: z.string().min(1),
              value: z.string().min(1),
            }),
          )
          .default([]),
      })
      .optional(),
    validation: surveyValidationSchema.optional(),
  }),
]);

export const surveyImportRecordEventSchema = z.object({
  type: z.literal("record"),
  index: z.number().int().min(1),
  status: z.enum(["validated", "repaired", "skipped"]),
  record: surveyImportJsonlRecordSchema.optional(),
  recordType: z.enum(["survey_meta", "section", "question"]).optional(),
  questionType: questionTypeSchema.optional(),
  title: z.string().optional(),
  summary: z.string().optional(),
  rawLine: z.string(),
  repairedLine: z.string().optional(),
  message: z.string().optional(),
});

export const surveyImportStreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("status"),
    stage: z.enum(["queued", "extracting", "validating", "repairing", "normalizing", "completed", "interrupted"]),
    message: z.string(),
  }),
  z.object({
    type: z.literal("delta"),
    chunk: z.string(),
  }),
  surveyImportRecordEventSchema,
  z.object({
    type: z.literal("draft"),
    draft: surveyDraftSchema,
  }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
  }),
]);

export const surveyImportRetryRecordInputSchema = z.object({
  rawText: z.string().min(1),
  invalidLine: z.string().min(1),
  errorMessage: z.string().optional(),
  llmConfigId: z.string().optional(),
  index: z.number().int().min(1),
});

export const surveySaveInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  rawText: z.string().min(1),
  schema: surveySchema,
});

export const contentTaskSchema = surveySchema;
export const contentTaskImportInputSchema = surveyImportInputSchema;
export const contentTaskDraftSchema = surveyDraftSchema;
export const contentTaskImportJsonlRecordSchema = surveyImportJsonlRecordSchema;
export const contentTaskImportRecordEventSchema = surveyImportRecordEventSchema;
export const contentTaskImportStreamEventSchema = surveyImportStreamEventSchema;
export const contentTaskImportRetryRecordInputSchema = surveyImportRetryRecordInputSchema;
export const contentTaskSaveInputSchema = surveySaveInputSchema;

export type SurveySchemaDto = z.infer<typeof surveySchema>;
export type SurveyQuestionDto = z.infer<typeof surveyQuestionSchema>;
export type SurveyDraft = z.infer<typeof surveyDraftSchema>;
export type SurveySaveInput = z.infer<typeof surveySaveInputSchema>;
export type SurveyImportStreamEvent = z.infer<typeof surveyImportStreamEventSchema>;
export type SurveyImportJsonlRecord = z.infer<typeof surveyImportJsonlRecordSchema>;
export type SurveyImportRecordEvent = z.infer<typeof surveyImportRecordEventSchema>;

export type ContentScenarioType = z.infer<typeof contentScenarioTypeSchema>;
export type ContentTaskSchemaDto = SurveySchemaDto;
export type ContentTaskQuestionDto = SurveyQuestionDto;
export type ContentTaskDraft = SurveyDraft;
export type ContentTaskSaveInput = SurveySaveInput;
export type ContentTaskImportStreamEvent = SurveyImportStreamEvent;
export type ContentTaskImportJsonlRecord = SurveyImportJsonlRecord;
export type ContentTaskImportRecordEvent = SurveyImportRecordEvent;
