import { surveyImportJsonlRecordSchema } from "@surveysim/shared";
import { buildJsonFixerPrompt, renderSchemaGuide } from "./prompt-support/schema-text.js";
import { renderPromptSections } from "./prompt-support/prompt-sections.js";

export function buildSurveyRepairJsonlRecordTask(input: {
  rawText: string;
  invalidLine: string;
  errorMessage: string;
}) {
  return {
    messages: [
      {
        role: "system" as const,
        content: [
          "You repair one invalid questionnaire JSONL record for SurveySim.",
          "Return exactly one corrected JSON object only.",
          "The corrected object must use the exact schema field names with no alias keys.",
          "Do not explain the fix. Do not wrap in markdown.",
        ].join(" "),
      },
      {
        role: "user" as const,
        content: renderPromptSections([
          {
            title: "Task",
            lines: [
              "Repair the invalid questionnaire record so it matches the required schema.",
              "Keep the repaired content faithful to the questionnaire source.",
              "Prefer the smallest valid correction. Do not rewrite unrelated content.",
            ],
          },
          {
            title: "Forbidden Alias Keys",
            lines: [
              "record_type",
              "question_type",
              "prompt",
              "question_id",
              "survey_id",
              "source_language",
            ],
          },
          {
            title: "Required Key Names",
            lines: [
              "Use recordType, not record_type.",
              "Use type, not question_type.",
              "Use title, not prompt.",
              "Use id, not question_id or survey_id.",
              "For matrix_single_choice, use matrix.rows and matrix.columns for the table structure.",
              "For non-matrix questions, omit matrix.",
            ],
          },
          {
            title: "Question Type Repair Rules",
            lines: [
              "If the repaired record is single_choice or multi_choice, ensure options is a valid array of option objects.",
              "If the repaired record is single_choice_other or multi_choice_other, keep options and use allowOther only on the relevant option.",
              "If the repaired record is rating, options should usually be an empty array and the numeric scale should be represented with validation.minRating, validation.maxRating, and validation.step when known.",
              "If the repaired record is open_text, paragraph, section_title, or respondent_instruction, options should be an empty array.",
              "If the repaired record is matrix_single_choice, options should usually be an empty array and the row/column structure must be inside matrix.",
              "Do not output empty placeholder objects such as matrix:{} or validation:{}.",
            ],
          },
          {
            title: "Repair Priorities",
            lines: [
              "Priority 1: make the object valid JSON.",
              "Priority 2: use the exact canonical field names.",
              "Priority 3: ensure the recordType-specific required fields exist.",
              "Priority 4: remove fields that do not belong to this record.",
            ],
          },
          {
            title: "Schema",
            lines: [renderSchemaGuide("SurveyImportJsonlRecord", surveyImportJsonlRecordSchema)],
          },
          {
            title: "Repair Examples",
            lines: [
              'Bad: {"record_type":"survey_meta","survey_id":"survey_1","title":"未命名问卷","source_language":"zh"}',
              'Good: {"recordType":"survey_meta","title":"未命名问卷","language":"zh"}',
              'Bad: {"record_type":"question","question_type":"single_choice","prompt":"你喜欢吃苹果吗"}',
              'Good: {"recordType":"question","id":"q1","type":"single_choice","title":"你喜欢吃苹果吗","options":[{"id":"opt_1","label":"喜欢","value":"喜欢"},{"id":"opt_2","label":"不喜欢","value":"不喜欢"}]}',
              'Bad rating: {"recordType":"question","id":"q2","type":"rating","title":"请打分","options":[{"id":"1","label":"1","value":"1"}]}',
              'Good rating: {"recordType":"question","id":"q2","type":"rating","title":"请打分","options":[],"validation":{"minRating":1,"maxRating":5,"step":1}}',
              'Good matrix: {"recordType":"question","id":"q2","type":"matrix_single_choice","title":"对于以下情节，您的兴趣程度如何？","options":[],"matrix":{"selectionMode":"single_per_row","rows":[{"id":"row_1","label":"商业竞争"}],"columns":[{"id":"col_1","label":"非常感兴趣","value":"非常感兴趣"},{"id":"col_2","label":"一般","value":"一般"}]}}',
            ],
          },
          {
            title: "Repair Checklist",
            lines: [
              "Ensure recordType is one of survey_meta, section, question.",
              "Remove unsupported alias fields completely.",
              "Rename alias fields to the canonical schema keys.",
              "If recordType is question, ensure both type and title exist.",
              "If recordType is question, ensure the field set matches the repaired question type.",
              "If type is matrix_single_choice, ensure matrix exists with rows and columns.",
              "Return exactly one JSON object and nothing else.",
            ],
          },
          {
            title: "Validation Error",
            lines: [input.errorMessage],
          },
          {
            title: "Invalid Record",
            lines: [input.invalidLine],
          },
          {
            title: "Questionnaire Source",
            lines: [input.rawText],
          },
        ]),
      },
    ],
    fixerPrompt: buildJsonFixerPrompt("SurveyImportJsonlRecord", surveyImportJsonlRecordSchema),
  };
}
