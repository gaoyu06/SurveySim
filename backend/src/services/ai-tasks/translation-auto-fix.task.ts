import type { ChatMessage } from "../llm/openai-compatible.adapter.js";
import { renderPromptSections } from "./prompt-support/prompt-sections.js";
import type { EvaluationSuggestion } from "@surveysim/shared";

export function buildTranslationAutoFixTask(input: {
  translatedText: string;
  selectedSuggestions: EvaluationSuggestion[];
  dramaTheme?: string;
  targetMarket?: string;
  targetLanguage?: string;
}): { messages: ChatMessage[] } {
  return {
    messages: [
      {
        role: "system",
        content:
          "You are a professional translator specializing in short drama localization. Apply the suggested improvements to the translated script while preserving the overall structure, tone, and unchanged parts. Return the complete revised translation. Return JSON only.",
      },
      {
        role: "user",
        content: renderPromptSections([
          {
            title: "Task",
            lines: [
              "Apply the following suggestions to improve the translated script.",
              "Only change the parts covered by the suggestions. Keep everything else identical.",
              "Ensure the revised translation flows naturally as a whole.",
              input.dramaTheme ? `Drama theme: ${input.dramaTheme}` : undefined,
              input.targetMarket ? `Target market: ${input.targetMarket}` : undefined,
              input.targetLanguage ? `Target language: ${input.targetLanguage}` : undefined,
            ],
          },
          {
            title: "Current Translated Text",
            lines: [input.translatedText],
          },
          {
            title: "Suggestions to Apply",
            lines: input.selectedSuggestions.map(
              (s, i) =>
                `${i + 1}. ${s.reason}${s.location ? ` (Location: ${s.location})` : ""}${s.originalText ? ` Original: "${s.originalText}"` : ""} → Suggested: "${s.suggestedText}"`,
            ),
          },
          {
            title: "Output Schema",
            lines: [
              "Return a JSON object with this shape:",
              JSON.stringify({
                revisedText: "string - the complete revised translation",
                changeSummary: "string - brief summary of changes made (1-2 sentences)",
              }),
            ],
          },
        ]),
      },
    ],
  };
}
