import { prisma } from "../lib/db.js";
import type { LlmProviderConfigInput } from "@surveysim/shared";

export const llmConfigRepository = {
  list(userId: string) {
    return prisma.llmProviderConfig.findMany({ where: { userId }, orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }] });
  },
  getById(userId: string, id: string) {
    return prisma.llmProviderConfig.findFirst({ where: { userId, id } });
  },
  async create(userId: string, input: LlmProviderConfigInput) {
    return prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.llmProviderConfig.updateMany({ where: { userId }, data: { isDefault: false } });
      }
      return tx.llmProviderConfig.create({ data: { userId, ...input, isDefault: input.isDefault ?? false } });
    });
  },
  async update(userId: string, id: string, input: LlmProviderConfigInput) {
    return prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.llmProviderConfig.updateMany({ where: { userId }, data: { isDefault: false } });
      }
      return tx.llmProviderConfig.update({ where: { id }, data: { ...input, isDefault: input.isDefault ?? false } });
    });
  },
  delete(userId: string, id: string) {
    return prisma.llmProviderConfig.deleteMany({ where: { userId, id } });
  },
  async setDefault(userId: string, id: string) {
    return prisma.$transaction(async (tx) => {
      await tx.llmProviderConfig.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.llmProviderConfig.update({ where: { id }, data: { isDefault: true } });
    });
  },
  getDefault(userId: string) {
    return prisma.llmProviderConfig.findFirst({ where: { userId, isDefault: true } });
  },
};
