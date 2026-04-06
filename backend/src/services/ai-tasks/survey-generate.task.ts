import { surveyAiGenerateResultSchema } from "@surveysim/shared";
import { renderPromptSections } from "./prompt-support/prompt-sections.js";
import { buildJsonFixerPrompt, renderSchemaGuide } from "./prompt-support/schema-text.js";

type BuildSurveyGenerateTaskInput = {
  prompt: string;
  title?: string;
};

export function buildSurveyGenerateTask(input: BuildSurveyGenerateTaskInput): {
  messages: Array<{ role: "system" | "user"; content: string }>;
  fixerPrompt: string;
} {
  return {
    messages: [
      {
        role: "system",
        content: [
          "You generate structured content-task survey drafts for SurveySim.",
          "Return strict JSON only, no markdown and no explanations.",
          "Ensure ids and displayOrder are present for sections, questions, options, and matrix rows/columns.",
          "Use only supported question types and schema keys.",
        ].join(" "),
      },
      {
        role: "user",
        content: renderPromptSections([
          {
            title: "Task",
            lines: [
              "Generate a complete survey draft from the natural-language request.",
              "Keep the structure practical and concise for direct editing and saving.",
              input.title ? `Preferred survey title: ${input.title}` : undefined,
            ],
          },
          {
            title: "Output Schema",
            lines: [renderSchemaGuide("SurveyAiGenerateResult", surveyAiGenerateResultSchema)],
          },
          {
            title: "Question Type Rules",
            lines: [
              "single_choice / multi_choice: include options with id, label, value, displayOrder.",
              "single_choice_other / multi_choice_other: mark only specific options with allowOther=true when needed.",
              "rating: keep options empty and put numeric range in validation.",
              "open_text / paragraph / section_title / respondent_instruction: keep options empty.",
              "matrix_single_choice: include matrix.selectionMode='single_per_row' with rows and columns; keep options empty.",
            ],
          },
          {
            title: "Natural Language Request",
            lines: [input.prompt],
          },
        ]),
      },
    ],
    fixerPrompt: buildJsonFixerPrompt("SurveyAiGenerateResult", surveyAiGenerateResultSchema),
  };
}
