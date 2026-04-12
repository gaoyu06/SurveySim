import { z } from "zod";
import type { ChatMessage } from "../llm/openai-compatible.adapter.js";
import { renderPromptSections } from "./prompt-support/prompt-sections.js";

// ── Schemas ──
export const evaluatorProfileResultSchema = z.object({
  evaluators: z.array(z.object({
    name: z.string(),
    age: z.number(),
    gender: z.string(),
    culturalBackground: z.string(),
    viewingHabits: z.string(),
    evaluationFocus: z.string(),
  })),
});

export const singleEvaluatorAssessmentSchema = z.object({
  dimensionScores: z.array(z.object({
    dimension: z.enum([
      "cultural_adaptation",
      "emotional_fidelity",
      "naturalness",
      "timing_rhythm",
      "character_voice",
      "localization_quality",
      "overall",
    ]),
    score: z.number().min(1).max(10),
    reason: z.string(),
  })),
  suggestions: z.array(z.object({
    id: z.string(),
    location: z.string().optional(),
    originalText: z.string().optional(),
    suggestedText: z.string(),
    reason: z.string(),
  })),
  overallImpression: z.string(),
});

// ── Task 1: Generate evaluator profiles ──
export function buildEvaluatorProfilesTask(input: {
  evaluatorCount: number;
  dramaTheme?: string;
  targetMarket?: string;
  targetCulture?: string;
  targetLanguage?: string;
}): { messages: ChatMessage[] } {
  return {
    messages: [
      {
        role: "system",
        content:
          "You are a casting director for audience research. Generate realistic viewer profiles who would watch short dramas in the specified market. Each profile should have distinct demographics, cultural backgrounds, and viewing preferences. Return JSON only.",
      },
      {
        role: "user",
        content: renderPromptSections([
          {
            title: "Task",
            lines: [
              `Generate ${input.evaluatorCount} distinct viewer profiles for evaluating a translated short drama script.`,
              input.dramaTheme ? `Drama theme: ${input.dramaTheme}` : undefined,
              input.targetMarket ? `Target market: ${input.targetMarket}` : undefined,
              input.targetCulture ? `Target culture context: ${input.targetCulture}` : undefined,
              input.targetLanguage ? `Target language: ${input.targetLanguage}` : undefined,
              "Each evaluator should have a different evaluation focus area (e.g., cultural nuances, emotional impact, dialogue naturalness, pacing, character voice consistency, localization of idioms).",
              "Profiles should represent diverse but realistic audience segments for this market.",
            ],
          },
          {
            title: "Output Schema",
            lines: [
              "Return a JSON object with this shape:",
              JSON.stringify({
                evaluators: [
                  {
                    name: "string - realistic local name",
                    age: "number",
                    gender: "string",
                    culturalBackground: "string - detailed cultural context",
                    viewingHabits: "string - how often they watch short dramas, preferred genres",
                    evaluationFocus: "string - what aspect of translation they pay most attention to",
                  },
                ],
              }),
            ],
          },
        ]),
      },
    ],
  };
}

// ── Task 2: Single evaluator assessment ──
export function buildEvaluatorAssessmentTask(input: {
  evaluatorProfile: {
    name: string;
    age: number;
    gender: string;
    culturalBackground: string;
    viewingHabits: string;
    evaluationFocus: string;
  };
  evaluatorIndex: number;
  translatedText: string;
  sourceText?: string;
  dramaTheme?: string;
  targetMarket?: string;
  targetLanguage?: string;
}): { messages: ChatMessage[] } {
  return {
    messages: [
      {
        role: "system",
        content: `You are ${input.evaluatorProfile.name}, a ${input.evaluatorProfile.age}-year-old ${input.evaluatorProfile.gender} viewer from ${input.evaluatorProfile.culturalBackground}. You watch short dramas regularly: ${input.evaluatorProfile.viewingHabits}. Your particular sensitivity is towards ${input.evaluatorProfile.evaluationFocus}. Evaluate the translated script from your genuine perspective as an audience member. Be honest, specific, and constructive. Return JSON only.`,
      },
      {
        role: "user",
        content: renderPromptSections([
          {
            title: "Task",
            lines: [
              "Evaluate this translated short drama script. Score each dimension from 1-10 and provide specific, actionable feedback.",
              input.sourceText ? "You have both the source text and translation for comparison." : "You are evaluating the translation without the source text, as a pure audience experience.",
              input.dramaTheme ? `Drama theme: ${input.dramaTheme}` : undefined,
              input.targetMarket ? `Target market: ${input.targetMarket}` : undefined,
              input.targetLanguage ? `Target language: ${input.targetLanguage}` : undefined,
            ],
          },
          ...(input.sourceText
            ? [
                {
                  title: "Source Text (Original)",
                  lines: [input.sourceText],
                },
              ]
            : []),
          {
            title: "Translated Text",
            lines: [input.translatedText],
          },
          {
            title: "Dimensions to Score (1-10 each)",
            lines: [
              "1. cultural_adaptation - How well cultural references, humor, and context are adapted for the target audience",
              "2. emotional_fidelity - Whether the translation preserves the intended emotional impact of each scene",
              "3. naturalness - How natural and fluent the dialogue sounds to a native speaker",
              "4. timing_rhythm - Whether the translation fits the pacing and rhythm expected in short drama format",
              "5. character_voice - Whether each character's unique voice and personality come through in the translation",
              "6. localization_quality - Quality of localized idioms, slang, and cultural expressions",
              "7. overall - Your overall impression as a viewer",
            ],
          },
          {
            title: "Output Schema",
            lines: [
              "Return JSON with this shape:",
              JSON.stringify({
                dimensionScores: "array of { dimension, score (1-10), reason (1-2 sentences) }",
                suggestions: "array of { id (unique like 's1'), location (line/scene reference), originalText (must be an exact substring copied from the Translated Text above), suggestedText, reason } - specific improvement suggestions, at least 2",
                overallImpression: "string - 2-3 sentence overall impression",
              }),
              "CRITICAL: The 'originalText' field in each suggestion MUST be an exact substring copied word-for-word from the 'Translated Text' section above. Do NOT use text from the Source Text. This field identifies which part of the TRANSLATION you are suggesting to change.",
            ],
          },
        ]),
      },
    ],
  };
}
