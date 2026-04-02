import { questionTypeSchema, surveyImportJsonlRecordSchema } from "@surveysim/shared";
import { renderEnumValues, renderSchemaGuide } from "./prompt-support/schema-text.js";
import { renderPromptSections } from "./prompt-support/prompt-sections.js";

export function buildSurveyExtractJsonlTask(input: { rawText: string; title?: string }) {
  return {
    messages: [
      {
        role: "system" as const,
        content: [
          "You are a content-task extraction engine for SurveySim.",
          "Your job is to convert a questionnaire, rating task, or opinion task into JSONL records that exactly match the required schema.",
          "Return JSONL only. Each line must be exactly one JSON object. No prose. No markdown fences.",
          "Do not invent alternate key names. If a key is not in the schema, do not output it.",
          "Before emitting each line, verify the record uses the exact required field names and recordType values.",
          "Think record-by-record. Each line must independently validate against the schema before you emit the next line.",
        ].join(" "),
      },
      {
        role: "user" as const,
        content: renderPromptSections([
          {
            title: "Task",
            lines: [
              "Extract the content task into ordered JSONL records.",
              "The first line must be the survey_meta record, including scenarioType when it can be inferred.",
              "Emit a section record whenever the questionnaire enters a new section.",
              "Emit one question record per question or display block.",
              "Keep the source order exactly. Do not merge multiple questions into one record.",
              "If the source is ambiguous, prefer a simple valid record over a rich but invalid record.",
              input.title ? `Preferred survey title: ${input.title}` : undefined,
            ],
          },
          {
            title: "Critical Output Contract",
            lines: [
              "Every line must parse as one SurveyImportJsonlRecord object.",
              "Do not output record_type, question_type, prompt, question_id, survey_id, source_language, section_id, or any other alias fields.",
              "Only these top-level record types are allowed: survey_meta, section, question.",
              "For survey_meta use language, not source_language.",
              "For question records use title as the question text field.",
              "For question records use id as the identifier field.",
              "For question records, never omit type or title.",
              "For survey_meta and section records, never add question-only fields such as type, options, matrix, or validation.",
            ],
          },
          {
            title: "Canonical Record Shapes",
            lines: [
              'survey_meta shape => {"recordType":"survey_meta","scenarioType":"survey","title":"Task title","description":"Optional task description","subject":"Optional target object","taskInstructions":"Optional task-wide instructions","respondentInstructions":"Optional participant-wide instruction","language":"zh-CN"}',
              'section shape => {"recordType":"section","id":"section_1","title":"Section title","description":"Optional section description"}',
              'question base shape => {"recordType":"question","id":"q1","type":"single_choice","title":"Question text","options":[]}',
              "Only include optional fields when they are actually needed and valid.",
              "Never output empty placeholder objects such as matrix:{} or validation:{}.",
              "Do not output final survey JSON. Do not output top-level keys like survey, sections, questions, or schema.",
            ],
          },
          {
            title: "Required Key Names",
            lines: [
              "You must use the exact schema field names.",
              "Use recordType, not record_type.",
              "Use type, not question_type.",
              "Use title, not prompt.",
              "Use id, not question_id or survey_id.",
              "For question records the main text field is title.",
              "For question records the type field is type.",
              "For options use only id, label, value, and allowOther.",
              "For matrix questions use only matrix.selectionMode, matrix.rows, and matrix.columns.",
            ],
          },
          {
            title: "Question Type To Field Contract",
            lines: [
              "single_choice => use options; omit matrix; validation is usually omitted unless the source gives extra constraints.",
              "multi_choice => use options; omit matrix; use validation.minSelections or validation.maxSelections only when the source explicitly states a selection limit.",
              "single_choice_other => use options; mark the specific option with allowOther=true when the source clearly says that option allows additional text.",
              "multi_choice_other => use options; mark the specific option with allowOther=true when the source clearly says that option allows additional text.",
              "rating => options should usually be []; omit matrix; use validation.minRating, validation.maxRating, and validation.step when the source provides a scale.",
              "open_text => options must be []; omit matrix; validation.minLength and validation.maxLength are optional.",
              "paragraph => options must be []; omit matrix; omit validation.",
              "section_title => options must be []; omit matrix; omit validation.",
              "respondent_instruction => options must be []; omit matrix; omit validation.",
              "matrix_single_choice => options should be []; matrix is required; matrix.selectionMode must be 'single_per_row'; matrix.rows contains row prompts; matrix.columns contains selectable headers.",
            ],
          },
          {
            title: "Strict Omit Rules",
            lines: [
              "Omit matrix entirely for any non-matrix question.",
              "Omit validation entirely when the source does not state a concrete rule or scale.",
              "Omit allowOther unless the source explicitly supports an extra free-text input for that option.",
              "Do not output empty arrays or objects just because a field is optional in some other question type.",
            ],
          },
          {
            title: "Question Type Decision Guide",
            lines: [
              "Use single_choice when exactly one answer can be chosen from listed options.",
              "Use multi_choice when multiple answers can be chosen from listed options.",
              "Use single_choice_other or multi_choice_other only when the source explicitly includes an 'other, please specify' style input.",
              "Use rating when the participant gives a numeric or scaled score to an object, article, or experience.",
              "Use open_text when the participant writes an opinion, rationale, or free-text response.",
              "Use paragraph for display-only descriptive content that is not itself a question.",
              "Use respondent_instruction for direct instructions to the respondent such as how to answer the survey.",
              "Use section_title only for visible headings inside the question flow when a standalone section record is not enough.",
              "Use matrix_single_choice when the source is a table or matrix with multiple row prompts sharing the same answer columns and each row is single-select.",
            ],
          },
          {
            title: "Minimal Valid Templates",
            lines: [
              'survey_meta => {"recordType":"survey_meta","title":"...","language":"zh-CN"}',
              'section => {"recordType":"section","title":"..."}',
              'question(single choice) => {"recordType":"question","id":"q1","type":"single_choice","title":"...","options":[{"id":"opt_1","label":"...","value":"..."}]}',
              'question(open text) => {"recordType":"question","id":"q2","type":"open_text","title":"...","options":[]}',
              'question(matrix single choice) => {"recordType":"question","id":"q3","type":"matrix_single_choice","title":"...","options":[],"matrix":{"selectionMode":"single_per_row","rows":[{"id":"row_1","label":"..."}],"columns":[{"id":"col_1","label":"...","value":"..."}]}}',
            ],
          },
          {
            title: "Field Mapping Guide",
            lines: [
              "survey_meta record: recordType='survey_meta', title, description?, respondentInstructions?, language?",
              "section record: recordType='section', id?, title, description?",
              "question record: recordType='question', id?, code?, sectionTitle?, type, title, description?, required?, respondentInstructions?, options?, matrix?, validation?",
              "For matrix_single_choice, options must usually be an empty array and the row/column structure must be placed inside matrix.",
              "For matrix_single_choice, matrix.rows are the left-side row prompts and matrix.columns are the selectable column headers.",
              "For matrix_single_choice, use matrix.selectionMode='single_per_row'.",
              "If a question is not a matrix question, omit matrix entirely.",
              "If a question has no explicit validation rules, omit validation entirely.",
              "If the source contains a participant-facing instruction block, represent it as a question record with type='respondent_instruction' and put the text in title.",
              "If the source contains a paragraph or display-only text, represent it as a question record with type='paragraph' and put the text in title.",
              "If the source contains a visible subsection heading, either emit a section record or a question record with type='section_title' only when that is the best fit for the source structure.",
              "Do not represent the same heading twice. Do not emit both a section record and a section_title question for the same heading unless the source clearly contains both.",
            ],
          },
          {
            title: "Allowed Question Types",
            lines: [renderEnumValues(questionTypeSchema)],
          },
          {
            title: "Record Schema",
            lines: [renderSchemaGuide("SurveyImportJsonlRecord", surveyImportJsonlRecordSchema)],
          },
          {
            title: "Concrete JSONL Examples",
            lines: [
              '{"recordType":"survey_meta","title":"Fruit Preference Survey","description":"Short consumer taste check","language":"zh-CN"}',
              '{"recordType":"section","title":"Basic Questions"}',
              '{"recordType":"question","id":"q1","sectionTitle":"Basic Questions","type":"single_choice","title":"你喜欢吃苹果吗？","required":true,"options":[{"id":"opt_1","label":"喜欢","value":"喜欢"},{"id":"opt_2","label":"不喜欢","value":"不喜欢"}]}',
              '{"recordType":"question","id":"q2","sectionTitle":"Basic Questions","type":"open_text","title":"请简单说明原因","required":false,"options":[]}',
              '{"recordType":"question","id":"q3","sectionTitle":"Drama Preference","type":"matrix_single_choice","title":"对于以下情节，您的兴趣程度如何？","required":true,"options":[],"matrix":{"selectionMode":"single_per_row","rows":[{"id":"row_1","label":"商业竞争：主角运用隐藏资源击败对手"},{"id":"row_2","label":"家族内斗：隐藏继承人归来争夺家产"}],"columns":[{"id":"col_1","label":"非常感兴趣","value":"非常感兴趣"},{"id":"col_2","label":"比较感兴趣","value":"比较感兴趣"},{"id":"col_3","label":"一般","value":"一般"},{"id":"col_4","label":"不感兴趣","value":"不感兴趣"}]}}',
              '{"recordType":"question","id":"q4","type":"respondent_instruction","title":"请根据你的真实偏好作答","options":[]}',
              '{"recordType":"question","id":"q5","type":"paragraph","title":"以下问题仅针对最近三个月有过购买经历的用户","options":[]}',
              '{"recordType":"question","id":"q6","type":"rating","title":"请对整体体验打分","required":true,"options":[],"validation":{"minRating":1,"maxRating":5,"step":1}}',
            ],
          },
          {
            title: "Matrix Extraction Rules",
            lines: [
              "If the source shows a table header row plus multiple row prompts, convert that into exactly one matrix_single_choice question record.",
              "Do not emit one question record per matrix row. Emit one matrix question record with many matrix.rows entries.",
              "The matrix question title should describe the whole table prompt, not repeat a single row.",
              "Each matrix row must have its own row id and label.",
              "Each matrix column must have its own column id, label, and value.",
            ],
          },
          {
            title: "Invalid Example Patterns",
            lines: [
              'Do not output {"record_type":"question","question_type":"single_choice","prompt":"..."}',
              'Do not output {"record_type":"survey_meta","source_language":"zh"}',
              'Do not output {"recordType":"question","question_id":"q1","prompt":"..."}',
              'Do not output {"question_id":"q1"} or {"survey_id":"survey_1"}',
              'Do not output {"recordType":"question","type":"single_choice","prompt":"..."}',
              'Do not output {"recordType":"question","type":"rating","title":"...","options":[{"id":"1","label":"1","value":"1"}]} when the question is a numeric rating scale. Use validation instead.',
              'Do not output {"recordType":"question","type":"matrix_single_choice","rows":[...],"columns":[...]} because rows and columns must be nested inside matrix.',
              "Do not invent wrapper arrays or top-level objects. Output one JSON object per line only.",
            ],
          },
          {
            title: "Self-Check Before Final Output",
            lines: [
              "Check 1: Is the first line survey_meta?",
              "Check 2: Does every line use recordType exactly?",
              "Check 3: Do question lines use type and title exactly?",
              "Check 4: Are all question types from the allowed enum?",
              "Check 5: Does each question type use the correct fields, for example rating uses validation and matrix_single_choice uses matrix?",
              "Check 6: Are there any forbidden alias fields? If yes, rewrite before output.",
              "Check 7: For every matrix_single_choice record, is matrix present with rows and columns?",
              "Check 8: For every non-matrix question, is matrix omitted?",
              "Check 9: Are there any empty placeholder objects such as matrix:{} or validation:{}? If yes, remove them.",
            ],
          },
          {
            title: "Output Rules",
            lines: [
              "Output JSONL only. No markdown fences. No commentary.",
              "Keep every JSON object on a single line.",
              "Use only recordType values defined by the schema.",
              "For question options, include only the fields allowed by the schema.",
              "For matrix_single_choice, each row must be emitted in matrix.rows and each selectable column must be emitted in matrix.columns.",
              "Preserve the original question order from the source questionnaire.",
              "If you are unsure about an id, generate a simple stable id like q1, q2, section_1, option_1.",
              "Do not output blank lines between records.",
            ],
          },
          {
            title: "Source Material",
            lines: [input.rawText],
          },
        ]),
      },
    ],
  };
}
