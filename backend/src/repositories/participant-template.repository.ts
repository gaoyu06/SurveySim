import { prisma } from "../lib/db.js";
import { toJson } from "../lib/json.js";
import type { ParticipantRuleInput, ParticipantTemplateInput } from "@surveysim/shared";

export const participantTemplateRepository = {
  list(userId: string) {
    return prisma.participantTemplate.findMany({
      where: { userId },
      include: { rules: { orderBy: [{ priority: "desc" }, { createdAt: "asc" }] } },
      orderBy: { updatedAt: "desc" },
    });
  },
  getById(userId: string, id: string) {
    return prisma.participantTemplate.findFirst({
      where: { userId, id },
      include: { rules: { orderBy: [{ priority: "desc" }, { createdAt: "asc" }] } },
    });
  },
  async create(userId: string, input: ParticipantTemplateInput, rules: ParticipantRuleInput[]) {
    return prisma.participantTemplate.create({
      data: {
        userId,
        name: input.name,
        description: input.description,
        dimensions: toJson(input.attributes),
        sampleSizePreview: input.sampleSizePreview,
        rules: {
          create: rules.map((rule) => ({
            name: rule.name,
            enabled: rule.enabled,
            priority: rule.priority,
            scope: rule.scope ? toJson(rule.scope) : undefined,
            assignment: toJson(rule.assignment),
            note: rule.note,
          })),
        },
      },
      include: { rules: true },
    });
  },
  async update(userId: string, id: string, input: ParticipantTemplateInput, rules: ParticipantRuleInput[]) {
    return prisma.$transaction(async (tx) => {
      await tx.participantRule.deleteMany({ where: { templateId: id } });
      return tx.participantTemplate.update({
        where: { id },
        data: {
          userId,
          name: input.name,
          description: input.description,
          dimensions: toJson(input.attributes),
          sampleSizePreview: input.sampleSizePreview,
          rules: {
            create: rules.map((rule) => ({
              name: rule.name,
              enabled: rule.enabled,
              priority: rule.priority,
              scope: rule.scope ? toJson(rule.scope) : undefined,
              assignment: toJson(rule.assignment),
              note: rule.note,
            })),
          },
        },
        include: { rules: true },
      });
    });
  },
  countReferencingRuns(userId: string, id: string) {
    return prisma.mockRun.count({
      where: {
        userId,
        participantTemplateId: id,
      },
    });
  },
  delete(userId: string, id: string) {
    return prisma.$transaction(async (tx) => {
      await tx.participantRule.deleteMany({ where: { templateId: id } });
      return tx.participantTemplate.deleteMany({ where: { userId, id } });
    });
  },
};
