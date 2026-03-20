import { randomUUID } from "node:crypto";
import { surveyImportInputSchema, surveySaveInputSchema, surveySchema, type SurveyDraft, type SurveySchemaDto } from "@formagents/shared";
import { fromJson } from "../lib/json.js";
import { llmConfigRepository } from "../repositories/llm-config.repository.js";
import { surveyRepository } from "../repositories/survey.repository.js";
import { LlmService } from "./llm/llm.service.js";
import { toIsoString } from "../utils/serialize.js";

function ensureSchemaIds(schema: SurveySchemaDto): SurveySchemaDto {
  return {
    survey: schema.survey,
    sections: schema.sections.map((section, sectionIndex) => ({
      ...section,
      id: section.id || `section_${sectionIndex + 1}_${randomUUID().slice(0, 8)}`,
      displayOrder: section.displayOrder ?? sectionIndex,
      questions: section.questions.map((question, questionIndex) => ({
        ...question,
        id: question.id || `question_${sectionIndex + 1}_${questionIndex + 1}_${randomUUID().slice(0, 8)}`,
        displayOrder: question.displayOrder ?? questionIndex,
        options: question.options.map((option, optionIndex) => ({
          ...option,
          id: option.id || `option_${questionIndex + 1}_${optionIndex + 1}_${randomUUID().slice(0, 8)}`,
          displayOrder: option.displayOrder ?? optionIndex,
          value: option.value || option.label,
        })),
      })),
    })),
  };
}

function pickSchemaCandidate(payload: any) {
  const candidates = [payload?.schema, payload?.surveySchema, payload?.data, payload];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalizedCandidate = typeof candidate === "string" ? JSON.parse(candidate) : candidate;
    if (normalizedCandidate.survey || normalizedCandidate.sections || Array.isArray(normalizedCandidate)) {
      return normalizedCandidate;
    }
  }
  return payload?.schema ?? payload;
}

function createLooseSection(title: string, displayOrder: number) {
  return {
    id: `section_${displayOrder + 1}_${randomUUID().slice(0, 8)}`,
    title,
    displayOrder,
    questions: [] as Array<SurveySchemaDto["sections"][number]["questions"][number]>,
  };
}

function toLooseOption(option: any, displayOrder: number) {
  return {
    id: option?.id ?? `option_${displayOrder + 1}_${randomUUID().slice(0, 8)}`,
    label: option?.label ?? option?.text ?? option?.value ?? `Option ${displayOrder + 1}`,
    value: option?.value ?? option?.label ?? option?.text ?? `Option ${displayOrder + 1}`,
    displayOrder,
    allowOther: option?.allowOther ?? false,
  };
}

function toValidation(item: any) {
  if (item?.validation) {
    return item.validation;
  }
  if (item?.scale) {
    return {
      minRating: item.scale.min,
      maxRating: item.scale.max,
    };
  }
  return undefined;
}

function normalizeLooseSchema(candidate: any, fallbackTitle?: string): SurveySchemaDto {
  const normalizedCandidate = typeof candidate === "string" ? JSON.parse(candidate) : candidate;

  if (normalizedCandidate?.survey || normalizedCandidate?.sections) {
    return normalizedCandidate as SurveySchemaDto;
  }

  const items = Array.isArray(normalizedCandidate)
    ? normalizedCandidate
    : Array.isArray(normalizedCandidate?.schema)
      ? normalizedCandidate.schema
      : Array.isArray(normalizedCandidate?.items)
        ? normalizedCandidate.items
        : [];

  const inferredTitle = normalizedCandidate?.title ?? normalizedCandidate?.surveyTitle ?? fallbackTitle;
  const respondentInstructionTexts: string[] = [];
  const standaloneSectionTitles = items.filter((item: any) => item?.type === "section_title").map((item: any) => item?.title ?? item?.text).filter(Boolean);
  const sections: SurveySchemaDto["sections"] = [];
  let currentSection = createLooseSection(standaloneSectionTitles.length > 1 ? standaloneSectionTitles[1] : "Section 1", 0);
  let consumedTitleFromSection = false;

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const type = item.type;
    const text = item.title ?? item.text ?? item.label ?? "";

    if (type === "section_title") {
      if (!consumedTitleFromSection && !fallbackTitle && sections.length === 0 && currentSection.questions.length === 0) {
        consumedTitleFromSection = true;
        continue;
      }

      if (currentSection.questions.length > 0) {
        sections.push(currentSection);
      }
      currentSection = createLooseSection(text || `Section ${sections.length + 1}`, sections.length);
      continue;
    }

    if (type === "respondent_instruction" && sections.length === 0 && currentSection.questions.length === 0) {
      respondentInstructionTexts.push(text);
      continue;
    }

    currentSection.questions.push({
      id: item.id ?? `question_${randomUUID().slice(0, 8)}`,
      code: item.code,
      type,
      title: text || "Untitled question",
      description: item.description,
      required: item.required ?? false,
      displayOrder: currentSection.questions.length,
      respondentInstructions: item.respondentInstructions,
      options: Array.isArray(item.options) ? item.options.map((option: any, optionIndex: number) => toLooseOption(option, optionIndex)) : [],
      validation: toValidation(item),
    });
  }

  if (currentSection.questions.length > 0 || sections.length === 0) {
    sections.push(currentSection);
  }

  return {
    survey: {
      title: inferredTitle ?? standaloneSectionTitles[0] ?? "Imported Survey",
      respondentInstructions: respondentInstructionTexts.join("\n") || undefined,
      language: normalizedCandidate?.language ?? normalizedCandidate?.survey?.language ?? "auto",
    },
    sections,
  };
}

function mapSurvey(survey: any) {
  return {
    id: survey.id,
    title: survey.title,
    description: survey.description ?? undefined,
    rawText: survey.sourceText,
    schema: fromJson<SurveySchemaDto>(survey.schema),
    createdAt: toIsoString(survey.createdAt)!,
    updatedAt: toIsoString(survey.updatedAt)!,
  };
}

export class SurveyService {
  private readonly llmService = new LlmService();

  async list(userId: string) {
    const surveys = await surveyRepository.list(userId);
    return surveys.map((survey) => mapSurvey(survey));
  }

  async get(userId: string, id: string) {
    const survey = await surveyRepository.getById(userId, id);
    if (!survey) throw new Error("Survey not found");
    return mapSurvey(survey);
  }

  async importDraft(userId: string, input: unknown): Promise<SurveyDraft> {
    const payload = surveyImportInputSchema.parse(input);
    const config = payload.llmConfigId
      ? await this.llmService.getRuntimeConfig(userId, payload.llmConfigId)
      : await this.llmService.getDefaultRuntimeConfig(userId);

    const llmResult = await this.llmService.generateJson<any>(
      config,
      [
        {
          role: "system",
          content: [
            "You are a survey structure extraction engine.",
            "Convert raw questionnaire text into strict JSON.",
            "Keep original language.",
            "Use question types: single_choice, multi_choice, single_choice_other, multi_choice_other, rating, open_text, paragraph, section_title, respondent_instruction.",
            "Every question and option must include stable ids.",
            "Return JSON only with keys: rawText, schema, extractionNotes.",
          ].join(" "),
        },
        {
          role: "user",
          content: `Raw survey content:
${payload.rawText}`,
        },
      ],
      "Return valid JSON for the survey draft only.",
    );

    const normalized = {
      rawText: payload.rawText,
      schema: ensureSchemaIds(surveySchema.parse(normalizeLooseSchema(pickSchemaCandidate(llmResult), payload.title))),
      extractionNotes: llmResult.extractionNotes ?? llmResult.notes ?? [],
    };

    return normalized;
  }

  async create(userId: string, input: unknown) {
    const payload = surveySaveInputSchema.parse(input);
    const normalized = { ...payload, schema: ensureSchemaIds(surveySchema.parse(payload.schema)) };
    const created = await surveyRepository.create(userId, normalized);
    return mapSurvey(created);
  }

  async update(userId: string, id: string, input: unknown) {
    const payload = surveySaveInputSchema.parse(input);
    const existing = await surveyRepository.getById(userId, id);
    if (!existing) throw new Error("Survey not found");
    const normalized = { ...payload, schema: ensureSchemaIds(surveySchema.parse(payload.schema)) };
    const updated = await surveyRepository.update(userId, id, normalized);
    return mapSurvey(updated);
  }
}
