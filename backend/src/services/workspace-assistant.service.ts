import {
  getBuiltinParticipantAttributes,
  normalizeParticipantAttributeDefinitions,
  type ParticipantTemplateDto,
} from "@surveysim/shared";
import { z } from "zod";
import type { AuthUserContext } from "../types/auth.js";
import { SurveyService } from "./survey.service.js";
import { ParticipantTemplateService } from "./participant-template.service.js";

const quickCreateInputSchema = z.object({
  brief: z.string().min(1),
  llmConfigId: z.string().optional(),
  survey: z
    .object({
      titleHint: z.string().max(160).optional(),
      topic: z.string().max(240).optional(),
      goal: z.string().max(500).optional(),
      audience: z.string().max(240).optional(),
      language: z.string().max(40).optional(),
      style: z.enum(["exploratory", "feedback", "screening", "evaluation"]).default("exploratory"),
      questionCount: z.enum(["short", "standard", "deep"]).default("standard"),
    })
    .default({}),
  participant: z
    .object({
      nameHint: z.string().max(160).optional(),
      audienceSummary: z.string().max(500).optional(),
      sampleSizePreview: z.number().int().min(10).max(5000).default(300),
      randomnessLevel: z.enum(["low", "medium", "high"]).default("medium"),
      noiseProfile: z.enum(["conservative", "balanced", "expressive"]).default("balanced"),
    })
    .default({}),
});

type QuickCreateInput = z.infer<typeof quickCreateInputSchema>;

function buildStoredBrief(payload: QuickCreateInput) {
  return [
    "Quick create request",
    `Brief: ${payload.brief}`,
    payload.survey.topic ? `Topic: ${payload.survey.topic}` : undefined,
    payload.survey.goal ? `Goal: ${payload.survey.goal}` : undefined,
    payload.survey.audience ? `Survey audience: ${payload.survey.audience}` : undefined,
    payload.survey.style ? `Survey style: ${payload.survey.style}` : undefined,
    payload.survey.questionCount ? `Desired depth: ${payload.survey.questionCount}` : undefined,
    payload.survey.language ? `Language: ${payload.survey.language}` : undefined,
    payload.participant.audienceSummary ? `Participant summary: ${payload.participant.audienceSummary}` : undefined,
    payload.participant.nameHint ? `Participant template hint: ${payload.participant.nameHint}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildSurveyPrompt(payload: QuickCreateInput) {
  return [
    payload.brief,
    payload.survey.topic ? `Topic: ${payload.survey.topic}` : undefined,
    payload.survey.goal ? `Goal: ${payload.survey.goal}` : undefined,
    payload.survey.audience ? `Target respondents: ${payload.survey.audience}` : undefined,
    payload.survey.style ? `Survey style: ${payload.survey.style}` : undefined,
    payload.survey.questionCount ? `Desired depth: ${payload.survey.questionCount}` : undefined,
    payload.survey.language ? `Preferred language: ${payload.survey.language}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildParticipantPrompt(payload: QuickCreateInput) {
  return [
    `Core brief: ${payload.brief}`,
    payload.survey.topic ? `Survey topic: ${payload.survey.topic}` : undefined,
    payload.survey.goal ? `Research goal: ${payload.survey.goal}` : undefined,
    payload.survey.audience ? `Who should answer the survey: ${payload.survey.audience}` : undefined,
    payload.participant.audienceSummary ? `Participant generation guidance: ${payload.participant.audienceSummary}` : undefined,
    payload.survey.style ? `Survey style to align with: ${payload.survey.style}` : undefined,
    payload.survey.questionCount ? `Survey depth to align with: ${payload.survey.questionCount}` : undefined,
    "Create a compact but reusable participant template that matches this questionnaire.",
    "Prefer a few high-signal rules instead of too many low-value rules.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildParticipantArchetype(payload: QuickCreateInput) {
  const label = payload.participant.nameHint ?? payload.survey.audience ?? payload.participant.audienceSummary;
  const description = payload.participant.audienceSummary ?? payload.survey.goal ?? payload.brief;

  if (!label?.trim()) {
    return undefined;
  }

  return {
    label: label.slice(0, 120),
    description: description?.slice(0, 1000),
    scenarioContext: (payload.survey.topic ?? payload.survey.goal)?.slice(0, 240),
    seedTags: [],
  };
}

function buildParticipantTemplateName(payload: QuickCreateInput, surveyTitle: string) {
  if (payload.participant.nameHint?.trim()) {
    return payload.participant.nameHint.trim();
  }
  if (payload.survey.audience?.trim()) {
    return `${payload.survey.audience.trim()} audience`;
  }
  return `${surveyTitle} audience`;
}

export class WorkspaceAssistantService {
  private readonly surveyService = new SurveyService();
  private readonly participantTemplateService = new ParticipantTemplateService();

  async quickCreate(user: AuthUserContext, input: unknown) {
    const payload = quickCreateInputSchema.parse(input);
    const surveyDraft = await this.surveyService.generateWithAi(user, {
      prompt: buildSurveyPrompt(payload),
      title: payload.survey.titleHint,
      llmConfigId: payload.llmConfigId,
    });

    const createdSurvey = await this.surveyService.create(user.id, {
      title: surveyDraft.schema.survey.title,
      description: surveyDraft.schema.survey.description,
      rawText: buildStoredBrief(payload),
      schema: surveyDraft.schema,
    });

    const builtinAttributes = normalizeParticipantAttributeDefinitions(
      getBuiltinParticipantAttributes().filter((attribute) => attribute.key !== "noise"),
    );

    const participantTemplateDraft = await this.participantTemplateService.generateWithAi(user, {
      prompt: buildParticipantPrompt(payload),
      llmConfigId: payload.llmConfigId,
      templateName: buildParticipantTemplateName(payload, createdSurvey.title),
      templateDescription: payload.participant.audienceSummary ?? payload.survey.goal ?? payload.brief,
      archetypeProfile: buildParticipantArchetype(payload),
      attributes: builtinAttributes,
      randomConfig: {
        randomnessLevel: payload.participant.randomnessLevel,
        noiseProfile: payload.participant.noiseProfile,
      },
    });

    const createdParticipantTemplate = (await this.participantTemplateService.create(user.id, {
      template: {
        ...participantTemplateDraft.template,
        sampleSizePreview: payload.participant.sampleSizePreview,
      },
      rules: participantTemplateDraft.rules,
    })) as ParticipantTemplateDto;

    return {
      survey: createdSurvey,
      participantTemplate: createdParticipantTemplate,
      notes: [...surveyDraft.extractionNotes, ...participantTemplateDraft.notes],
    };
  }
}
