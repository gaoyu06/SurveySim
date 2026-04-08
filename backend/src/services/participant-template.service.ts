import {
  normalizeParticipantAttributeDefinitions,
  participantRandomConfigSchema,
  participantRuleInputSchema,
  participantTemplateAiGenerateJsonlRecordSchema,
  participantTemplateAiGenerateInputSchema,
  participantTemplateAiGenerateResultSchema,
  participantTemplateInputSchema,
  type ParticipantArchetypeProfileDto,
  type ParticipantAttributeDefinitionDto,
  type ParticipantRandomConfigDto,
  type ParticipantTemplateAiGenerateJsonlRecord,
  type ParticipantTemplateAiGenerateResult,
  type ParticipantTemplateAiGenerateStreamEvent,
  type ParticipantRuleInput,
  type ParticipantTemplateDto,
} from "@surveysim/shared";
import { fromJson } from "../lib/json.js";
import { participantTemplateRepository } from "../repositories/participant-template.repository.js";
import type { AuthUserContext } from "../types/auth.js";
import { isAdmin, resolveDataScope } from "../utils/access.js";
import { RuleEngineService } from "./rule-engine.service.js";
import { toIsoString } from "../utils/serialize.js";
import { LlmService } from "./llm/llm.service.js";
import { UsageLimitService } from "./usage-limit.service.js";
import { buildParticipantTemplateGenerateJsonlTask } from "./ai-tasks/participant-template-generate-jsonl.task.js";
import { buildParticipantTemplateRepairJsonlRecordTask } from "./ai-tasks/participant-template-repair-jsonl-record.task.js";
import { toPaginationResult, type ResolvedPagination } from "../utils/pagination.js";

type StoredTemplateDimensions =
  | Array<string | Partial<ParticipantAttributeDefinitionDto>>
  | {
      attributes?: Array<string | Partial<ParticipantAttributeDefinitionDto>>;
      archetypeProfile?: ParticipantArchetypeProfileDto;
      randomConfig?: ParticipantRandomConfigDto;
    };

function parseStoredTemplateDimensions(raw: unknown) {
  const parsed = fromJson<StoredTemplateDimensions>(raw as never);

  if (Array.isArray(parsed)) {
    return {
      attributes: parsed,
      archetypeProfile: undefined,
      randomConfig: participantRandomConfigSchema.parse({}),
    };
  }

  return {
    attributes: parsed?.attributes ?? [],
    archetypeProfile: parsed?.archetypeProfile,
    randomConfig: participantRandomConfigSchema.parse(parsed?.randomConfig ?? {}),
  };
}

function mapTemplate(template: Awaited<ReturnType<typeof participantTemplateRepository.getById>> extends infer T ? NonNullable<T> : never): ParticipantTemplateDto {
  const stored = parseStoredTemplateDimensions(template.dimensions);
  return {
    id: template.id,
    ownerId: template.userId,
    ownerEmail: template.user.email,
    isOwnedByCurrentUser: false,
    name: template.name,
    description: template.description ?? undefined,
    archetypeProfile: stored.archetypeProfile,
    attributes: normalizeParticipantAttributeDefinitions(stored.attributes),
    randomConfig: stored.randomConfig,
    sampleSizePreview: template.sampleSizePreview,
    createdAt: toIsoString(template.createdAt)!,
    updatedAt: toIsoString(template.updatedAt)!,
    rules: template.rules.map((rule) => ({
      id: rule.id,
      templateId: rule.templateId,
      name: rule.name,
      enabled: rule.enabled,
      priority: rule.priority,
      scope: rule.scope ? fromJson(rule.scope) : undefined,
      assignment: fromJson(rule.assignment),
      note: rule.note ?? undefined,
    })),
  };
}

export class ParticipantTemplateService {
  private readonly ruleEngine = new RuleEngineService();
  private readonly llmService = new LlmService();
  private readonly usageLimitService = new UsageLimitService();

  private parseTemplatePayload(input: unknown) {
    const payload = input as { template?: unknown; rules?: unknown[] };
    const templateSource = payload?.template ?? input;
    const rulesSource = payload?.rules ?? [];
    const parsedTemplate = participantTemplateInputSchema.parse(templateSource);
    const template = {
      ...parsedTemplate,
      attributes: normalizeParticipantAttributeDefinitions(parsedTemplate.attributes),
      randomConfig: participantRandomConfigSchema.parse(parsedTemplate.randomConfig ?? {}),
    };
    const rules = rulesSource.map((rule) => participantRuleInputSchema.parse(rule));
    return { template, rules };
  }

  private collectScopeFields(scope: ParticipantRuleInput["scope"], fields: Set<string>) {
    if (!scope) {
      return;
    }
    if (scope.type === "leaf") {
      fields.add(scope.field);
      return;
    }
    for (const child of scope.children) {
      this.collectScopeFields(child, fields);
    }
  }

  private assertRuleAttributesExist(
    template: Pick<ParticipantTemplateDto, "attributes">,
    rules: ParticipantTemplateDto["rules"] | ParticipantRuleInput[],
  ) {
    const availableAttributes = new Set(template.attributes.map((attribute) => attribute.key));
    const missing = new Set<string>();

    for (const rule of rules) {
      if (!availableAttributes.has(rule.assignment.attribute)) {
        missing.add(rule.assignment.attribute);
      }
      this.collectScopeFields(rule.scope, missing);
    }

    const trulyMissing = Array.from(missing).filter((key) => !availableAttributes.has(key));
    if (!trulyMissing.length) {
      return;
    }

    throw new Error(`Template rules reference undefined attributes: ${trulyMissing.join(", ")}`);
  }

  private assertNoRuleConflicts(rules: ParticipantTemplateDto["rules"] | ParticipantRuleInput[]) {
    const normalizedRules = rules.map((rule, index) => ({
      id: "id" in rule && rule.id ? rule.id : `draft_rule_${index + 1}`,
      name: rule.name,
      enabled: rule.enabled,
      priority: rule.priority,
      scope: rule.scope,
      assignment: rule.assignment,
    }));
    const conflicts = this.ruleEngine.detectConflictsForRules(normalizedRules);

    if (!conflicts.length) {
      return;
    }

    const details = conflicts.map((conflict, index) => `${index + 1}. ${conflict.message}`).join("\n");
    throw new Error(`Template rules conflict. Please fix the following issues before saving:\n${details}`);
  }

  async list(user: AuthUserContext, scope?: unknown, pagination?: ResolvedPagination) {
    const dataScope = resolveDataScope(user, scope);

    if (!pagination) {
      const templates = dataScope === "all" ? await participantTemplateRepository.listAll() : await participantTemplateRepository.list(user.id);
      return templates.map((template) => ({ ...mapTemplate(template), isOwnedByCurrentUser: template.userId === user.id }));
    }

    const result = dataScope === "all"
      ? await participantTemplateRepository.listAllPage(pagination.page, pagination.pageSize)
      : await participantTemplateRepository.listPage(user.id, pagination.page, pagination.pageSize);

    const items = result.items.map((template) => ({ ...mapTemplate(template), isOwnedByCurrentUser: template.userId === user.id }));
    return toPaginationResult(items, result.total, pagination);
  }

  async get(user: AuthUserContext | string, id: string) {
    const viewer = typeof user === "string" ? { id: user, email: "", role: "user" as const } : user;
    const template = isAdmin(viewer) ? await participantTemplateRepository.getAnyById(id) : await participantTemplateRepository.getById(viewer.id, id);
    if (!template) throw new Error("Participant template not found");
    return { ...mapTemplate(template), isOwnedByCurrentUser: template.userId === viewer.id };
  }

  async create(userId: string, input: unknown) {
    const { template, rules } = this.parseTemplatePayload(input);
    this.assertRuleAttributesExist(template, rules);
    this.assertNoRuleConflicts(rules);
    const created = await participantTemplateRepository.create(userId, template, rules);
    return mapTemplate(created);
  }

  async update(userId: string, id: string, input: unknown) {
    const existing = await participantTemplateRepository.getById(userId, id);
    if (!existing) throw new Error("Participant template not found");
    const { template, rules } = this.parseTemplatePayload(input);
    this.assertRuleAttributesExist(template, rules);
    this.assertNoRuleConflicts(rules);
    const updated = await participantTemplateRepository.update(userId, id, template, rules);
    return mapTemplate(updated);
  }

  async delete(userId: string, id: string) {
    const existing = await participantTemplateRepository.getById(userId, id);
    if (!existing) {
      throw new Error("Participant template not found");
    }

    const referencingRuns = await participantTemplateRepository.countReferencingRuns(userId, id);
    if (referencingRuns > 0) {
      throw new Error(`This participant template is used by ${referencingRuns} mock run(s) and cannot be deleted`);
    }

    await participantTemplateRepository.delete(userId, id);
    return { success: true };
  }

  async clone(userId: string, id: string) {
    const existing = await this.get(userId, id);
    return this.create(userId, {
      template: {
        name: `${existing.name} Copy`,
        description: existing.description,
        archetypeProfile: existing.archetypeProfile,
        attributes: existing.attributes,
        randomConfig: existing.randomConfig,
        sampleSizePreview: existing.sampleSizePreview,
      },
      rules: existing.rules.map((rule) => ({
        name: rule.name,
        enabled: rule.enabled,
        priority: rule.priority,
        scope: rule.scope,
        assignment: rule.assignment,
        note: rule.note,
      })),
    });
  }

  async preview(userId: string, id: string, sampleSize?: number) {
    const template = await this.get(userId, id);
    return this.ruleEngine.preview(template, sampleSize);
  }

  async generateWithAi(user: AuthUserContext, input: unknown) {
    let finalResult: ParticipantTemplateAiGenerateResult | null = null;
    for await (const event of this.generateWithAiStream(user, input)) {
      if (event.type === "result") {
        finalResult = event.result;
      }
    }
    if (!finalResult) {
      throw new Error("AI template generation did not produce a result");
    }
    return finalResult;
  }

  async *generateWithAiStream(user: AuthUserContext, input: unknown): AsyncGenerator<ParticipantTemplateAiGenerateStreamEvent> {
    await this.usageLimitService.consumeOrThrow(user, "participant template generation");
    const payload = participantTemplateAiGenerateInputSchema.parse(input);
    const config = payload.llmConfigId
      ? await this.llmService.getRuntimeConfig(user, payload.llmConfigId)
      : await this.llmService.getDefaultRuntimeConfig(user.id);

    const task = buildParticipantTemplateGenerateJsonlTask({
      prompt: payload.prompt,
      archetypeProfile: payload.archetypeProfile,
      attributes: payload.attributes,
      randomConfig: payload.randomConfig,
      templateName: payload.templateName,
      templateDescription: payload.templateDescription,
    });

    const records: ParticipantTemplateAiGenerateJsonlRecord[] = [];
    const queue: ParticipantTemplateAiGenerateStreamEvent[] = [];
    let wake: (() => void) | null = null;
    let finished = false;
    let lineIndex = 0;
    let buffer = "";

    const push = (event: ParticipantTemplateAiGenerateStreamEvent) => {
      queue.push(event);
      wake?.();
      wake = null;
    };

    const processLine = async (line: string): Promise<ParticipantTemplateAiGenerateStreamEvent[]> => {
      const trimmed = line.trim();
      if (!trimmed) return [];

      lineIndex += 1;
      const events: ParticipantTemplateAiGenerateStreamEvent[] = [
        { type: "status", stage: "validating", message: `Validating template record ${lineIndex}`, lines: lineIndex },
      ];

      try {
        const record = participantTemplateAiGenerateJsonlRecordSchema.parse(JSON.parse(trimmed));
        records.push(record);
        events.push({
          type: "record",
          index: lineIndex,
          status: "validated",
          record,
          rawLine: trimmed,
          message: `Record ${lineIndex} validated`,
        });
        return events;
      } catch (error) {
        const repairTask = buildParticipantTemplateRepairJsonlRecordTask({
          invalidLine: trimmed,
          errorMessage: error instanceof Error ? error.message : String(error),
          requestPrompt: payload.prompt,
        });
        events.push({
          type: "status",
          stage: "repairing",
          message: `Record ${lineIndex} invalid, repairing with LLM`,
          lines: lineIndex,
        });

        try {
          const repaired = await this.llmService.generateJson<ParticipantTemplateAiGenerateJsonlRecord>(
            config,
            repairTask.messages,
            repairTask.fixerPrompt,
          );
          const record = participantTemplateAiGenerateJsonlRecordSchema.parse(repaired);
          records.push(record);
          events.push({
            type: "record",
            index: lineIndex,
            status: "repaired",
            record,
            rawLine: trimmed,
            repairedLine: JSON.stringify(repaired),
            message: "Record repaired",
          });
          return events;
        } catch (repairError) {
          events.push({
            type: "record",
            index: lineIndex,
            status: "skipped",
            rawLine: trimmed,
            message: repairError instanceof Error ? repairError.message : String(repairError),
          });
          return events;
        }
      }
    };

    push({ type: "status", stage: "queued", message: "Participant template generation queued", lines: 0 });
    push({ type: "status", stage: "generating", message: "Streaming participant template JSONL records from LLM", lines: 0 });

    const streamTask = this.llmService
      .generateTextStream(config, task.messages, async (event) => {
        if (event.type !== "delta" || !event.chunk) return;
        buffer += event.chunk;

        const parts = buffer.split(/\r?\n/);
        buffer = parts.pop() ?? "";

        for (const line of parts) {
          const events = await processLine(line);
          for (const item of events) {
            push(item);
          }
        }
      })
      .then(async () => {
        if (buffer.trim()) {
          const events = await processLine(buffer);
          for (const item of events) {
            push(item);
          }
        }

        const templateRecord = records.find((record) => record.recordType === "template");
        if (!templateRecord || templateRecord.recordType !== "template") {
          throw new Error("Template generation did not produce a template record");
        }

        const result = participantTemplateAiGenerateResultSchema.parse({
          template: {
            name: templateRecord.name,
            description: templateRecord.description,
            archetypeProfile: templateRecord.archetypeProfile,
            attributes: normalizeParticipantAttributeDefinitions(templateRecord.attributes),
            randomConfig: templateRecord.randomConfig,
            sampleSizePreview: templateRecord.sampleSizePreview,
          },
          rules: records
            .filter((record): record is Extract<ParticipantTemplateAiGenerateJsonlRecord, { recordType: "rule" }> => record.recordType === "rule")
            .map((rule) => participantRuleInputSchema.parse({
              name: rule.name,
              enabled: rule.enabled,
              priority: rule.priority,
              scope: rule.scope,
              assignment: rule.assignment,
              note: rule.note,
            })),
          notes: records
            .filter((record): record is Extract<ParticipantTemplateAiGenerateJsonlRecord, { recordType: "note" }> => record.recordType === "note")
            .map((record) => record.text),
        });

        push({ type: "result", result });
        push({
          type: "status",
          stage: "completed",
          message: "Participant template generation completed",
          lines: lineIndex,
        });
        return null;
      })
      .catch((error) => error instanceof Error ? error : new Error(String(error)))
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

    const streamError = await streamTask;
    if (streamError) {
      if (records.length > 0) {
        const templateRecord = records.find((record) => record.recordType === "template");
        if (templateRecord && templateRecord.recordType === "template") {
          const partial = participantTemplateAiGenerateResultSchema.parse({
            template: {
              name: templateRecord.name,
              description: templateRecord.description,
              archetypeProfile: templateRecord.archetypeProfile,
              attributes: normalizeParticipantAttributeDefinitions(templateRecord.attributes),
              randomConfig: templateRecord.randomConfig,
              sampleSizePreview: templateRecord.sampleSizePreview,
            },
            rules: records
              .filter((record): record is Extract<ParticipantTemplateAiGenerateJsonlRecord, { recordType: "rule" }> => record.recordType === "rule")
              .map((rule) => participantRuleInputSchema.parse({
                name: rule.name,
                enabled: rule.enabled,
                priority: rule.priority,
                scope: rule.scope,
                assignment: rule.assignment,
                note: rule.note,
              })),
            notes: [
              ...records
                .filter((record): record is Extract<ParticipantTemplateAiGenerateJsonlRecord, { recordType: "note" }> => record.recordType === "note")
                .map((record) => record.text),
              `Generation interrupted: ${streamError.message}`,
            ],
          });
          yield { type: "result", result: partial };
        }
      }

      yield {
        type: "status",
        stage: "interrupted",
        message: streamError.message,
        lines: lineIndex,
      };
      throw streamError;
    }
  }

  generateIdentities(template: ParticipantTemplateDto, count: number) {
    return this.ruleEngine.generateIdentities(template, count);
  }
}
