import { z } from "zod";
import { buildJsonFixerPrompt, renderSchemaGuide } from "./prompt-support/schema-text.js";
import { renderPromptSections } from "./prompt-support/prompt-sections.js";

export const openTextSummaryResultSchema = z.object({
  summary: z.string(),
  keywords: z.array(z.string()),
});

export function buildOpenTextSummaryTask(input: { questionTitle: string; answers: string[] }) {
  return {
    messages: [
      {
        role: "system" as const,
        content: "You summarize open-ended survey responses into structured JSON. Return JSON only.",
      },
      {
        role: "user" as const,
        content: renderPromptSections([
          {
            title: "Task",
            lines: [
              `Summarize the open-ended responses for question: ${input.questionTitle}`,
              "Write a concise summary covering the dominant themes.",
              "Extract a short keyword list that reflects recurring topics.",
            ],
          },
          {
            title: "Output Schema",
            lines: [renderSchemaGuide("OpenTextSummaryResult", openTextSummaryResultSchema)],
          },
          {
            title: "Responses",
            lines: [input.answers.join("\n---\n")],
          },
        ]),
      },
    ],
    fixerPrompt: buildJsonFixerPrompt("OpenTextSummaryResult", openTextSummaryResultSchema),
  };
}
