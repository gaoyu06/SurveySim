import {
  applySurveyImportRecordToDraft,
  createEmptySurveyDraft,
  ensureSurveySchemaIds,
  finalizeSurveyDraft,
  surveyAiGenerateInputSchema,
  surveyAiGenerateResultSchema,
  surveyImportInputSchema,
  surveyImportJsonlRecordSchema,
  surveyImportRetryRecordInputSchema,
  surveySaveInputSchema,
  type SurveyAiGenerateResult,
  type SurveyDraft,
  type SurveyImportJsonlRecord,
  type SurveyImportRecordEvent,
  type SurveyImportStreamEvent,
  type SurveySchemaDto,
} from "@surveysim/shared";
import { fromJson } from "../lib/json.js";
import { surveyRepository } from "../repositories/survey.repository.js";
import type { AuthUserContext } from "../types/auth.js";
import { isAdmin, resolveDataScope } from "../utils/access.js";
import { LlmService } from "./llm/llm.service.js";
import { UsageLimitService } from "./usage-limit.service.js";
import { buildSurveyExtractJsonlTask, buildSurveyGenerateTask, buildSurveyRepairJsonlRecordTask } from "./ai-tasks/index.js";
import { toIsoString } from "../utils/serialize.js";

function summarizeRecord(record: SurveyImportJsonlRecord) {
  if (record.recordType === "survey_meta") {
    return `content_task_meta · ${record.title}`;
  }

  if (record.recordType === "section") {
    return `section · ${record.title}`;
  }

  return `question · ${record.type} · ${record.title}`;
}

function toRecordEvent(
  index: number,
  status: SurveyImportRecordEvent["status"],
  rawLine: string,
  record?: SurveyImportJsonlRecord,
  message?: string,
  repairedLine?: string,
): SurveyImportRecordEvent {
  return {
    type: "record",
    index,
    status,
    record,
    recordType: record?.recordType,
    questionType: record?.recordType === "question" ? record.type : undefined,
    title: record?.title,
    summary: record ? summarizeRecord(record) : undefined,
    rawLine,
    repairedLine,
    message,
  };
}

function mapSurvey(survey: any) {
  return {
    id: survey.id,
    ownerId: survey.userId,
    ownerEmail: survey.user?.email,
    title: survey.title,
    description: survey.description ?? undefined,
    rawText: survey.sourceText,
    schema: fromJson<SurveySchemaDto>(survey.schema),
    isOwnedByCurrentUser: false,
    createdAt: toIsoString(survey.createdAt)!,
    updatedAt: toIsoString(survey.updatedAt)!,
  };
}

export class SurveyService {
  private readonly llmService = new LlmService();
  private readonly usageLimitService = new UsageLimitService();

  async retryImportRecord(user: AuthUserContext, input: unknown, options?: { consumeUsage?: boolean }): Promise<SurveyImportRecordEvent> {
    if (options?.consumeUsage !== false) {
      await this.usageLimitService.consumeOrThrow(user, "content task import retry");
    }
    const payload = surveyImportRetryRecordInputSchema.parse(input);
    const config = payload.llmConfigId
      ? await this.llmService.getRuntimeConfig(user, payload.llmConfigId)
      : await this.llmService.getDefaultRuntimeConfig(user.id);

    const repairTask = buildSurveyRepairJsonlRecordTask({
      rawText: payload.rawText,
      invalidLine: payload.invalidLine,
      errorMessage: payload.errorMessage ?? "Manual retry requested",
    });

    const repaired = await this.llmService.generateJson<SurveyImportJsonlRecord>(
      config,
      repairTask.messages,
      repairTask.fixerPrompt,
    );
    const record = surveyImportJsonlRecordSchema.parse(repaired);
    return toRecordEvent(
      payload.index,
      "repaired",
      payload.invalidLine,
      record,
      payload.errorMessage ?? "Manual retry succeeded",
      JSON.stringify(repaired),
    );
  }

  async list(user: AuthUserContext, scope?: unknown) {
    const dataScope = resolveDataScope(user, scope);
    const surveys = dataScope === "all" ? await surveyRepository.listAll() : await surveyRepository.list(user.id);
    return surveys.map((survey) => ({ ...mapSurvey(survey), isOwnedByCurrentUser: survey.userId === user.id }));
  }

  async get(user: AuthUserContext, id: string) {
    const survey = isAdmin(user) ? await surveyRepository.getAnyById(id) : await surveyRepository.getById(user.id, id);
    if (!survey) throw new Error("Content task not found");
    return { ...mapSurvey(survey), isOwnedByCurrentUser: survey.userId === user.id };
  }

  async delete(userId: string, id: string) {
    const existing = await surveyRepository.getById(userId, id);
    if (!existing) {
      throw new Error("Content task not found");
    }

    const referencingRuns = await surveyRepository.countReferencingRuns(userId, id);
    if (referencingRuns > 0) {
      throw new Error(`This content task is used by ${referencingRuns} mock run(s) and cannot be deleted`);
    }

    await surveyRepository.delete(userId, id);
    return { success: true };
  }

  async importDraft(user: AuthUserContext, input: unknown): Promise<SurveyDraft> {
    let finalDraft: SurveyDraft | null = null;
    for await (const event of this.importDraftStream(user, input)) {
      if (event.type === "draft") {
        finalDraft = event.draft;
      }
    }
    if (!finalDraft) {
      throw new Error("Content task draft extraction did not produce a draft");
    }
    return finalDraft;
  }

  async generateWithAi(user: AuthUserContext, input: unknown): Promise<SurveyDraft> {
    await this.usageLimitService.consumeOrThrow(user, "content task ai generate");

    const payload = surveyAiGenerateInputSchema.parse(input);
    const config = payload.llmConfigId
      ? await this.llmService.getRuntimeConfig(user, payload.llmConfigId)
      : await this.llmService.getDefaultRuntimeConfig(user.id);

    const generateTask = buildSurveyGenerateTask({
      prompt: payload.prompt,
      title: payload.title,
    });

    const generated = await this.llmService.generateJson<SurveyAiGenerateResult>(
      config,
      generateTask.messages,
      generateTask.fixerPrompt,
    );

    const parsed = surveyAiGenerateResultSchema.parse(generated);
    return finalizeSurveyDraft({
      rawText: payload.prompt,
      schema: ensureSurveySchemaIds(parsed.schema),
      extractionNotes: parsed.extractionNotes,
    }, payload.title);
  }

  async *importDraftStream(user: AuthUserContext, input: unknown): AsyncGenerator<SurveyImportStreamEvent> {
    await this.usageLimitService.consumeOrThrow(user, "content task import");
    yield { type: "status", stage: "queued", message: "Content task extraction queued" };

    const payload = surveyImportInputSchema.parse(input);
    const config = payload.llmConfigId
      ? await this.llmService.getRuntimeConfig(user, payload.llmConfigId)
      : await this.llmService.getDefaultRuntimeConfig(user.id);

    let draft = createEmptySurveyDraft(payload.rawText, payload.title);
    const queue: SurveyImportStreamEvent[] = [];
    let wake: (() => void) | null = null;
    let failed: Error | null = null;
    let finished = false;
    let lineNumber = 0;
    let buffer = "";

    const push = (event: SurveyImportStreamEvent) => {
      queue.push(event);
      wake?.();
      wake = null;
    };

    const processJsonlLine = async (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      lineNumber += 1;
      push({ type: "status", stage: "validating", message: `Validating JSONL record ${lineNumber}` });

      let record: SurveyImportJsonlRecord;
      try {
        record = surveyImportJsonlRecordSchema.parse(JSON.parse(trimmed));
        push(toRecordEvent(lineNumber, "validated", trimmed, record, `Record ${lineNumber} validated`));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        draft.extractionNotes.push(`Record ${lineNumber} repair attempted: ${message}`);
        push({ type: "status", stage: "repairing", message: `Record ${lineNumber} invalid, repairing with LLM` });
        try {
          const retried = await this.retryImportRecord(user, {
            rawText: payload.rawText,
            invalidLine: trimmed,
            errorMessage: message,
            llmConfigId: payload.llmConfigId,
            index: lineNumber,
          }, { consumeUsage: false });
          push(retried);
          record = surveyImportJsonlRecordSchema.parse(JSON.parse(retried.repairedLine!));
        } catch (repairError) {
          const repairMessage = repairError instanceof Error ? repairError.message : String(repairError);
          draft.extractionNotes.push(`Record ${lineNumber} skipped after repair failure: ${repairMessage}`);
          push(toRecordEvent(lineNumber, "skipped", trimmed, undefined, repairMessage));
          return;
        }
      }

      draft = applySurveyImportRecordToDraft(draft, record);
    };

    push({ type: "status", stage: "extracting", message: "Streaming content-task JSONL records from LLM" });
    const extractTask = buildSurveyExtractJsonlTask({ rawText: payload.rawText, title: payload.title });

    const streamTask = this.llmService
      .generateTextStream(config, extractTask.messages, async (event) => {
          if (event.type === "status" && event.message) {
            return;
          }

          if (event.type === "delta" && event.chunk) {
            push({ type: "delta", chunk: event.chunk });
            buffer += event.chunk;

            const parts = buffer.split(/\r?\n/);
            buffer = parts.pop() ?? "";

            for (const line of parts) {
              await processJsonlLine(line);
            }
          }
        })
      .then(async () => {
        if (buffer.trim()) {
          await processJsonlLine(buffer);
        }
        return null;
      })
      .catch((error) => {
        return error instanceof Error ? error : new Error(String(error));
      })
      .finally(() => {
        finished = true;
        wake?.();
        wake = null;
      });

    while (!finished || queue.length > 0) {
      if (!queue.length) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        continue;
      }
      yield queue.shift()!;
    }

    const failure = await streamTask;
    if (failure) {
      if (lineNumber > 0) {
        draft.extractionNotes.push(`Extraction interrupted after ${lineNumber} records: ${failure.message}`);
        yield { type: "status", stage: "normalizing", message: "Normalizing validated JSONL records before interruption" };
        yield { type: "draft", draft: finalizeSurveyDraft(draft, payload.title) };
      }
      yield {
        type: "status",
        stage: "interrupted",
        message: lineNumber > 0 ? `Extraction interrupted after ${lineNumber} records: ${failure.message}` : failure.message,
      };
      throw failure;
    }

    yield { type: "status", stage: "normalizing", message: "Normalizing validated JSONL records into content-task schema" };

    const finalDraft = finalizeSurveyDraft(draft, payload.title);
    yield { type: "draft", draft: finalDraft };
    yield { type: "status", stage: "completed", message: "Extraction completed. Review and edit before saving." };
  }

  async create(userId: string, input: unknown) {
    const payload = surveySaveInputSchema.parse(input);
    const normalized = { ...payload, schema: ensureSurveySchemaIds(payload.schema) };
    const created = await surveyRepository.create(userId, normalized);
    return { ...mapSurvey(created), isOwnedByCurrentUser: true };
  }

  async update(userId: string, id: string, input: unknown) {
    const payload = surveySaveInputSchema.parse(input);
    const existing = await surveyRepository.getById(userId, id);
    if (!existing) throw new Error("Content task not found");
    const normalized = { ...payload, schema: ensureSurveySchemaIds(payload.schema) };
    const updated = await surveyRepository.update(userId, id, normalized);
    return { ...mapSurvey(updated), isOwnedByCurrentUser: true };
  }
}
