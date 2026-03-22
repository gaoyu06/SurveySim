import { structuredAnswerSchema, type StructuredAnswer } from "@surveysim/shared";
import { fromJson } from "../lib/json.js";

type PersistedAnswerRow = {
  answer: unknown;
};

type SurveyResponseLike = {
  answers?: PersistedAnswerRow[] | null;
  rawPayload?: unknown;
} | null | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractAnswersFromRawPayload(rawPayload: unknown) {
  if (!isRecord(rawPayload)) return [];
  if (!Array.isArray(rawPayload.answers)) return [];

  return rawPayload.answers.flatMap((item) => {
    const parsed = structuredAnswerSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export function readStructuredAnswers(response: SurveyResponseLike): StructuredAnswer[] {
  if (!response) return [];

  const persistedAnswers = (response.answers ?? []).flatMap((row) => {
    const parsed = structuredAnswerSchema.safeParse(fromJson<StructuredAnswer>(row.answer));
    return parsed.success ? [parsed.data] : [];
  });
  if (persistedAnswers.length > 0) return persistedAnswers;

  return extractAnswersFromRawPayload(response.rawPayload);
}
