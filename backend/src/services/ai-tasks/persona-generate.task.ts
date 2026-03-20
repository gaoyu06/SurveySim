import { personaGenerationPayloadSchema } from "@formagents/shared";
import { z } from "zod";
import { buildJsonFixerPrompt, renderSchemaGuide } from "./prompt-support/schema-text.js";
import { renderPromptSections } from "./prompt-support/prompt-sections.js";

export const personaGenerationResultSchema = z.object({
  personaPrompt: z.string().min(1),
  traits: z.array(z.string()).default([]),
  guardrails: z.array(z.string()).default([]),
});

export function buildPersonaGenerateTask(input: {
  identity: unknown;
  surveyTitle: string;
  extraRespondentPrompt?: string;
}) {
  const payload = personaGenerationPayloadSchema.parse({
    identity: input.identity,
    survey: {
      survey: { title: input.surveyTitle, language: "auto" },
      sections: [{ id: "meta", title: "meta", displayOrder: 0, questions: [] }],
    },
    extraPrompt: input.extraRespondentPrompt,
  });

  return {
    messages: [
      {
        role: "system" as const,
        content:
          "You generate vivid but bounded survey respondent personas. Keep the persona consistent with the identity while adding realistic variation, subtle inconsistency, life details, and speaking style. Return JSON only.",
      },
      {
        role: "user" as const,
        content: renderPromptSections([
          {
            title: "Task",
            lines: [
              "Create a realistic respondent persona prompt for later survey answering.",
              "The persona must remain consistent with the provided identity.",
              "Add background details unrelated to the questionnaire when useful.",
              "Avoid turning the persona into a generic list of labels.",
            ],
          },
          {
            title: "Input Payload Schema",
            lines: [renderSchemaGuide("PersonaGenerationPayload", personaGenerationPayloadSchema)],
          },
          {
            title: "Output Schema",
            lines: [renderSchemaGuide("PersonaGenerationResult", personaGenerationResultSchema)],
          },
          {
            title: "Payload",
            lines: [JSON.stringify(payload)],
          },
        ]),
      },
    ],
    fixerPrompt: buildJsonFixerPrompt("PersonaGenerationResult", personaGenerationResultSchema),
  };
}
