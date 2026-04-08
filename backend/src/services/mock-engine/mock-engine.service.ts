import pLimit from "p-limit";
import { Prisma, RunStatus, TaskStatus } from "@prisma/client";
import {
  mockRunAppendInputSchema,
  mockRunCreateInputSchema,
  mockRunStartInputSchema,
  normalizeParticipantAttributeDefinitions,
  participantIdentitySchema,
  structuredAnswerSchema,
  type ParticipantAttributeDefinitionDto,
  type MockRunDto,
  type ParticipantIdentity,
  type StructuredAnswer,
  type SurveySchemaDto,
} from "@surveysim/shared";
import { prisma } from "../../lib/db.js";
import { fromJson, toJson } from "../../lib/json.js";
import type { AuthUserContext } from "../../types/auth.js";
import { isAdmin, resolveDataScope } from "../../utils/access.js";
import { LlmService } from "../llm/llm.service.js";
import { ParticipantTemplateService } from "../participant-template.service.js";
import { ReportService } from "../reporting/report.service.js";
import { UsageLimitService } from "../usage-limit.service.js";
import { SystemConfigService } from "../system-config.service.js";
import {
  buildPersonaGenerateTask,
  buildSurveyRepairAnswerRecordTask,
  buildSurveyResponseJsonlTask,
  buildSurveyResponseSingleAnswerTask,
} from "../ai-tasks/index.js";
import { toIsoString } from "../../utils/serialize.js";
import { toPaginationResult, type ResolvedPagination } from "../../utils/pagination.js";

interface RunContext {
  cancelRequested: boolean;
  abortController: AbortController;
}

const activeRunStatuses = new Set<RunStatus>([RunStatus.QUEUED, RunStatus.RUNNING, RunStatus.CANCELING]);

function emptyProgress(total: number) {
  return {
    total,
    identityCompleted: 0,
    personaCompleted: 0,
    responseCompleted: 0,
    failed: 0,
    canceled: 0,
  };
}

function extractStoredTemplateAttributes(raw: unknown) {
  const parsed = fromJson<
    Array<string | Partial<ParticipantAttributeDefinitionDto>> | { attributes?: Array<string | Partial<ParticipantAttributeDefinitionDto>> }
  >(raw);
  return Array.isArray(parsed) ? parsed : parsed?.attributes ?? [];
}

function mapRun(run: {
  id: string;
  userId: string;
  user?: { email: string } | null;
  name: string;
  participantTemplateId: string;
  surveyId: string;
  llmConfigId: string;
  participantCount: number;
  concurrency: number;
  reuseIdentity: boolean;
  reusePersonaPrompt: boolean;
  extraSystemPrompt: string | null;
  extraRespondentPrompt: string | null;
  status: RunStatus;
  progress: Prisma.JsonValue;
  startedAt: Date | null;
  completedAt: Date | null;
  canceledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): MockRunDto {
  return {
    id: run.id,
    name: run.name,
    ownerId: run.userId,
    ownerEmail: run.user?.email,
    isOwnedByCurrentUser: false,
    participantTemplateId: run.participantTemplateId,
    contentTaskId: run.surveyId,
    surveyId: run.surveyId,
    llmConfigId: run.llmConfigId,
    participantCount: run.participantCount,
    concurrency: run.concurrency,
    reuseIdentity: run.reuseIdentity,
    reusePersonaPrompt: run.reusePersonaPrompt,
    extraSystemPrompt: run.extraSystemPrompt ?? undefined,
    extraRespondentPrompt: run.extraRespondentPrompt ?? undefined,
    status: run.status.toLowerCase() as MockRunDto["status"],
    progress: fromJson(run.progress),
    startedAt: toIsoString(run.startedAt),
    completedAt: toIsoString(run.completedAt),
    canceledAt: toIsoString(run.canceledAt),
    createdAt: toIsoString(run.createdAt)!,
    updatedAt: toIsoString(run.updatedAt)!,
  };
}

function interactiveQuestions(schema: SurveySchemaDto) {
  return schema.sections.flatMap((section) => section.questions).filter((question) => !["paragraph", "section_title", "respondent_instruction"].includes(question.type));
}

type InteractiveQuestion = ReturnType<typeof interactiveQuestions>[number];

function hasMeaningfulAnswer(answer: StructuredAnswer) {
  if (answer.isSkipped) return true;
  return Boolean(
    answer.selectedOptionIds.length ||
      answer.matrixAnswers.length ||
      answer.otherText ||
      answer.textAnswer ||
      typeof answer.ratingValue === "number",
  );
}

function normalizeNumberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function normalizeTextValue(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function normalizeOptionId(question: InteractiveQuestion, candidate: unknown) {
  const normalized = normalizeTextValue(candidate);
  if (!normalized) return undefined;

  const exactMatch = question.options.find((option) => option.id === normalized);
  if (exactMatch) return exactMatch.id;

  const lowered = normalized.toLowerCase();
  const looseMatch = question.options.find((option) => {
    return option.id.toLowerCase() === lowered || option.label.toLowerCase() === lowered || option.value.toLowerCase() === lowered;
  });

  return looseMatch?.id;
}

function normalizeChoiceSelections(question: InteractiveQuestion, source: unknown) {
  const selectedOptionIds: string[] = [];
  const residualTexts: string[] = [];

  const pushSelection = (item: unknown) => {
    if (item == null) return;

    if (typeof item === "object" && !Array.isArray(item)) {
      const record = item as Record<string, unknown>;
      const nestedCandidate = record.optionId ?? record.id ?? record.value ?? record.label ?? record.text ?? record.answer;
      if (nestedCandidate !== undefined) {
        pushSelection(nestedCandidate);
        return;
      }
    }

    const optionId = normalizeOptionId(question, item);
    if (optionId) {
      if (!selectedOptionIds.includes(optionId)) {
        selectedOptionIds.push(optionId);
      }
      return;
    }

    const residualText = normalizeTextValue(item);
    if (residualText) {
      residualTexts.push(residualText);
    }
  };

  const values = Array.isArray(source) ? source : source == null ? [] : [source];
  values.forEach(pushSelection);

  return { selectedOptionIds, residualTexts };
}

function normalizeMatrixRowSelections(question: InteractiveQuestion, source: unknown) {
  const matrix = question.matrix;
  if (!matrix) return [];

  const columnMap = new Map(
    matrix.columns.map((column) => [column.id.toLowerCase(), column.id]),
  );

  const normalizeMatrixColumnId = (candidate: unknown) => {
    const text = normalizeTextValue(candidate);
    if (!text) return undefined;

    const exact = matrix.columns.find((column) => column.id === text);
    if (exact) return exact.id;

    const lowered = text.toLowerCase();
    const byId = columnMap.get(lowered);
    if (byId) return byId;

    const byLabel = matrix.columns.find(
      (column) => column.label.toLowerCase() === lowered || column.value.toLowerCase() === lowered,
    );
    return byLabel?.id;
  };

  const rows = Array.isArray(source)
    ? source
    : source && typeof source === "object" && !Array.isArray(source)
      ? Object.entries(source as Record<string, unknown>).map(([rowId, value]) => ({ rowId, selectedOptionIds: value }))
      : [];

  return rows
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
      const record = item as Record<string, unknown>;
      const rowId = normalizeTextValue(record.rowId ?? record.id ?? record.row ?? record.rowKey);
      if (!rowId) return undefined;

      const selectionSource =
        record.selectedOptionIds ??
        record.selectedOptions ??
        record.optionIds ??
        record.optionId ??
        record.selection ??
        record.selections ??
        record.choice ??
        record.choices ??
        record.value ??
        record.answer;

      const rawSelections = Array.isArray(selectionSource)
        ? selectionSource
        : selectionSource == null
          ? []
          : [selectionSource];

      const selectedOptionIds = rawSelections
        .map((candidate) => normalizeMatrixColumnId(candidate))
        .filter((candidate): candidate is string => Boolean(candidate));

      return {
        rowId,
        selectedOptionIds: Array.from(new Set(selectedOptionIds)),
      };
    })
    .filter((item): item is { rowId: string; selectedOptionIds: string[] } => Boolean(item));
}

function normalizeAnswerItem(question: InteractiveQuestion | undefined, questionId: string, rawValue: unknown) {
  if (!question) {
    if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)) {
      return { questionId, ...(rawValue as Record<string, unknown>) };
    }
    return { questionId, textAnswer: normalizeTextValue(rawValue) };
  }

  const record = rawValue && typeof rawValue === "object" && !Array.isArray(rawValue) ? (rawValue as Record<string, unknown>) : undefined;
  const isSkipped = record?.isSkipped === true;
  const skipReasonCandidate = normalizeTextValue(record?.skipReason);
  const confidenceValue = normalizeNumberValue(record?.confidence);

  if (isSkipped) {
    return {
      questionId,
      isSkipped: true,
      skipReason:
        skipReasonCandidate === "optional" ||
        skipReasonCandidate === "uncertain" ||
        skipReasonCandidate === "fatigue" ||
        skipReasonCandidate === "not_applicable"
          ? skipReasonCandidate
          : "optional",
      confidence: confidenceValue,
    };
  }

  switch (question.type) {
    case "single_choice":
    case "single_choice_other":
    case "multi_choice":
    case "multi_choice_other": {
      const selectionSource =
        record?.selectedOptionIds ??
        record?.selectedOptions ??
        record?.optionIds ??
        record?.optionId ??
        record?.selections ??
        record?.selection ??
        record?.choices ??
        record?.choice ??
        record?.value ??
        record?.answer ??
        rawValue;

      const { selectedOptionIds, residualTexts } = normalizeChoiceSelections(question, selectionSource);
      const explicitOtherText =
        normalizeTextValue(record?.otherText) ??
        normalizeTextValue(record?.other) ??
        normalizeTextValue(record?.otherInput) ??
        normalizeTextValue(record?.freeText);

      return {
        questionId,
        selectedOptionIds,
        otherText: explicitOtherText ?? (question.type.endsWith("_other") ? residualTexts.join("; ") || undefined : undefined),
        confidence: confidenceValue,
      };
    }
    case "matrix_single_choice": {
      const matrixSource =
        record?.matrixAnswers ??
        record?.rows ??
        record?.matrix ??
        record?.answers ??
        record?.response ??
        rawValue;

      return {
        questionId,
        matrixAnswers: normalizeMatrixRowSelections(question, matrixSource),
        confidence: confidenceValue,
      };
    }
    case "rating": {
      const ratingSource = record?.ratingValue ?? record?.rating ?? record?.score ?? record?.value ?? record?.answer ?? rawValue;
      return {
        questionId,
        ratingValue: normalizeNumberValue(ratingSource),
        confidence: confidenceValue,
      };
    }
    case "open_text": {
      const textSource = record?.textAnswer ?? record?.text ?? record?.answer ?? record?.value ?? record?.otherText ?? record?.other ?? rawValue;
      return {
        questionId,
        textAnswer: normalizeTextValue(textSource),
        confidence: confidenceValue,
      };
    }
    default:
      return { questionId, confidence: confidenceValue };
  }
}

function normalizeAnswerCollection(questionMap: Map<string, InteractiveQuestion>, rawPayload: any) {
  if (Array.isArray(rawPayload)) {
    return rawPayload
      .map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
        const questionId = normalizeTextValue((item as Record<string, unknown>).questionId);
        if (!questionId) return undefined;
        return normalizeAnswerItem(questionMap.get(questionId), questionId, item);
      })
      .filter(Boolean);
  }

  if (Array.isArray(rawPayload?.answers)) return normalizeAnswerCollection(questionMap, rawPayload.answers);
  if (Array.isArray(rawPayload?.responses)) return normalizeAnswerCollection(questionMap, rawPayload.responses);

  const keyed = rawPayload?.answers ?? rawPayload?.responses ?? rawPayload;
  if (keyed && typeof keyed === "object" && !Array.isArray(keyed)) {
    return Object.entries(keyed).map(([questionId, value]) => normalizeAnswerItem(questionMap.get(questionId), questionId, value));
  }

  return [];
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isCanceledError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return /run canceled by user|aborted|aborterror/i.test(error.message);
}

function normalizeSingleAnswerRecord(
  questionMap: Map<string, InteractiveQuestion>,
  rawPayload: unknown,
  expectedQuestionId?: string,
) {
  if (rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)) {
    const record = rawPayload as Record<string, unknown>;
    const questionId = normalizeTextValue(record.questionId) ?? expectedQuestionId;
    if (!questionId) {
      throw new Error("Answer record is missing questionId");
    }
    return structuredAnswerSchema.parse(normalizeAnswerItem(questionMap.get(questionId), questionId, record));
  }

  if (!expectedQuestionId) {
    throw new Error("Answer record is not a valid object");
  }

  return structuredAnswerSchema.parse(normalizeAnswerItem(questionMap.get(expectedQuestionId), expectedQuestionId, rawPayload));
}

function normalizePersonaPrompt(raw: any) {
  if (!raw) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw.personaPrompt === "string" && raw.personaPrompt.trim()) return raw.personaPrompt.trim();
  if (typeof raw.promptText === "string" && raw.promptText.trim()) return raw.promptText.trim();

  const persona = raw.respondent?.persona ?? raw.persona ?? raw.profile ?? raw;
  const parts: string[] = [];

  if (persona.name) parts.push(`Name: ${persona.name}`);
  if (persona.age) parts.push(`Age: ${persona.age}`);
  if (persona.gender) parts.push(`Gender: ${persona.gender}`);
  if (persona.country || persona.location) parts.push(`Location: ${persona.location ?? persona.country}`);
  if (persona.occupation) parts.push(`Occupation: ${persona.occupation}`);
  if (Array.isArray(persona.interests) && persona.interests.length) parts.push(`Interests: ${persona.interests.join(", ")}`);
  if (persona.bio) parts.push(`Bio: ${persona.bio}`);
  if (persona.lifeMoment) parts.push(`Current life moment: ${persona.lifeMoment}`);
  if (persona.speakingStyle?.description) parts.push(`Speaking style: ${persona.speakingStyle.description}`);
  if (Array.isArray(persona.personality?.traits) && persona.personality.traits.length) {
    parts.push(`Traits: ${persona.personality.traits.join(", ")}`);
  }
  if (Array.isArray(persona.subtleInconsistencies) && persona.subtleInconsistencies.length) {
    parts.push(`Inconsistencies: ${persona.subtleInconsistencies.join(" | ")}`);
  }
  if (persona.surveyDisposition?.responsePattern) {
    parts.push(`Survey behavior: ${persona.surveyDisposition.responsePattern}`);
  }

  return parts.join("\n").trim() || JSON.stringify(raw);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function randomChoice<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function shouldSkipOptionalQuestion(question: InteractiveQuestion, answer: StructuredAnswer, identity: ParticipantIdentity, questionIndex: number, totalQuestions: number) {
  if (question.required || answer.isSkipped) return false;

  const noise = identity.noise && typeof identity.noise === "object" ? (identity.noise as Record<string, unknown>) : {};
  const skipOptionalRate = typeof noise.skipOptionalRate === "number" ? noise.skipOptionalRate : 0.06;
  const fatigue = typeof noise.fatigue === "number" ? noise.fatigue : 0.2;
  const topicFamiliarity = typeof noise.topicFamiliarity === "number" ? noise.topicFamiliarity : 0.5;
  const confidence = typeof answer.confidence === "number" ? answer.confidence : 0.6;
  const progress = totalQuestions > 1 ? questionIndex / (totalQuestions - 1) : 0;

  let probability = skipOptionalRate + fatigue * 0.2 * progress;
  if (topicFamiliarity < 0.35) probability += 0.08;
  if (confidence < 0.35) probability += 0.12;
  if (question.type === "open_text") probability += 0.08;
  if (question.type === "matrix_single_choice") probability += 0.05;

  return Math.random() < clamp(probability, 0, 0.75);
}

function sampleRatingValue(question: InteractiveQuestion, rawValue: number | undefined, identity: ParticipantIdentity) {
  const min = question.validation?.minRating ?? 1;
  const max = question.validation?.maxRating ?? 5;
  const step = question.validation?.step ?? 1;
  const noise = identity.noise && typeof identity.noise === "object" ? (identity.noise as Record<string, unknown>) : {};
  const centralTendency = typeof noise.centralTendency === "number" ? noise.centralTendency : 0.45;
  const extremityBias = typeof noise.extremityBias === "number" ? noise.extremityBias : 0.4;
  const fatigue = typeof noise.fatigue === "number" ? noise.fatigue : 0.2;

  const scaleValues: number[] = [];
  for (let value = min; value <= max + step / 10; value += step) {
    scaleValues.push(Number(value.toFixed(6)));
  }

  const midpoint = (min + max) / 2;
  let anchor = typeof rawValue === "number" ? rawValue : midpoint;

  if (Math.random() < centralTendency * 0.55) {
    const middleIndex = Math.floor(scaleValues.length / 2);
    anchor = scaleValues[middleIndex] ?? midpoint;
  } else if (Math.random() < extremityBias * 0.35) {
    anchor = Math.random() < 0.5 ? min : max;
  } else {
    const jitter = (Math.random() - 0.5) * step * (1.1 + fatigue);
    anchor += jitter;
  }

  const snapped = scaleValues.reduce((closest, current) =>
    Math.abs(current - anchor) < Math.abs(closest - anchor) ? current : closest,
  scaleValues[0] ?? min);
  return clamp(snapped, min, max);
}

function sampleSingleChoice(question: InteractiveQuestion, answer: StructuredAnswer, identity: ParticipantIdentity) {
  if (!question.options.length) return answer;
  const noise = identity.noise && typeof identity.noise === "object" ? (identity.noise as Record<string, unknown>) : {};
  const centralTendency = typeof noise.centralTendency === "number" ? noise.centralTendency : 0.45;
  const noveltySeeking = typeof noise.noveltySeeking === "number" ? noise.noveltySeeking : 0.45;
  const acquiescence = typeof noise.acquiescence === "number" ? noise.acquiescence : 0.45;

  const current = answer.selectedOptionIds[0];
  const currentIndex = question.options.findIndex((option) => option.id === current);
  const middleIndex = Math.floor((question.options.length - 1) / 2);

  if (Math.random() < centralTendency * 0.22) {
    return { ...answer, selectedOptionIds: [question.options[middleIndex]?.id ?? current ?? question.options[0].id] };
  }

  if (Math.random() < noveltySeeking * 0.16) {
    const tail = question.options.slice(-Math.min(2, question.options.length));
    return { ...answer, selectedOptionIds: [randomChoice(tail)?.id ?? current ?? question.options[0].id] };
  }

  if (Math.random() < acquiescence * 0.12) {
    return { ...answer, selectedOptionIds: [question.options[0]?.id ?? current ?? question.options[0].id] };
  }

  if (currentIndex >= 0 && Math.random() < 0.18) {
    const shift = Math.random() < 0.5 ? -1 : 1;
    const nextIndex = clamp(currentIndex + shift, 0, question.options.length - 1);
    return { ...answer, selectedOptionIds: [question.options[nextIndex].id] };
  }

  return answer;
}

function sampleMultiChoice(question: InteractiveQuestion, answer: StructuredAnswer, identity: ParticipantIdentity) {
  if (!question.options.length) return answer;
  const noise = identity.noise && typeof identity.noise === "object" ? (identity.noise as Record<string, unknown>) : {};
  const fatigue = typeof noise.fatigue === "number" ? noise.fatigue : 0.2;
  const noveltySeeking = typeof noise.noveltySeeking === "number" ? noise.noveltySeeking : 0.45;
  const selected = new Set(answer.selectedOptionIds);
  const minSelections = question.validation?.minSelections ?? (question.required ? 1 : 0);
  const maxSelections = question.validation?.maxSelections ?? question.options.length;

  if (selected.size === 0 && question.options.length > 0 && minSelections > 0) {
    selected.add(question.options[Math.floor(Math.random() * question.options.length)].id);
  }

  if (selected.size > minSelections && Math.random() < fatigue * 0.3) {
    const removable = Array.from(selected);
    selected.delete(randomChoice(removable));
  } else if (selected.size < maxSelections && Math.random() < noveltySeeking * 0.18) {
    const candidates = question.options.map((option) => option.id).filter((optionId) => !selected.has(optionId));
    if (candidates.length) {
      selected.add(randomChoice(candidates));
    }
  }

  while (selected.size < minSelections && question.options.length > 0) {
    const candidates = question.options.map((option) => option.id).filter((optionId) => !selected.has(optionId));
    if (!candidates.length) break;
    selected.add(candidates[0]);
  }

  while (selected.size > maxSelections) {
    selected.delete(randomChoice(Array.from(selected)));
  }

  return { ...answer, selectedOptionIds: Array.from(selected) };
}

function sampleMatrixAnswer(question: InteractiveQuestion, answer: StructuredAnswer, identity: ParticipantIdentity) {
  if (!question.matrix) return answer;
  const noise = identity.noise && typeof identity.noise === "object" ? (identity.noise as Record<string, unknown>) : {};
  const straightlining = typeof noise.straightlining === "number" ? noise.straightlining : 0.2;
  const centralTendency = typeof noise.centralTendency === "number" ? noise.centralTendency : 0.45;
  const columns = question.matrix.columns;
  if (!columns.length) return answer;

  const middleColumn = columns[Math.floor((columns.length - 1) / 2)]?.id ?? columns[0].id;
  const dominantColumn = Math.random() < centralTendency * 0.35 ? middleColumn : randomChoice(columns)?.id ?? columns[0].id;

  const matrixAnswers = question.matrix.rows.map((row, rowIndex) => {
    const existing = answer.matrixAnswers.find((item) => item.rowId === row.id);
    const current = existing?.selectedOptionIds[0];
    let columnId = current && columns.some((column) => column.id === current) ? current : dominantColumn;

    if (Math.random() < straightlining * (rowIndex === 0 ? 0.8 : 0.55)) {
      columnId = dominantColumn;
    } else if (Math.random() < 0.2) {
      const currentIndex = columns.findIndex((column) => column.id === columnId);
      const nextIndex = clamp(currentIndex + (Math.random() < 0.5 ? -1 : 1), 0, columns.length - 1);
      columnId = columns[nextIndex].id;
    }

    return {
      rowId: row.id,
      selectedOptionIds: [columnId],
    };
  });

  return { ...answer, matrixAnswers };
}

function tuneOpenTextAnswer(question: InteractiveQuestion, answer: StructuredAnswer, identity: ParticipantIdentity) {
  const noise = identity.noise && typeof identity.noise === "object" ? (identity.noise as Record<string, unknown>) : {};
  const openTextVerbosity = typeof noise.openTextVerbosity === "number" ? noise.openTextVerbosity : 0.45;
  const fatigue = typeof noise.fatigue === "number" ? noise.fatigue : 0.2;
  const rawText = answer.textAnswer ?? answer.otherText;
  if (!rawText) return answer;

  const trimmed = rawText.trim();
  if (!trimmed) return answer;

  let nextText = trimmed;
  if (openTextVerbosity < 0.35 || fatigue > 0.65) {
    const sentences = trimmed.split(/(?<=[.!?。！？])\s+/).filter(Boolean);
    nextText = (sentences[0] ?? trimmed).trim();
    const words = nextText.split(/\s+/);
    if (words.length > 18) {
      nextText = words.slice(0, 18).join(" ");
    }
  } else if (openTextVerbosity > 0.72 && trimmed.length < 40) {
    nextText = `${trimmed}${trimmed.endsWith(".") ? "" : "."} It depends on convenience and whether it feels worth my time.`;
  }

  const maxLength = question.validation?.maxLength;
  if (maxLength && nextText.length > maxLength) {
    nextText = nextText.slice(0, maxLength).trim();
  }

  return answer.textAnswer !== undefined
    ? { ...answer, textAnswer: nextText }
    : { ...answer, otherText: nextText };
}

function postProcessAnswer(
  question: InteractiveQuestion,
  answer: StructuredAnswer,
  identity: ParticipantIdentity,
  questionIndex: number,
  totalQuestions: number,
) {
  if (shouldSkipOptionalQuestion(question, answer, identity, questionIndex, totalQuestions)) {
    return {
      questionId: question.id,
      selectedOptionIds: [],
      matrixAnswers: [],
      isSkipped: true,
      skipReason: Math.random() < 0.5 ? "optional" : "fatigue",
      confidence: typeof answer.confidence === "number" ? answer.confidence : 0.2,
    } satisfies StructuredAnswer;
  }

  let next = answer;
  switch (question.type) {
    case "single_choice":
    case "single_choice_other":
      next = sampleSingleChoice(question, next, identity);
      break;
    case "multi_choice":
    case "multi_choice_other":
      next = sampleMultiChoice(question, next, identity);
      break;
    case "rating":
      next = { ...next, ratingValue: sampleRatingValue(question, next.ratingValue, identity) };
      break;
    case "matrix_single_choice":
      next = sampleMatrixAnswer(question, next, identity);
      break;
    case "open_text":
      next = tuneOpenTextAnswer(question, next, identity);
      break;
    default:
      break;
  }

  if (typeof next.confidence !== "number") {
    const noise = identity.noise && typeof identity.noise === "object" ? (identity.noise as Record<string, unknown>) : {};
    const topicFamiliarity = typeof noise.topicFamiliarity === "number" ? noise.topicFamiliarity : 0.55;
    const attention = typeof noise.attention === "number" ? noise.attention : 0.65;
    next = { ...next, confidence: clamp(Number(((topicFamiliarity * 0.6) + (attention * 0.4)).toFixed(2)), 0.05, 0.98) };
  }

  return next;
}

function validateSingleAnswer(
  questionMap: Map<string, InteractiveQuestion>,
  answer: StructuredAnswer,
  expectedQuestionId?: string,
) {
  const question = questionMap.get(answer.questionId);
  if (!question) {
    throw new Error(`Unknown questionId: ${answer.questionId}`);
  }

  if (expectedQuestionId && answer.questionId !== expectedQuestionId) {
    throw new Error(`Expected questionId ${expectedQuestionId} but received ${answer.questionId}`);
  }

  if (answer.isSkipped) {
    if (question.required) {
      throw new Error(`Question ${question.id} is required and cannot be skipped`);
    }
    return answer;
  }

  switch (question.type) {
    case "single_choice":
    case "single_choice_other": {
      if (question.required && answer.selectedOptionIds.length !== 1) throw new Error(`Question ${question.id} must select exactly one option`);
      if (!question.required && answer.selectedOptionIds.length > 1) throw new Error(`Question ${question.id} must not select more than one option`);
      break;
    }
    case "multi_choice":
    case "multi_choice_other": {
      const minSelections = question.validation?.minSelections ?? (question.required ? 1 : 0);
      if (answer.selectedOptionIds.length < minSelections) {
        throw new Error(`Question ${question.id} requires at least ${minSelections} selections`);
      }
      if (question.validation?.maxSelections && answer.selectedOptionIds.length > question.validation.maxSelections) {
        throw new Error(`Question ${question.id} exceeds max selections`);
      }
      break;
    }
    case "matrix_single_choice": {
      if (!question.matrix) throw new Error(`Question ${question.id} is missing matrix definition`);
      if (!question.required && answer.matrixAnswers.length === 0) {
        break;
      }

      const allowedRows = new Set(question.matrix.rows.map((row) => row.id));
      const allowedColumns = new Set(question.matrix.columns.map((column) => column.id));
      const seenRows = new Set<string>();

      for (const rowAnswer of answer.matrixAnswers) {
        if (!allowedRows.has(rowAnswer.rowId)) {
          throw new Error(`Question ${question.id} has unknown rowId ${rowAnswer.rowId}`);
        }
        if (seenRows.has(rowAnswer.rowId)) {
          throw new Error(`Question ${question.id} has duplicate matrix answer for row ${rowAnswer.rowId}`);
        }
        seenRows.add(rowAnswer.rowId);

        if (rowAnswer.selectedOptionIds.length !== 1) {
          throw new Error(`Question ${question.id} row ${rowAnswer.rowId} must select exactly one column`);
        }

        for (const columnId of rowAnswer.selectedOptionIds) {
          if (!allowedColumns.has(columnId)) {
            throw new Error(`Question ${question.id} row ${rowAnswer.rowId} has unknown columnId ${columnId}`);
          }
        }
      }

      if (seenRows.size !== question.matrix.rows.length) {
        throw new Error(`Question ${question.id} requires one answer for every matrix row`);
      }
      break;
    }
    case "rating": {
      if (typeof answer.ratingValue !== "number") {
        if (!question.required) break;
        throw new Error(`Question ${question.id} requires ratingValue`);
      }
      const min = question.validation?.minRating ?? 1;
      const max = question.validation?.maxRating ?? 5;
      if (answer.ratingValue < min || answer.ratingValue > max) throw new Error(`Question ${question.id} rating out of range`);
      break;
    }
    case "open_text": {
      if (!answer.textAnswer && !answer.otherText) {
        if (!question.required) break;
        throw new Error(`Question ${question.id} requires textAnswer`);
      }
      break;
    }
    default:
      break;
  }

  if (question.options.length > 0) {
    const allowed = new Set(question.options.map((option) => option.id));
    for (const optionId of answer.selectedOptionIds) {
      if (!allowed.has(optionId)) {
        throw new Error(`Question ${question.id} has unknown optionId ${optionId}`);
      }
    }
  }

  if (question.required && !hasMeaningfulAnswer(answer)) {
    throw new Error(`Missing answer for ${question.id}`);
  }

  return answer;
}

function validateAnswerRecord(
  questionMap: Map<string, InteractiveQuestion>,
  rawPayload: unknown,
  expectedQuestionId?: string,
) {
  const answer = normalizeSingleAnswerRecord(questionMap, rawPayload, expectedQuestionId);
  return validateSingleAnswer(questionMap, answer, expectedQuestionId);
}

function validateAnswers(schema: SurveySchemaDto, rawPayload: unknown) {
  const questions = interactiveQuestions(schema);
  const questionMap = new Map(questions.map((question) => [question.id, question]));
  const answers = normalizeAnswerCollection(questionMap, rawPayload).map((answer) => structuredAnswerSchema.parse(answer));
  const seenQuestionIds = new Set<string>();

  for (const answer of answers) {
    if (seenQuestionIds.has(answer.questionId)) {
      throw new Error(`Duplicate answer for ${answer.questionId}`);
    }
    seenQuestionIds.add(answer.questionId);
    validateSingleAnswer(questionMap, answer);
  }

  for (const question of questions) {
    const answer = answers.find((item) => item.questionId === question.id);
    if (question.required && (!answer || !hasMeaningfulAnswer(answer))) {
      throw new Error(`Missing answer for ${question.id}`);
    }
  }

  return answers;
}

function participantProgressPercent(participant: {
  status: TaskStatus;
  personaProfile: { status: TaskStatus } | null;
  surveyResponse: { status: TaskStatus } | null;
}) {
  if (participant.status === TaskStatus.COMPLETED || participant.surveyResponse?.status === TaskStatus.COMPLETED) {
    return 100;
  }

  if (participant.status === TaskStatus.CANCELED || participant.personaProfile?.status === TaskStatus.CANCELED || participant.surveyResponse?.status === TaskStatus.CANCELED) {
    return 0;
  }

  if (participant.surveyResponse?.status === TaskStatus.RUNNING) {
    return 75;
  }

  if (participant.surveyResponse?.status === TaskStatus.FAILED) {
    return 67;
  }

  if (participant.personaProfile?.status === TaskStatus.COMPLETED) {
    return 67;
  }

  if (participant.personaProfile?.status === TaskStatus.RUNNING) {
    return 34;
  }

  if (participant.personaProfile?.status === TaskStatus.FAILED || participant.status === TaskStatus.FAILED) {
    return 34;
  }

  return 0;
}

export class MockEngineService {
  private readonly llmService = new LlmService();
  private readonly templateService = new ParticipantTemplateService();
  private readonly reportService = new ReportService();
  private readonly usageLimitService = new UsageLimitService();
  private readonly systemConfigService = new SystemConfigService();
  private readonly activeRuns = new Map<string, RunContext>();
  private readonly recoveringRuns = new Set<string>();

  constructor() {
    void this.recoverActiveRunsAtBoot().catch(() => undefined);
  }

  async list(user: AuthUserContext, scope?: unknown, pagination?: ResolvedPagination) {
    const dataScope = resolveDataScope(user, scope);
    const where = dataScope === "all" ? {} : { userId: user.id };

    await this.recoverOrphanedActiveRuns(where);

    if (!pagination) {
      const runs = await prisma.mockRun.findMany({ where, include: { user: true }, orderBy: { createdAt: "desc" } });
      return runs.map((run) => ({ ...mapRun(run), isOwnedByCurrentUser: run.userId === user.id }));
    }

    const [runs, total] = await prisma.$transaction([
      prisma.mockRun.findMany({
        where,
        include: { user: true },
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      prisma.mockRun.count({ where }),
    ]);

    const items = runs.map((run) => ({ ...mapRun(run), isOwnedByCurrentUser: run.userId === user.id }));
    return toPaginationResult(items, total, pagination);
  }

  async get(user: AuthUserContext, runId: string) {
    await this.reconcileOrphanedActiveRun(runId);

    const run = await prisma.mockRun.findFirst({
      where: isAdmin(user) ? { id: runId } : { id: runId, userId: user.id },
      include: {
        user: true,
        participantTemplate: {
          select: {
            dimensions: true,
          },
        },
        participantInstances: {
          include: {
            personaProfile: true,
            surveyResponse: { include: { answers: true } },
          },
          orderBy: { ordinal: "asc" },
        },
        logs: { orderBy: { createdAt: "desc" }, take: 200 },
      },
    });
    if (!run) throw new Error("Mock run not found");

    return {
      ...mapRun(run),
      isOwnedByCurrentUser: run.userId === user.id,
      templateAttributes: normalizeParticipantAttributeDefinitions(extractStoredTemplateAttributes(run.participantTemplate.dimensions)),
      participants: run.participantInstances.map((participant) => ({
        id: participant.id,
        ordinal: participant.ordinal,
        status: participant.status.toLowerCase(),
        identity: fromJson<ParticipantIdentity>(participant.identity),
        progressPercent: participantProgressPercent(participant),
        personaStatus: participant.personaProfile?.status.toLowerCase() ?? "pending",
        personaPrompt: participant.personaProfile?.promptText ?? undefined,
        responseStatus: participant.surveyResponse?.status.toLowerCase() ?? "pending",
        errorMessage: participant.errorMessage ?? participant.personaProfile?.errorMessage ?? participant.surveyResponse?.errorMessage ?? undefined,
      })),
      logs: run.logs.map((log) => ({
        id: log.id,
        stage: log.stage,
        level: log.level.toLowerCase(),
        message: log.message,
        participantInstanceId: log.participantInstanceId,
        createdAt: toIsoString(log.createdAt)!,
      })),
    };
  }

  async create(user: AuthUserContext, input: unknown) {
    const payload = mockRunCreateInputSchema.parse(input);
    const systemSettings = await this.systemConfigService.getRuntimeSettings();
    if (user.role !== "admin" && payload.concurrency > systemSettings.maxUserRunConcurrency) {
      throw new Error(`Concurrency cannot exceed ${systemSettings.maxUserRunConcurrency} for regular users`);
    }

    const [template, survey, llmConfig] = await Promise.all([
      prisma.participantTemplate.findFirst({ where: { id: payload.participantTemplateId, userId: user.id }, include: { rules: true } }),
      prisma.survey.findFirst({ where: { id: payload.surveyId, userId: user.id } }),
      prisma.llmProviderConfig.findFirst({ where: { id: payload.llmConfigId, OR: [{ userId: user.id }, { isPublic: true }] } }),
    ]);

    if (!template) throw new Error("Participant template not found");
    if (!survey) throw new Error("Content task not found");
    if (!llmConfig) throw new Error("LLM config not found");

    const run = await prisma.mockRun.create({
      data: {
        userId: user.id,
        name: payload.name,
        participantTemplateId: payload.participantTemplateId,
        surveyId: payload.surveyId,
        llmConfigId: payload.llmConfigId,
        participantCount: payload.participantCount,
        concurrency: payload.concurrency,
        reuseIdentity: payload.reuseIdentity,
        reusePersonaPrompt: payload.reusePersonaPrompt,
        extraSystemPrompt: payload.extraSystemPrompt,
        extraRespondentPrompt: payload.extraRespondentPrompt,
        status: RunStatus.DRAFT,
        progress: toJson(emptyProgress(payload.participantCount)),
      },
    });

    return { ...mapRun(run), isOwnedByCurrentUser: true };
  }

  async start(user: AuthUserContext, runId: string, input: unknown) {
    await this.usageLimitService.consumeOrThrow(user, "mock run start");
    await this.reconcileOrphanedActiveRun(runId);

    const payload = mockRunStartInputSchema.parse(input ?? {});
    const run = await prisma.mockRun.findFirst({ where: { id: runId, userId: user.id } });
    if (!run) throw new Error("Mock run not found");
    if (run.status === RunStatus.RUNNING || run.status === RunStatus.QUEUED) return mapRun(run);

    await prisma.mockRun.update({
      where: { id: runId },
      data: { status: RunStatus.QUEUED, startedAt: run.startedAt ?? new Date(), completedAt: null, canceledAt: null },
    });

    const context = { cancelRequested: false, abortController: new AbortController() };
    this.activeRuns.set(runId, context);
    void this.executeRun(user.id, runId, context, undefined, payload.mode);

    const refreshed = await prisma.mockRun.findUniqueOrThrow({ where: { id: runId } });
    return { ...mapRun(refreshed), isOwnedByCurrentUser: true };
  }

  async cancel(userId: string, runId: string) {
    const run = await prisma.mockRun.findFirst({ where: { id: runId, userId } });
    if (!run) throw new Error("Mock run not found");

    if (!activeRunStatuses.has(run.status)) {
      return { success: true };
    }

    const context = this.activeRuns.get(runId);
    if (context) {
      context.cancelRequested = true;
      context.abortController.abort(new Error("Run canceled by user"));
      await prisma.mockRun.update({ where: { id: runId }, data: { status: RunStatus.CANCELING } });
      await this.log(runId, "system", "Cancellation requested", "WARN");
      return { success: true };
    }

    await prisma.mockRun.update({ where: { id: runId }, data: { status: RunStatus.CANCELING } });
    await this.log(runId, "system", "Cancellation requested without active runtime context", "WARN");
    await this.finishCanceled(runId);
    return { success: true };
  }

  async delete(userId: string, runId: string) {
    await this.reconcileOrphanedActiveRun(runId);

    const run = await prisma.mockRun.findFirst({ where: { id: runId, userId } });
    if (!run) throw new Error("Mock run not found");

    if (this.activeRuns.has(runId) || activeRunStatuses.has(run.status)) {
      throw new Error("Cannot delete a mock run while it is active");
    }

    await prisma.mockRun.delete({ where: { id: runId } });
    return { success: true };
  }

  async retryParticipants(userId: string, runId: string, participantIds: string[]) {
    await this.usageLimitService.consumeOrThrow({ id: userId, email: "", role: "user" }, "mock run retry");
    await this.reconcileOrphanedActiveRun(runId);
    const run = await prisma.mockRun.findFirst({ where: { id: runId, userId } });
    if (!run) throw new Error("Mock run not found");
    if (this.activeRuns.has(runId)) throw new Error("Run is currently active");

    await prisma.$transaction(async (tx) => {
      await tx.surveyAnswer.deleteMany({ where: { surveyResponse: { participantInstanceId: { in: participantIds } } } });
      await tx.surveyResponse.updateMany({
        where: { participantInstanceId: { in: participantIds } },
        data: {
          status: TaskStatus.PENDING,
          rawPayload: Prisma.JsonNull,
          validationErrors: Prisma.JsonNull,
          errorMessage: null,
          startedAt: null,
          completedAt: null,
        },
      });
      await tx.personaProfile.updateMany({
        where: { participantInstanceId: { in: participantIds } },
        data: {
          status: TaskStatus.PENDING,
          promptText: null,
          rawPayload: Prisma.JsonNull,
          errorMessage: null,
        },
      });
      await tx.participantInstance.updateMany({
        where: { id: { in: participantIds } },
        data: { status: TaskStatus.PENDING, errorMessage: null },
      });
      await tx.mockRun.update({ where: { id: runId }, data: { status: RunStatus.QUEUED, completedAt: null, canceledAt: null } });
    });

    const context = { cancelRequested: false, abortController: new AbortController() };
    this.activeRuns.set(runId, context);
    void this.executeRun(userId, runId, context, participantIds, "continue");
    return { success: true };
  }

  async appendParticipants(userId: string, runId: string, input: unknown) {
    await this.usageLimitService.consumeOrThrow({ id: userId, email: "", role: "user" }, "mock run append participants");
    await this.reconcileOrphanedActiveRun(runId);

    const payload = mockRunAppendInputSchema.parse(input);
    const run = await prisma.mockRun.findFirst({
      where: { id: runId, userId },
      include: {
        participantTemplate: { include: { rules: true } },
        participantInstances: {
          include: { personaProfile: true, surveyResponse: true },
          orderBy: { ordinal: "asc" },
        },
      },
    });

    if (!run) throw new Error("Mock run not found");
    if (this.activeRuns.has(runId) || activeRunStatuses.has(run.status)) {
      throw new Error("Cannot append participants while the run is active");
    }

    const template = await this.templateService.get(userId, run.participantTemplateId);
    const newIdentities = this.templateService.generateIdentities(template, payload.additionalCount);
    const nextOrdinal = run.participantInstances.length + 1;
    const createdParticipantIds: string[] = [];

    await prisma.$transaction(async (tx) => {
      for (let index = 0; index < newIdentities.length; index += 1) {
        const participant = await tx.participantInstance.create({
          data: {
            mockRunId: runId,
            ordinal: nextOrdinal + index,
            identity: toJson(participantIdentitySchema.parse(newIdentities[index])),
            status: TaskStatus.PENDING,
            personaProfile: { create: { status: TaskStatus.PENDING } },
            surveyResponse: { create: { mockRunId: runId, status: TaskStatus.PENDING } },
          },
          select: { id: true },
        });
        createdParticipantIds.push(participant.id);
      }

      const currentProgress = fromJson<ReturnType<typeof emptyProgress>>(run.progress);
      currentProgress.total += payload.additionalCount;
      currentProgress.identityCompleted += payload.additionalCount;

      await tx.mockRun.update({
        where: { id: runId },
        data: {
          participantCount: run.participantCount + payload.additionalCount,
          status: RunStatus.QUEUED,
          completedAt: null,
          canceledAt: null,
          progress: toJson(currentProgress),
        },
      });

      await tx.aggregatedReport.deleteMany({
        where: { mockRunId: runId },
      });
    });

    await this.log(runId, "identity", `Appended ${payload.additionalCount} participants to the run`, "INFO");

    const context = { cancelRequested: false, abortController: new AbortController() };
    this.activeRuns.set(runId, context);
    void this.executeRun(userId, runId, context, createdParticipantIds, "continue");

    const refreshed = await prisma.mockRun.findUniqueOrThrow({ where: { id: runId } });
    return mapRun(refreshed);
  }

  private async executeRun(
    userId: string,
    runId: string,
    context: RunContext,
    targetParticipantIds?: string[],
    startMode: "continue" | "restart" = "restart",
  ) {
    try {
      await prisma.mockRun.update({ where: { id: runId }, data: { status: RunStatus.RUNNING, startedAt: new Date() } });
      await this.log(runId, "system", "Run started", "INFO");

      const run = await prisma.mockRun.findUniqueOrThrow({
        where: { id: runId },
        include: {
          participantTemplate: { include: { rules: true } },
          survey: true,
          llmConfig: true,
          participantInstances: {
            include: { personaProfile: true, surveyResponse: true },
            orderBy: { ordinal: "asc" },
          },
        },
      });

      const surveySchema = fromJson<SurveySchemaDto>(run.survey.schema);
      let participants = run.participantInstances;

      if (!targetParticipantIds) {
        if (startMode === "restart" || participants.length === 0) {
          await prisma.$transaction(async (tx) => {
            await tx.surveyAnswer.deleteMany({ where: { surveyResponse: { mockRunId: runId } } });
            await tx.surveyResponse.deleteMany({ where: { mockRunId: runId } });
            await tx.personaProfile.deleteMany({ where: { participantInstance: { mockRunId: runId } } });
            await tx.participantInstance.deleteMany({ where: { mockRunId: runId } });
          });

          const template = await this.templateService.get(userId, run.participantTemplateId);
          const identities = this.templateService.generateIdentities(template, run.participantCount);
          participants = [];

          for (let index = 0; index < identities.length; index += 1) {
            const participant = await prisma.participantInstance.create({
              data: {
                mockRunId: runId,
                ordinal: index + 1,
                identity: toJson(participantIdentitySchema.parse(identities[index])),
                status: TaskStatus.PENDING,
                personaProfile: { create: { status: TaskStatus.PENDING } },
                surveyResponse: { create: { mockRunId: runId, status: TaskStatus.PENDING } },
              },
              include: { personaProfile: true, surveyResponse: true },
            });
            participants.push(participant);
          }

          await this.updateProgress(runId, { identityCompleted: identities.length });
          await this.log(runId, "identity", `Generated ${identities.length} participant identities`, "INFO");
        } else {
          const shouldResetTaskStatus = (status: TaskStatus | null | undefined) =>
            status === TaskStatus.CANCELED || status === TaskStatus.FAILED || status === TaskStatus.RUNNING;

          const participantIdsNeedingPersonaReset = participants
            .filter(
              (participant) =>
                participant.personaProfile?.status == null ||
                shouldResetTaskStatus(participant.personaProfile.status),
            )
            .map((participant) => participant.id);

          const participantIdsNeedingResponseReset = participants
            .filter(
              (participant) =>
                participant.surveyResponse?.status == null ||
                shouldResetTaskStatus(participant.surveyResponse.status),
            )
            .map((participant) => participant.id);

          await prisma.$transaction(async (tx) => {
            if (participantIdsNeedingResponseReset.length) {
              await tx.surveyAnswer.deleteMany({
                where: {
                  surveyResponse: {
                    participantInstanceId: { in: participantIdsNeedingResponseReset },
                  },
                },
              });
              await tx.surveyResponse.updateMany({
                where: { participantInstanceId: { in: participantIdsNeedingResponseReset } },
                data: {
                  status: TaskStatus.PENDING,
                  rawPayload: Prisma.JsonNull,
                  validationErrors: Prisma.JsonNull,
                  errorMessage: null,
                  startedAt: null,
                  completedAt: null,
                },
              });
            }

            if (participantIdsNeedingPersonaReset.length) {
              await tx.personaProfile.updateMany({
                where: { participantInstanceId: { in: participantIdsNeedingPersonaReset } },
                data: {
                  status: TaskStatus.PENDING,
                  promptText: null,
                  rawPayload: Prisma.JsonNull,
                  errorMessage: null,
                },
              });
            }

            const pendingParticipantIds = Array.from(new Set([...participantIdsNeedingPersonaReset, ...participantIdsNeedingResponseReset]));
            if (pendingParticipantIds.length) {
              await tx.participantInstance.updateMany({
                where: { id: { in: pendingParticipantIds } },
                data: { status: TaskStatus.PENDING, errorMessage: null },
              });
            }
          });

          participants = await prisma.participantInstance.findMany({
            where: { mockRunId: runId },
            include: { personaProfile: true, surveyResponse: true },
            orderBy: { ordinal: "asc" },
          });

          await prisma.mockRun.update({
            where: { id: runId },
            data: {
              progress: toJson(await this.computeProgress(runId)),
            },
          });
          await this.log(runId, "system", "Continuing existing run with completed personas and responses reused", "INFO");
        }
      } else {
        participants = participants.filter((participant) => targetParticipantIds.includes(participant.id));
      }

      const config = await this.llmService.getRuntimeConfig(userId, run.llmConfigId);
      const effectiveConcurrency = Math.max(1, Math.min(run.concurrency, config.concurrency ?? run.concurrency));
      const limit = pLimit(effectiveConcurrency);

      await this.log(
        runId,
        "system",
        `Run execution started with requested concurrency ${run.concurrency}, model concurrency ${config.concurrency ?? run.concurrency}, effective concurrency ${effectiveConcurrency}`,
        "INFO",
      );

      await Promise.all(
        participants.map((participant) =>
          limit(async () => {
            if (context.cancelRequested) return;
            if (participant.personaProfile?.status === TaskStatus.COMPLETED && (run.reusePersonaPrompt || startMode === "continue") && !targetParticipantIds) {
              return;
            }
            await this.generatePersona(runId, participant.id, surveySchema, config, run.extraRespondentPrompt ?? undefined, context);
          }),
        ),
      );

      if (context.cancelRequested) {
        await this.finishCanceled(runId, participants.map((participant) => participant.id));
        return;
      }

      const refreshedParticipants = await prisma.participantInstance.findMany({
        where: { mockRunId: runId, ...(targetParticipantIds ? { id: { in: targetParticipantIds } } : {}) },
        include: { personaProfile: true, surveyResponse: true },
      });

      await Promise.all(
        refreshedParticipants.map((participant) =>
          limit(async () => {
            if (context.cancelRequested) return;
            if (participant.surveyResponse?.status === TaskStatus.COMPLETED && startMode === "continue" && !targetParticipantIds) {
              return;
            }
            await this.generateResponse(runId, participant.id, surveySchema, config, {
              extraSystemPrompt: run.extraSystemPrompt ?? undefined,
              extraRespondentPrompt: run.extraRespondentPrompt ?? undefined,
            }, context);
          }),
        ),
      );

      if (context.cancelRequested) {
        await this.finishCanceled(runId, refreshedParticipants.map((participant) => participant.id));
        return;
      }

      const finalProgress = await this.computeProgress(runId);
      const status =
        finalProgress.failed > 0 || finalProgress.responseCompleted < finalProgress.total
          ? RunStatus.FAILED
          : RunStatus.COMPLETED;
      await prisma.mockRun.update({
        where: { id: runId },
        data: { status, completedAt: new Date(), progress: toJson(finalProgress) },
      });
      await this.log(runId, "system", `Run finished with status ${status}`, status === RunStatus.COMPLETED ? "INFO" : "WARN");

      if (status === RunStatus.COMPLETED) {
        await this.reportService.getReport({ id: userId, email: "", role: "user" }, runId, {});
      }
    } catch (error) {
      if (context.cancelRequested || isCanceledError(error)) {
        await this.finishCanceled(runId, targetParticipantIds).catch(() => undefined);
        return;
      }

      await prisma.mockRun.update({
        where: { id: runId },
        data: {
          status: RunStatus.FAILED,
          completedAt: new Date(),
        },
      }).catch(() => undefined);
      await this.log(runId, "system", error instanceof Error ? error.message : String(error), "ERROR");
    } finally {
      this.activeRuns.delete(runId);
      await this.reconcileOrphanedActiveRun(runId).catch(() => undefined);
    }
  }

  private async generatePersona(
    runId: string,
    participantId: string,
    surveySchema: SurveySchemaDto,
    config: Awaited<ReturnType<LlmService["getRuntimeConfig"]>>,
    extraRespondentPrompt: string | undefined,
    context: RunContext,
  ) {
    const participant = await prisma.participantInstance.findUniqueOrThrow({ where: { id: participantId }, include: { personaProfile: true } });
    if (context.cancelRequested) return;

    await prisma.personaProfile.upsert({
      where: { participantInstanceId: participantId },
      create: { participantInstanceId: participantId, status: TaskStatus.RUNNING },
      update: { status: TaskStatus.RUNNING, errorMessage: null },
    });
    await prisma.participantInstance.update({
      where: { id: participantId },
      data: { status: TaskStatus.RUNNING, errorMessage: null },
    });

    const identity = fromJson<ParticipantIdentity>(participant.identity);
    try {
      const task = buildPersonaGenerateTask({
        identity,
        contentTaskTitle: surveySchema.survey.title,
        extraRespondentPrompt,
      });
      const result = await this.llmService.generateJson<{ personaPrompt: string; traits: string[]; guardrails: string[] }>(
        { ...config, temperature: Math.max(config.temperature, 0.9) },
        task.messages,
        task.fixerPrompt,
        { signal: context.abortController.signal },
      );
      const personaPrompt = normalizePersonaPrompt(result);
      if (!personaPrompt) {
        throw new Error("Persona generation returned no usable persona prompt");
      }

      await prisma.personaProfile.update({
        where: { participantInstanceId: participantId },
        data: { status: TaskStatus.COMPLETED, promptText: personaPrompt, rawPayload: toJson(result), errorMessage: null },
      });
      await this.updateProgress(runId, { personaCompletedDelta: 1 });
      await this.log(runId, "persona", `Persona generated for participant #${participant.ordinal}`, "INFO", participantId);
    } catch (error) {
      if (context.cancelRequested || isCanceledError(error)) {
        await prisma.personaProfile.update({
          where: { participantInstanceId: participantId },
          data: { status: TaskStatus.CANCELED, errorMessage: "Canceled" },
        }).catch(() => undefined);
        await prisma.participantInstance.update({
          where: { id: participantId },
          data: { status: TaskStatus.CANCELED, errorMessage: "Canceled" },
        }).catch(() => undefined);
        return;
      }
      await prisma.personaProfile.update({
        where: { participantInstanceId: participantId },
        data: { status: TaskStatus.FAILED, errorMessage: error instanceof Error ? error.message : String(error) },
      });
      await prisma.participantInstance.update({ where: { id: participantId }, data: { status: TaskStatus.FAILED, errorMessage: error instanceof Error ? error.message : String(error) } });
      await this.updateProgress(runId, { failedDelta: 1 });
      await this.log(runId, "persona", error instanceof Error ? error.message : String(error), "ERROR", participantId);
    }
  }

  private async generateResponse(
    runId: string,
    participantId: string,
    surveySchema: SurveySchemaDto,
    config: Awaited<ReturnType<LlmService["getRuntimeConfig"]>>,
    prompts: { extraSystemPrompt?: string; extraRespondentPrompt?: string },
    context: RunContext,
  ) {
    const participant = await prisma.participantInstance.findUniqueOrThrow({
      where: { id: participantId },
      include: { personaProfile: true, surveyResponse: { include: { answers: true } } },
    });
    if (context.cancelRequested) return;
    if (!participant.personaProfile?.promptText) {
      await this.log(runId, "response", `Skipping participant ${participant.ordinal}: missing persona`, "WARN", participantId);
      return;
    }

    await prisma.surveyResponse.upsert({
      where: { participantInstanceId: participantId },
      create: { participantInstanceId: participantId, mockRunId: runId, status: TaskStatus.RUNNING, startedAt: new Date() },
      update: { status: TaskStatus.RUNNING, errorMessage: null, startedAt: new Date() },
    });
    await prisma.participantInstance.update({
      where: { id: participantId },
      data: { status: TaskStatus.RUNNING, errorMessage: null },
    });

    const identity = fromJson<ParticipantIdentity>(participant.identity);

    const questions = interactiveQuestions(surveySchema);
    const questionMap = new Map(questions.map((question) => [question.id, question]));
    const answerMap = new Map<string, StructuredAnswer>();
    const rawLines: string[] = [];
    const validationNotes: string[] = [];
    let lineNumber = 0;

    const repairAnswerLine = async (questionId: string, invalidLine: string, reason: string) => {
      const question = questionMap.get(questionId);
      if (!question) {
        throw new Error(`Unknown questionId: ${questionId}`);
      }

      const repairTask = buildSurveyRepairAnswerRecordTask({
        question,
        invalidLine,
        errorMessage: reason,
        surveyTitle: surveySchema.survey.title,
      });

      const repaired = await this.llmService.generateJson<StructuredAnswer>(
        responseConfig,
        repairTask.messages,
        repairTask.fixerPrompt,
        { signal: context.abortController.signal },
      );
      const normalized = validateAnswerRecord(questionMap, repaired, questionId);
      rawLines.push(JSON.stringify(repaired));
      validationNotes.push(`Repaired question ${questionId}: ${reason}`);
      await this.log(runId, "response", `Question ${questionId} repaired for participant #${participant.ordinal}`, "WARN", participantId);
      return normalized;
    };

    const personaPrompt = participant.personaProfile.promptText;
    const responseConfig = {
      ...config,
      temperature: Math.max(config.temperature, 0.85),
    };

    const answerSingleQuestion = async (questionId: string, reason: string) => {
      const singleTask = buildSurveyResponseSingleAnswerTask({
        contentTask: surveySchema,
        identity,
        personaPrompt,
        questionId,
        respondentInstructions: surveySchema.survey.respondentInstructions,
        extraSystemPrompt: prompts.extraSystemPrompt,
        extraRespondentPrompt: prompts.extraRespondentPrompt,
      });
      const rawAnswer = await this.llmService.generateJson<StructuredAnswer>(
        responseConfig,
        singleTask.messages,
        singleTask.fixerPrompt,
        { signal: context.abortController.signal },
      );
      const normalized = validateAnswerRecord(questionMap, rawAnswer, questionId);
      rawLines.push(JSON.stringify(rawAnswer));
      validationNotes.push(`Generated missing question ${questionId}: ${reason}`);
      await this.log(runId, "response", `Question ${questionId} answered via single-question recovery for participant #${participant.ordinal}`, "WARN", participantId);
      return normalized;
    };

    try {
      const task = buildSurveyResponseJsonlTask({
        contentTask: surveySchema,
        identity,
        personaPrompt,
        respondentInstructions: surveySchema.survey.respondentInstructions,
        extraSystemPrompt: prompts.extraSystemPrompt,
        extraRespondentPrompt: prompts.extraRespondentPrompt,
      });
      let buffer = "";

      let streamError: Error | null = null;

      try {
        await this.llmService.generateTextStream(responseConfig, task.messages, async (event) => {
          if (context.cancelRequested) return;
          if (event.type !== "delta" || !event.chunk) return;

          buffer += event.chunk;
          const parts = buffer.split(/\r?\n/);
          buffer = parts.pop() ?? "";

          for (const line of parts) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            lineNumber += 1;
            rawLines.push(trimmed);

            let parsed: unknown;
            try {
              parsed = JSON.parse(trimmed);
            } catch (parseError) {
              validationNotes.push(`Line ${lineNumber} parse failed: ${errorMessage(parseError)}`);
              await this.log(runId, "response", `Answer line ${lineNumber} parse failed for participant #${participant.ordinal}, attempting repair`, "WARN", participantId);

              const questionIdMatch = trimmed.match(/"questionId"\s*:\s*"([^"]+)"/);
              const questionId = questionIdMatch?.[1];
              if (!questionId) {
                validationNotes.push(`Line ${lineNumber} skipped: unable to infer questionId`);
                await this.log(runId, "response", `Answer line ${lineNumber} skipped because questionId could not be inferred`, "WARN", participantId);
                continue;
              }

              try {
              const repaired = await repairAnswerLine(questionId, trimmed, errorMessage(parseError));
                answerMap.set(questionId, repaired);
                continue;
              } catch (repairError) {
                validationNotes.push(`Line ${lineNumber} repair failed for ${questionId}: ${errorMessage(repairError)}`);
                await this.log(runId, "response", `Answer line ${lineNumber} repair failed for question ${questionId}`, "WARN", participantId);
                continue;
              }
            }

            let questionId: string | undefined;
            try {
              questionId = normalizeTextValue((parsed as Record<string, unknown>).questionId);
              if (!questionId) {
                throw new Error("Answer record is missing questionId");
              }

              const normalized = validateAnswerRecord(questionMap, parsed, questionId);
              if (answerMap.has(questionId)) {
                throw new Error(`Duplicate answer for ${questionId}`);
              }
              answerMap.set(questionId, normalized);
              await this.log(runId, "response", `Question ${questionId} validated for participant #${participant.ordinal}`, "INFO", participantId);
            } catch (validationError) {
              validationNotes.push(`Line ${lineNumber} invalid${questionId ? ` for ${questionId}` : ""}: ${errorMessage(validationError)}`);
              await this.log(
                runId,
                "response",
                `Answer line ${lineNumber}${questionId ? ` for question ${questionId}` : ""} invalid, attempting repair`,
                "WARN",
                participantId,
              );

              if (!questionId) {
                await this.log(runId, "response", `Answer line ${lineNumber} skipped because questionId is unavailable`, "WARN", participantId);
                continue;
              }

              try {
                const repaired = await repairAnswerLine(questionId, trimmed, errorMessage(validationError));
                if (answerMap.has(questionId)) {
                  throw new Error(`Duplicate answer for ${questionId}`);
                }
                answerMap.set(questionId, repaired);
              } catch (repairError) {
                validationNotes.push(`Line ${lineNumber} repair failed for ${questionId}: ${errorMessage(repairError)}`);
                await this.log(runId, "response", `Question ${questionId} repair failed for participant #${participant.ordinal}`, "WARN", participantId);
              }
            }
          }
        }, { signal: context.abortController.signal });
      } catch (streamFailure) {
        streamError = streamFailure instanceof Error ? streamFailure : new Error(String(streamFailure));
        validationNotes.push(`Stream interrupted: ${streamError.message}`);
        await this.log(runId, "response", `JSONL stream interrupted for participant #${participant.ordinal}: ${streamError.message}`, "WARN", participantId);
      }

      if (buffer.trim()) {
        const tail = buffer.trim();
        lineNumber += 1;
        rawLines.push(tail);
        try {
          const parsed = JSON.parse(tail);
          const questionId = normalizeTextValue((parsed as Record<string, unknown>).questionId);
          if (!questionId) {
            throw new Error("Answer record is missing questionId");
          }
          const normalized = validateAnswerRecord(questionMap, parsed, questionId);
          if (answerMap.has(questionId)) {
            throw new Error(`Duplicate answer for ${questionId}`);
          }
          answerMap.set(questionId, normalized);
          await this.log(runId, "response", `Question ${questionId} validated for participant #${participant.ordinal}`, "INFO", participantId);
        } catch (tailError) {
          validationNotes.push(`Line ${lineNumber} invalid: ${errorMessage(tailError)}`);
          const questionIdMatch = tail.match(/"questionId"\s*:\s*"([^"]+)"/);
          const questionId = questionIdMatch?.[1];
          if (questionId) {
            try {
            const repaired = await repairAnswerLine(questionId, tail, errorMessage(tailError));
              if (answerMap.has(questionId)) {
                throw new Error(`Duplicate answer for ${questionId}`);
              }
              answerMap.set(questionId, repaired);
            } catch (repairError) {
              validationNotes.push(`Line ${lineNumber} repair failed for ${questionId}: ${errorMessage(repairError)}`);
            }
          }
        }
      }

      const missingQuestionIds = questions.filter((question) => question.required && !answerMap.has(question.id)).map((question) => question.id);
      for (const questionId of missingQuestionIds) {
        try {
          const recovered = await answerSingleQuestion(questionId, streamError ? `Missing after interrupted JSONL stream: ${streamError.message}` : "Missing after JSONL stream");
          answerMap.set(questionId, recovered);
        } catch (recoveryError) {
          validationNotes.push(`Missing question ${questionId} recovery failed: ${errorMessage(recoveryError)}`);
          await this.log(runId, "response", `Question ${questionId} recovery failed for participant #${participant.ordinal}`, "WARN", participantId);
        }
      }

      const normalizedAnswers = validateAnswers(
        surveySchema,
        questions.map((question, index) => {
          const existing = answerMap.get(question.id);
          if (!existing) {
            if (!question.required) {
              return postProcessAnswer(
                question,
                {
                  questionId: question.id,
                  selectedOptionIds: [],
                  matrixAnswers: [],
                  isSkipped: true,
                  skipReason: "optional",
                  confidence: 0.2,
                },
                identity,
                index,
                questions.length,
              );
            }
            return {
              questionId: question.id,
              selectedOptionIds: [],
              matrixAnswers: [],
            } satisfies StructuredAnswer;
          }

          return postProcessAnswer(question, existing, identity, index, questions.length);
        }),
      );
      const rawPayload = {
        mode: "jsonl_per_question",
        lineCount: lineNumber,
        lines: rawLines,
        answers: normalizedAnswers,
      };

      await prisma.$transaction(async (tx) => {
        await tx.surveyAnswer.deleteMany({ where: { surveyResponseId: participant.surveyResponse?.id } });
        const response = await tx.surveyResponse.update({
          where: { participantInstanceId: participantId },
          data: {
            status: TaskStatus.COMPLETED,
            rawPayload: toJson(rawPayload),
            validationErrors: validationNotes.length ? toJson(validationNotes) : Prisma.JsonNull,
            errorMessage: null,
            completedAt: new Date(),
          },
        });
        for (const answer of normalizedAnswers) {
          await tx.surveyAnswer.create({
            data: {
              surveyResponseId: response.id,
              questionId: answer.questionId,
              answer: toJson(answer),
            },
          });
        }
        await tx.participantInstance.update({ where: { id: participantId }, data: { status: TaskStatus.COMPLETED, errorMessage: null } });
      });

      await this.updateProgress(runId, { responseCompletedDelta: 1 });
      await this.log(runId, "response", `Response completed for participant #${participant.ordinal}`, "INFO", participantId);
    } catch (error) {
      if (context.cancelRequested || isCanceledError(error)) {
        await prisma.surveyResponse.update({
          where: { participantInstanceId: participantId },
          data: {
            status: TaskStatus.CANCELED,
            rawPayload: rawLines.length
              ? toJson({
                  mode: "jsonl_per_question",
                  lineCount: lineNumber,
                  lines: rawLines,
                })
              : Prisma.JsonNull,
            errorMessage: "Canceled",
            validationErrors: validationNotes.length ? toJson(validationNotes) : Prisma.JsonNull,
            completedAt: new Date(),
          },
        }).catch(() => undefined);
        await prisma.participantInstance.update({
          where: { id: participantId },
          data: { status: TaskStatus.CANCELED, errorMessage: "Canceled" },
        }).catch(() => undefined);
        return;
      }
      const failurePayload = rawLines.length
        ? {
            mode: "jsonl_per_question",
            lineCount: lineNumber,
            lines: rawLines,
          }
        : Prisma.JsonNull;
      await prisma.surveyResponse.update({
        where: { participantInstanceId: participantId },
        data: {
          status: TaskStatus.FAILED,
          rawPayload: failurePayload === Prisma.JsonNull ? Prisma.JsonNull : toJson(failurePayload),
          errorMessage: errorMessage(error),
          validationErrors: toJson({
            error: errorMessage(error),
            notes: validationNotes,
          }),
          completedAt: new Date(),
        },
      });
      await prisma.participantInstance.update({ where: { id: participantId }, data: { status: TaskStatus.FAILED, errorMessage: errorMessage(error) } });
      await this.updateProgress(runId, { failedDelta: 1 });
      await this.log(runId, "response", errorMessage(error), "ERROR", participantId);
    }
  }

  private async finishCanceled(runId: string, participantIds?: string[]) {
    const resolvedParticipantIds =
      participantIds ??
      (
        await prisma.participantInstance.findMany({
          where: { mockRunId: runId },
          select: { id: true },
        })
      ).map((participant) => participant.id);

    await prisma.mockRun.update({
      where: { id: runId },
      data: { status: RunStatus.CANCELED, canceledAt: new Date(), completedAt: null },
    });
    await prisma.personaProfile.updateMany({
      where: { participantInstanceId: { in: resolvedParticipantIds }, status: { in: [TaskStatus.PENDING, TaskStatus.RUNNING] } },
      data: { status: TaskStatus.CANCELED, errorMessage: "Canceled" },
    });
    await prisma.surveyResponse.updateMany({
      where: { participantInstanceId: { in: resolvedParticipantIds }, status: { in: [TaskStatus.PENDING, TaskStatus.RUNNING] } },
      data: { status: TaskStatus.CANCELED, errorMessage: "Canceled", completedAt: new Date() },
    });
    await prisma.participantInstance.updateMany({
      where: { id: { in: resolvedParticipantIds }, status: { in: [TaskStatus.PENDING, TaskStatus.RUNNING] } },
      data: { status: TaskStatus.CANCELED, errorMessage: "Canceled" },
    });
    const progress = await this.computeProgress(runId);
    progress.canceled = progress.total - progress.responseCompleted - progress.failed;
    await prisma.mockRun.update({ where: { id: runId }, data: { progress: toJson(progress) } });
    await this.log(runId, "system", "Run canceled", "WARN");
  }

  private async recoverActiveRunsAtBoot() {
    await this.recoverOrphanedActiveRuns({});
  }

  private async recoverOrphanedActiveRuns(where: Prisma.MockRunWhereInput) {
    const runs = await prisma.mockRun.findMany({
      where: {
        ...where,
        status: { in: [RunStatus.QUEUED, RunStatus.RUNNING, RunStatus.CANCELING] },
      },
      select: { id: true },
    });

    await Promise.all(runs.map((run) => this.reconcileOrphanedActiveRun(run.id).catch(() => undefined)));
  }

  private async reconcileOrphanedActiveRun(runId: string) {
    if (this.activeRuns.has(runId) || this.recoveringRuns.has(runId)) {
      return;
    }
    this.recoveringRuns.add(runId);

    try {
      const run = await prisma.mockRun.findUnique({
        where: { id: runId },
        select: { status: true, userId: true },
      });

      if (!run) {
        return;
      }

      if (run.status === RunStatus.CANCELING) {
        await this.finishCanceled(runId);
        return;
      }

      if (run.status !== RunStatus.RUNNING && run.status !== RunStatus.QUEUED) {
        return;
      }

      await prisma.mockRun.update({
        where: { id: runId },
        data: {
          status: RunStatus.QUEUED,
          completedAt: null,
          canceledAt: null,
        },
      });

      const context = { cancelRequested: false, abortController: new AbortController() };
      this.activeRuns.set(runId, context);
      await this.log(runId, "system", "Run resumed automatically after runtime restart", "WARN");
      void this.executeRun(run.userId, runId, context, undefined, "continue");
    } finally {
      this.recoveringRuns.delete(runId);
    }
  }

  private async updateProgress(
    runId: string,
    change: { identityCompleted?: number; personaCompletedDelta?: number; responseCompletedDelta?: number; failedDelta?: number },
  ) {
    const run = await prisma.mockRun.findUniqueOrThrow({ where: { id: runId } });
    const progress = fromJson<ReturnType<typeof emptyProgress>>(run.progress);

    if (typeof change.identityCompleted === "number") progress.identityCompleted = change.identityCompleted;
    if (change.personaCompletedDelta) progress.personaCompleted += change.personaCompletedDelta;
    if (change.responseCompletedDelta) progress.responseCompleted += change.responseCompletedDelta;
    if (change.failedDelta) progress.failed += change.failedDelta;

    await prisma.mockRun.update({ where: { id: runId }, data: { progress: toJson(progress) } });
  }

  private async computeProgress(runId: string) {
    const participants = await prisma.participantInstance.findMany({
      where: { mockRunId: runId },
      include: { personaProfile: true, surveyResponse: true },
    });
    return {
      total: participants.length,
      identityCompleted: participants.length,
      personaCompleted: participants.filter((participant) => participant.personaProfile?.status === TaskStatus.COMPLETED).length,
      responseCompleted: participants.filter((participant) => participant.surveyResponse?.status === TaskStatus.COMPLETED).length,
      failed: participants.filter((participant) => participant.status === TaskStatus.FAILED).length,
      canceled: participants.filter((participant) => participant.status === TaskStatus.CANCELED).length,
    };
  }

  private async log(runId: string, stage: string, message: string, level: "INFO" | "WARN" | "ERROR", participantInstanceId?: string) {
    await prisma.runLog.create({
      data: { mockRunId: runId, participantInstanceId, stage, level, message },
    }).catch(() => undefined);
  }
}
