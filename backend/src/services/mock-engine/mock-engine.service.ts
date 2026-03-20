import pLimit from "p-limit";
import { Prisma, RunStatus, TaskStatus } from "@prisma/client";
import {
  mockRunCreateInputSchema,
  participantIdentitySchema,
  structuredAnswerSchema,
  type MockRunDto,
  type ParticipantIdentity,
  type StructuredAnswer,
  type SurveySchemaDto,
} from "@formagents/shared";
import { prisma } from "../../lib/db.js";
import { fromJson, toJson } from "../../lib/json.js";
import { LlmService } from "../llm/llm.service.js";
import { ParticipantTemplateService } from "../participant-template.service.js";
import { ReportService } from "../reporting/report.service.js";
import { toIsoString } from "../../utils/serialize.js";

interface RunContext {
  cancelRequested: boolean;
}

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

function mapRun(run: {
  id: string;
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
    participantTemplateId: run.participantTemplateId,
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
  return Boolean(answer.selectedOptionIds.length || answer.otherText || answer.textAnswer || typeof answer.ratingValue === "number");
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

function normalizeAnswerItem(question: InteractiveQuestion | undefined, questionId: string, rawValue: unknown) {
  if (!question) {
    if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)) {
      return { questionId, ...(rawValue as Record<string, unknown>) };
    }
    return { questionId, textAnswer: normalizeTextValue(rawValue) };
  }

  const record = rawValue && typeof rawValue === "object" && !Array.isArray(rawValue) ? (rawValue as Record<string, unknown>) : undefined;

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
      };
    }
    case "rating": {
      const ratingSource = record?.ratingValue ?? record?.rating ?? record?.score ?? record?.value ?? record?.answer ?? rawValue;
      return {
        questionId,
        ratingValue: normalizeNumberValue(ratingSource),
      };
    }
    case "open_text": {
      const textSource = record?.textAnswer ?? record?.text ?? record?.answer ?? record?.value ?? record?.otherText ?? record?.other ?? rawValue;
      return {
        questionId,
        textAnswer: normalizeTextValue(textSource),
      };
    }
    default:
      return { questionId };
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

function validateAnswers(schema: SurveySchemaDto, rawPayload: unknown) {
  const questions = interactiveQuestions(schema);
  const questionMap = new Map(questions.map((question) => [question.id, question]));
  const answers = normalizeAnswerCollection(questionMap, rawPayload).map((answer) => structuredAnswerSchema.parse(answer));

  for (const answer of answers) {
    const question = questionMap.get(answer.questionId);
    if (!question) {
      throw new Error(`Unknown questionId: ${answer.questionId}`);
    }

    switch (question.type) {
      case "single_choice":
      case "single_choice_other": {
        if (answer.selectedOptionIds.length > 1) throw new Error(`Question ${question.id} only accepts one option`);
        break;
      }
      case "multi_choice":
      case "multi_choice_other": {
        if (question.validation?.minSelections && answer.selectedOptionIds.length < question.validation.minSelections) {
          throw new Error(`Question ${question.id} requires at least ${question.validation.minSelections} selections`);
        }
        if (question.validation?.maxSelections && answer.selectedOptionIds.length > question.validation.maxSelections) {
          throw new Error(`Question ${question.id} exceeds max selections`);
        }
        break;
      }
      case "rating": {
        if (typeof answer.ratingValue !== "number") throw new Error(`Question ${question.id} requires ratingValue`);
        const min = question.validation?.minRating ?? 1;
        const max = question.validation?.maxRating ?? 5;
        if (answer.ratingValue < min || answer.ratingValue > max) throw new Error(`Question ${question.id} rating out of range`);
        break;
      }
      case "open_text": {
        if (!answer.textAnswer && !answer.otherText) throw new Error(`Question ${question.id} requires textAnswer`);
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
  }

  for (const question of questions.filter((item) => item.required)) {
    const answer = answers.find((item) => item.questionId === question.id);
    if (!answer || !hasMeaningfulAnswer(answer)) {
      throw new Error(`Missing required answer for ${question.id}`);
    }
  }

  return answers;
}

export class MockEngineService {
  private readonly llmService = new LlmService();
  private readonly templateService = new ParticipantTemplateService();
  private readonly reportService = new ReportService();
  private readonly activeRuns = new Map<string, RunContext>();

  async list(userId: string) {
    const runs = await prisma.mockRun.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
    return runs.map(mapRun);
  }

  async get(userId: string, runId: string) {
    const run = await prisma.mockRun.findFirst({
      where: { id: runId, userId },
      include: {
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
      participants: run.participantInstances.map((participant) => ({
        id: participant.id,
        ordinal: participant.ordinal,
        status: participant.status.toLowerCase(),
        identity: fromJson<ParticipantIdentity>(participant.identity),
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

  async create(userId: string, input: unknown) {
    const payload = mockRunCreateInputSchema.parse(input);
    const [template, survey, llmConfig] = await Promise.all([
      prisma.participantTemplate.findFirst({ where: { id: payload.participantTemplateId, userId }, include: { rules: true } }),
      prisma.survey.findFirst({ where: { id: payload.surveyId, userId } }),
      prisma.llmProviderConfig.findFirst({ where: { id: payload.llmConfigId, userId } }),
    ]);

    if (!template) throw new Error("Participant template not found");
    if (!survey) throw new Error("Survey not found");
    if (!llmConfig) throw new Error("LLM config not found");

    const run = await prisma.mockRun.create({
      data: {
        userId,
        ...payload,
        status: RunStatus.DRAFT,
        progress: toJson(emptyProgress(payload.participantCount)),
      },
    });

    return mapRun(run);
  }

  async start(userId: string, runId: string) {
    const run = await prisma.mockRun.findFirst({ where: { id: runId, userId } });
    if (!run) throw new Error("Mock run not found");
    if (run.status === RunStatus.RUNNING || run.status === RunStatus.QUEUED) return mapRun(run);

    await prisma.mockRun.update({
      where: { id: runId },
      data: { status: RunStatus.QUEUED, startedAt: run.startedAt ?? new Date(), completedAt: null, canceledAt: null },
    });

    const context = { cancelRequested: false };
    this.activeRuns.set(runId, context);
    void this.executeRun(userId, runId, context);

    const refreshed = await prisma.mockRun.findUniqueOrThrow({ where: { id: runId } });
    return mapRun(refreshed);
  }

  async cancel(userId: string, runId: string) {
    const run = await prisma.mockRun.findFirst({ where: { id: runId, userId } });
    if (!run) throw new Error("Mock run not found");
    const context = this.activeRuns.get(runId);
    if (context) {
      context.cancelRequested = true;
    }
    await prisma.mockRun.update({ where: { id: runId }, data: { status: RunStatus.CANCELING } });
    await this.log(runId, "system", "Cancellation requested", "WARN");
    return { success: true };
  }

  async retryParticipants(userId: string, runId: string, participantIds: string[]) {
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

    const context = { cancelRequested: false };
    this.activeRuns.set(runId, context);
    void this.executeRun(userId, runId, context, participantIds);
    return { success: true };
  }

  private async executeRun(userId: string, runId: string, context: RunContext, targetParticipantIds?: string[]) {
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
        if (!run.reuseIdentity || participants.length === 0) {
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
        }
      } else {
        participants = participants.filter((participant) => targetParticipantIds.includes(participant.id));
      }

      const config = await this.llmService.getRuntimeConfig(userId, run.llmConfigId);
      const limit = pLimit(Math.max(1, Math.min(run.concurrency, config.concurrency ?? run.concurrency)));

      await Promise.all(
        participants.map((participant) =>
          limit(async () => {
            if (context.cancelRequested) return;
            if (participant.personaProfile?.status === TaskStatus.COMPLETED && run.reusePersonaPrompt && !targetParticipantIds) {
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
        await this.reportService.getReport(userId, runId, {});
      }
    } catch (error) {
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

    const identity = fromJson<ParticipantIdentity>(participant.identity);
    try {
      const result = await this.llmService.generateJson<{ personaPrompt: string; traits: string[]; guardrails: string[] }>(
        { ...config, temperature: Math.max(config.temperature, 0.9) },
        [
          {
            role: "system",
            content:
              "You generate vivid but bounded respondent personas. Keep them consistent with the identity. Include subtle inconsistency, life details, speaking style, and realistic imperfections. Return JSON only.",
          },
          {
            role: "user",
            content: JSON.stringify({ identity, surveyTitle: surveySchema.survey.title, extraRespondentPrompt }),
          },
        ],
        'Return JSON: {"personaPrompt": string, "traits": string[], "guardrails": string[] }',
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

    const identity = fromJson<ParticipantIdentity>(participant.identity);

    const promptPayload = {
      survey: surveySchema,
      identity,
      personaPrompt: participant.personaProfile.promptText,
      respondentInstructions: surveySchema.survey.respondentInstructions,
      extraRespondentPrompt: prompts.extraRespondentPrompt,
      answeringRules: [
        "Return JSON only with key answers.",
        "Use questionId and exact option ids.",
        "No explanations outside JSON.",
      ],
    };

    let raw: unknown = null;
    try {
      raw = await this.llmService.generateJson<{ answers: StructuredAnswer[] }>(
        config,
        [
          { role: "system", content: `You simulate a survey respondent. ${prompts.extraSystemPrompt ?? ""}`.trim() },
          { role: "user", content: JSON.stringify(promptPayload) },
        ],
        'Return JSON: {"answers": [{"questionId": string, "selectedOptionIds": string[], "otherText": string?, "ratingValue": number?, "textAnswer": string?}] }',
      );

      const normalizedAnswers = validateAnswers(surveySchema, raw);

      await prisma.$transaction(async (tx) => {
        await tx.surveyAnswer.deleteMany({ where: { surveyResponseId: participant.surveyResponse?.id } });
        const response = await tx.surveyResponse.update({
          where: { participantInstanceId: participantId },
          data: {
            status: TaskStatus.COMPLETED,
            rawPayload: toJson(raw),
            validationErrors: Prisma.JsonNull,
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
      await prisma.surveyResponse.update({
        where: { participantInstanceId: participantId },
        data: {
          status: TaskStatus.FAILED,
          rawPayload: raw == null ? Prisma.JsonNull : toJson(raw),
          errorMessage: error instanceof Error ? error.message : String(error),
          validationErrors: toJson({ error: error instanceof Error ? error.message : String(error) }),
          completedAt: new Date(),
        },
      });
      await prisma.participantInstance.update({ where: { id: participantId }, data: { status: TaskStatus.FAILED, errorMessage: error instanceof Error ? error.message : String(error) } });
      await this.updateProgress(runId, { failedDelta: 1 });
      await this.log(runId, "response", error instanceof Error ? error.message : String(error), "ERROR", participantId);
    }
  }

  private async finishCanceled(runId: string, participantIds: string[]) {
    await prisma.mockRun.update({ where: { id: runId }, data: { status: RunStatus.CANCELED, canceledAt: new Date() } });
    await prisma.personaProfile.updateMany({
      where: { participantInstanceId: { in: participantIds }, status: TaskStatus.PENDING },
      data: { status: TaskStatus.CANCELED, errorMessage: "Canceled" },
    });
    await prisma.surveyResponse.updateMany({
      where: { participantInstanceId: { in: participantIds }, status: TaskStatus.PENDING },
      data: { status: TaskStatus.CANCELED, errorMessage: "Canceled" },
    });
    await prisma.participantInstance.updateMany({
      where: { id: { in: participantIds }, status: TaskStatus.PENDING },
      data: { status: TaskStatus.CANCELED, errorMessage: "Canceled" },
    });
    const progress = await this.computeProgress(runId);
    progress.canceled = participantIds.length - progress.responseCompleted - progress.failed;
    await prisma.mockRun.update({ where: { id: runId }, data: { progress: toJson(progress) } });
    await this.log(runId, "system", "Run canceled", "WARN");
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
