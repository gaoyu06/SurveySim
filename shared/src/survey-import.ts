import {
  surveySchema,
  type SurveyDraft,
  type SurveyImportJsonlRecord,
  type SurveyQuestionDto,
  type SurveySchemaDto,
} from "./schemas/survey.js";

function generateId(prefix: string) {
  const randomPart =
    globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10);
  return `${prefix}_${randomPart}`;
}

function withUniqueId(prefix: string, existingId?: string) {
  const normalized = existingId?.trim().replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  if (!normalized) {
    return generateId(prefix);
  }
  return `${prefix}_${normalized}`;
}

function normalizeQuestionRecord(
  record: Extract<SurveyImportJsonlRecord, { recordType: "question" }>,
  questionIndex: number,
): SurveyQuestionDto {
  return {
    id: record.id ?? generateId(`question_${questionIndex + 1}`),
    code: record.code,
    type: record.type,
    title: record.title,
    description: record.description,
    required: record.required ?? false,
    respondentInstructions: record.respondentInstructions,
    displayOrder: questionIndex,
    options: record.options.map((option, optionIndex) => ({
      id: option.id || generateId(`option_${questionIndex + 1}_${optionIndex + 1}`),
      label: option.label,
      value: option.value || option.label,
      allowOther: option.allowOther,
      displayOrder: optionIndex,
    })),
    matrix: record.matrix
      ? {
          selectionMode: record.matrix.selectionMode ?? "single_per_row",
          rows: record.matrix.rows.map((row, rowIndex) => ({
            id: row.id || generateId(`matrix_row_${questionIndex + 1}_${rowIndex + 1}`),
            label: row.label,
            description: row.description,
            displayOrder: rowIndex,
          })),
          columns: record.matrix.columns.map((column, columnIndex) => ({
            id: column.id || generateId(`matrix_col_${questionIndex + 1}_${columnIndex + 1}`),
            label: column.label,
            value: column.value || column.label,
            displayOrder: columnIndex,
          })),
        }
      : undefined,
    validation: record.validation ? { ...record.validation } : undefined,
  };
}

export function createEmptySurveyDraft(rawText: string, fallbackTitle?: string): SurveyDraft {
  return {
    rawText,
    extractionNotes: [],
    schema: {
      survey: {
        scenarioType: "survey",
        title: fallbackTitle ?? "Imported Content Task",
        language: "auto",
      },
      sections: [],
    },
  };
}

export function applySurveyImportRecordToDraft(draft: SurveyDraft, record: SurveyImportJsonlRecord): SurveyDraft {
  const nextDraft = structuredClone(draft);

  if (record.recordType === "survey_meta") {
    nextDraft.schema.survey = {
      scenarioType: record.scenarioType ?? nextDraft.schema.survey.scenarioType ?? "survey",
      title: record.title,
      description: record.description,
      subject: record.subject,
      taskInstructions: record.taskInstructions,
      respondentInstructions: record.respondentInstructions,
      language: record.language ?? nextDraft.schema.survey.language ?? "auto",
    };
    return nextDraft;
  }

  if (record.recordType === "section") {
    nextDraft.schema.sections.push({
      id: record.id ?? generateId(`section_${nextDraft.schema.sections.length + 1}`),
      title: record.title,
      description: record.description,
      displayOrder: nextDraft.schema.sections.length,
      questions: [],
    });
    return nextDraft;
  }

  const questionCount = nextDraft.schema.sections.reduce((sum, section) => sum + section.questions.length, 0);
  const question = normalizeQuestionRecord(record, questionCount);
  const desiredSectionTitle = record.sectionTitle?.trim();
  let section = desiredSectionTitle
    ? nextDraft.schema.sections.find((item) => item.title.trim().toLowerCase() === desiredSectionTitle.toLowerCase())
    : nextDraft.schema.sections[nextDraft.schema.sections.length - 1];

  if (!section) {
    section = {
      id: generateId(`section_${nextDraft.schema.sections.length + 1}`),
      title: desiredSectionTitle || `Section ${nextDraft.schema.sections.length + 1}`,
      description: undefined,
      displayOrder: nextDraft.schema.sections.length,
      questions: [],
    };
    nextDraft.schema.sections.push(section);
  }

  section.questions.push({
    ...question,
    displayOrder: section.questions.length,
  });

  return nextDraft;
}

export function ensureSurveySchemaIds(schema: SurveySchemaDto): SurveySchemaDto {
  return {
    survey: { ...schema.survey, scenarioType: schema.survey.scenarioType ?? "survey" },
    sections: schema.sections.map((section, sectionIndex) => ({
      ...section,
      id: withUniqueId(`section_${sectionIndex + 1}`, section.id),
      displayOrder: section.displayOrder ?? sectionIndex,
      questions: section.questions.map((question, questionIndex) => {
        const questionId = withUniqueId(`question_${sectionIndex + 1}_${questionIndex + 1}`, question.id);
        return {
          ...question,
          id: questionId,
          displayOrder: question.displayOrder ?? questionIndex,
          options: question.options.map((option, optionIndex) => ({
            ...option,
            id: withUniqueId(`${questionId}_option_${optionIndex + 1}`, option.id),
            displayOrder: option.displayOrder ?? optionIndex,
            value: option.value || option.label,
          })),
          matrix: question.matrix
            ? {
                selectionMode: question.matrix.selectionMode ?? "single_per_row",
                rows: question.matrix.rows.map((row, rowIndex) => ({
                  ...row,
                  id: withUniqueId(`${questionId}_row_${rowIndex + 1}`, row.id),
                  displayOrder: row.displayOrder ?? rowIndex,
                })),
                columns: question.matrix.columns.map((column, columnIndex) => ({
                  ...column,
                  id: withUniqueId(`${questionId}_column_${columnIndex + 1}`, column.id),
                  displayOrder: column.displayOrder ?? columnIndex,
                  value: column.value || column.label,
                })),
              }
            : undefined,
        };
      }),
    })),
  };
}

export function finalizeSurveyDraft(draft: SurveyDraft, fallbackTitle?: string): SurveyDraft {
  const nextDraft = structuredClone(draft);

  if (!nextDraft.schema.sections.length) {
    nextDraft.schema.sections.push({
      id: generateId("section_1"),
      title: "Section 1",
      displayOrder: 0,
      questions: [],
    });
  }

  if (!nextDraft.schema.survey.title?.trim()) {
    nextDraft.schema.survey.title = fallbackTitle ?? "Imported Content Task";
  }

  return {
    rawText: nextDraft.rawText,
    extractionNotes: [...nextDraft.extractionNotes],
    schema: ensureSurveySchemaIds(surveySchema.parse(nextDraft.schema)),
  };
}

export const createEmptyContentTaskDraft = createEmptySurveyDraft;
export const applyContentTaskImportRecordToDraft = applySurveyImportRecordToDraft;
export const ensureContentTaskSchemaIds = ensureSurveySchemaIds;
export const finalizeContentTaskDraft = finalizeSurveyDraft;
