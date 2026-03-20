import { questionTypeSchema, responseGenerationPayloadSchema, structuredAnswerSchema } from "@formagents/shared";
import { z } from "zod";
import { buildJsonFixerPrompt, renderEnumValues, renderSchemaGuide } from "./prompt-support/schema-text.js";
import { renderPromptSections } from "./prompt-support/prompt-sections.js";

export const surveyResponseGenerationResultSchema = z.object({
  answers: z.array(structuredAnswerSchema),
});

export function buildSurveyResponseGenerateTask(input: {
  survey: unknown;
  identity: unknown;
  personaPrompt: string;
  respondentInstructions?: string;
  extraSystemPrompt?: string;
  extraRespondentPrompt?: string;
}) {
  const payload = responseGenerationPayloadSchema.parse({
    survey: input.survey,
    identity: input.identity,
    personaPrompt: input.personaPrompt,
    extraSystemPrompt: input.extraSystemPrompt,
    extraRespondentPrompt: input.extraRespondentPrompt,
  });

  return {
    messages: [
      {
        role: "system" as const,
        content: [
          "You simulate a survey respondent and must return structured JSON answers only.",
          "Answer as the provided persona, not as an assistant.",
          input.extraSystemPrompt?.trim(),
        ]
          .filter(Boolean)
          .join("\n"),
      },
      {
        role: "user" as const,
        content: renderPromptSections([
          {
            title: "Task",
            lines: [
              "Fill the survey as the provided respondent.",
              "Respect required questions and question validation.",
              "Use exact questionId values and exact option ids from the survey schema.",
              "Do not answer paragraph, section_title, or respondent_instruction blocks.",
            ],
          },
          {
            title: "Supported Question Types",
            lines: [renderEnumValues(questionTypeSchema)],
          },
          {
            title: "Input Payload Schema",
            lines: [renderSchemaGuide("ResponseGenerationPayload", responseGenerationPayloadSchema)],
          },
          {
            title: "Output Schema",
            lines: [renderSchemaGuide("SurveyResponseGenerationResult", surveyResponseGenerationResultSchema)],
          },
          {
            title: "Answering Rules",
            lines: [
              "Return JSON only with top-level key answers.",
              "For choice questions, return selectedOptionIds using the exact option ids from the survey.",
              "For matrix_single_choice questions, return matrixAnswers. Each matrixAnswers item must contain rowId and exactly one selectedOptionIds entry, where the selected option id must be one of the matrix column ids.",
              "Do not flatten matrix answers into selectedOptionIds at the question level.",
              "Use otherText only when the question supports other input and the answer needs custom text.",
              "Use ratingValue only for rating questions.",
              "Use textAnswer only for open_text questions.",
              input.respondentInstructions ? `Respondent instructions: ${input.respondentInstructions}` : undefined,
            ],
          },
          {
            title: "Matrix Answer Example",
            lines: [
              '{"answers":[{"questionId":"q_matrix_1","matrixAnswers":[{"rowId":"row_1","selectedOptionIds":["col_2"]},{"rowId":"row_2","selectedOptionIds":["col_4"]}]}]}',
            ],
          },
          {
            title: "Payload",
            lines: [JSON.stringify(payload)],
          },
        ]),
      },
    ],
    fixerPrompt: buildJsonFixerPrompt("SurveyResponseGenerationResult", surveyResponseGenerationResultSchema),
  };
}
