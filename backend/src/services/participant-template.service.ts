import { participantRuleInputSchema, participantTemplateInputSchema, type ParticipantTemplateDto } from "@formagents/shared";
import { fromJson } from "../lib/json.js";
import { participantTemplateRepository } from "../repositories/participant-template.repository.js";
import { RuleEngineService } from "./rule-engine.service.js";
import { toIsoString } from "../utils/serialize.js";

function mapTemplate(template: Awaited<ReturnType<typeof participantTemplateRepository.getById>> extends infer T ? NonNullable<T> : never): ParticipantTemplateDto {
  return {
    id: template.id,
    name: template.name,
    description: template.description ?? undefined,
    dimensions: fromJson<string[]>(template.dimensions),
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

  async list(userId: string) {
    const templates = await participantTemplateRepository.list(userId);
    return templates.map((template) => mapTemplate(template));
  }

  async get(userId: string, id: string) {
    const template = await participantTemplateRepository.getById(userId, id);
    if (!template) throw new Error("Participant template not found");
    return mapTemplate(template);
  }

  async create(userId: string, input: unknown) {
    const payload = input as { template: unknown; rules: unknown[] };
    const template = participantTemplateInputSchema.parse(payload.template);
    const rules = (payload.rules ?? []).map((rule) => participantRuleInputSchema.parse(rule));
    const created = await participantTemplateRepository.create(userId, template, rules);
    return mapTemplate(created);
  }

  async update(userId: string, id: string, input: unknown) {
    const payload = input as { template: unknown; rules: unknown[] };
    const existing = await participantTemplateRepository.getById(userId, id);
    if (!existing) throw new Error("Participant template not found");
    const template = participantTemplateInputSchema.parse(payload.template);
    const rules = (payload.rules ?? []).map((rule) => participantRuleInputSchema.parse(rule));
    const updated = await participantTemplateRepository.update(userId, id, template, rules);
    return mapTemplate(updated);
  }

  async delete(userId: string, id: string) {
    await participantTemplateRepository.delete(userId, id);
    return { success: true };
  }

  async clone(userId: string, id: string) {
    const existing = await this.get(userId, id);
    return this.create(userId, {
      template: {
        name: `${existing.name} Copy`,
        description: existing.description,
        dimensions: existing.dimensions,
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

  generateIdentities(template: ParticipantTemplateDto, count: number) {
    return this.ruleEngine.generateIdentities(template, count);
  }
}
