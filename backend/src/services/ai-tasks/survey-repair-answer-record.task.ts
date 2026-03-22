import { structuredAnswerSchema, type SurveyQuestionDto } from "@surveysim/shared";
import { buildJsonFixerPrompt, renderSchemaGuide } from "./prompt-support/schema-text.js";
import { renderPromptSections } from "./prompt-support/prompt-sections.js";
import { renderStructuredAnswerExamples, renderSurveyQuestionContracts } from "./prompt-support/survey-response-format.js";

export function buildSurveyRepairAnswerRecordTask(input: {
  question: SurveyQuestionDto;
  invalidLine: string;
  errorMessage: string;
  surveyTitle: string;
}) {
  const examples = renderStructuredAnswerExamples([input.question]);

  return {
    messages: [
      {
        role: "system" as const,
        content: [
          "You repair one invalid survey answer record for SurveySim.",
          "Return exactly one corrected StructuredAnswer JSON object only.",
          "Do not explain the fix. Do not use markdown fences.",
          "The repaired object must use the exact questionId and only valid fields.",
        ].join(" "),
      },
      {
        role: "user" as const,
        content: renderPromptSections([
          {
            title: "Task",
            lines: [
              "Repair the invalid answer record so it matches the required schema and the specific question contract.",
              "Prefer the smallest valid correction.",
              "Do not change the questionId to another question.",
              "If the question is optional and the record clearly indicates nonresponse, you may repair it into a skipped answer using isSkipped and skipReason.",
            ],
          },
          {
            title: "Survey Context",
            lines: [`surveyTitle=${input.surveyTitle}`],
          },
          {
            title: "StructuredAnswer Schema",
            lines: [renderSchemaGuide("StructuredAnswer", structuredAnswerSchema)],
          },
          {
            title: "Question Contract",
            lines: renderSurveyQuestionContracts([input.question]),
          },
          {
            title: "Repair Rules",
            lines: [
              "Keep only these top-level keys when needed: questionId, selectedOptionIds, matrixAnswers, otherText, ratingValue, textAnswer, isSkipped, skipReason, confidence.",
              "For required single_choice and single_choice_other, selectedOptionIds must contain exactly one valid option id.",
              "For multi_choice and multi_choice_other, selectedOptionIds must be an array of valid option ids and satisfy minSelections/maxSelections when defined.",
              "For rating, use ratingValue only and keep it within range.",
              "For open_text, use textAnswer.",
              "For required matrix_single_choice, use matrixAnswers with one entry per row and one valid matrix column id per row.",
              "Optional questions may be repaired as skipped answers when appropriate.",
              "Remove unsupported keys such as type, title, optionLabel, rowLabel, answerText, responses, or answers.",
            ],
          },
          {
            title: "Example",
            lines: examples,
          },
          {
            title: "Validation Error",
            lines: [input.errorMessage],
          },
          {
            title: "Invalid Record",
            lines: [input.invalidLine],
          },
        ]),
      },
    ],
    fixerPrompt: buildJsonFixerPrompt("StructuredAnswer", structuredAnswerSchema),
  };
}
