import { prisma } from "../lib/db.js";
import type { LlmProviderConfigCreateInput, LlmProviderConfigInput } from "@surveysim/shared";

export const llmConfigRepository = {
  listAccessible(userId: string) {
    return prisma.llmProviderConfig.findMany({
      where: {
        OR: [{ userId }, { isPublic: true }],
      },
      include: { user: true },
      orderBy: [{ userId: "asc" }, { isDefault: "desc" }, { updatedAt: "desc" }],
    });
  },
  listAll() {
    return prisma.llmProviderConfig.findMany({
      include: { user: true },
      orderBy: [{ isPublic: "desc" }, { updatedAt: "desc" }],
    });
  },
  getOwnedById(userId: string, id: string) {
    return prisma.llmProviderConfig.findFirst({ where: { userId, id }, include: { user: true } });
  },
  getAccessibleById(userId: string, id: string) {
    return prisma.llmProviderConfig.findFirst({
      where: {
        id,
        OR: [{ userId }, { isPublic: true }],
      },
      include: { user: true },
    });
  },
  getAnyById(id: string) {
    return prisma.llmProviderConfig.findUnique({ where: { id }, include: { user: true } });
  },
  async create(userId: string, input: LlmProviderConfigCreateInput) {
    return prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.llmProviderConfig.updateMany({ where: { userId }, data: { isDefault: false } });
      }
      return tx.llmProviderConfig.create({ data: { userId, ...input, isDefault: input.isDefault ?? false }, include: { user: true } });
    });
  },
  async update(userId: string, id: string, input: LlmProviderConfigInput) {
    return prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.llmProviderConfig.updateMany({ where: { userId }, data: { isDefault: false } });
      }
      return tx.llmProviderConfig.update({ where: { id }, data: { ...input, isDefault: input.isDefault ?? false }, include: { user: true } });
    });
  },
  delete(userId: string, id: string) {
    return prisma.llmProviderConfig.deleteMany({ where: { userId, id } });
  },
  async setDefault(userId: string, id: string) {
    return prisma.$transaction(async (tx) => {
      await tx.llmProviderConfig.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.llmProviderConfig.update({ where: { id }, data: { isDefault: true }, include: { user: true } });
    });
  },
  getDefault(userId: string) {
    return prisma.llmProviderConfig.findFirst({ where: { userId, isDefault: true }, include: { user: true } });
  },
  setPublic(id: string, isPublic: boolean) {
    return prisma.llmProviderConfig.update({ where: { id }, data: { isPublic }, include: { user: true } });
  },
};
