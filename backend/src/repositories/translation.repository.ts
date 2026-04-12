import { prisma } from "../lib/db.js";

export const translationRepository = {
  // ── Projects ──
  listProjects(userId: string) {
    return prisma.translationProject.findMany({
      where: { userId },
      include: {
        versions: {
          select: { id: true, versionNumber: true, createdAt: true },
          orderBy: { versionNumber: "desc" },
          take: 1,
        },
        _count: { select: { versions: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
  },

  getProjectById(id: string, userId: string) {
    return prisma.translationProject.findFirst({
      where: { id, userId },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
        },
      },
    });
  },

  createProject(data: {
    userId: string;
    title: string;
    dramaTheme?: string;
    targetMarket?: string;
    targetCulture?: string;
    sourceLanguage?: string;
    targetLanguage?: string;
  }) {
    return prisma.translationProject.create({ data });
  },

  updateProject(id: string, userId: string, data: Record<string, unknown>) {
    return prisma.translationProject.updateMany({
      where: { id, userId },
      data,
    });
  },

  deleteProject(id: string, userId: string) {
    return prisma.translationProject.deleteMany({ where: { id, userId } });
  },

  // ── Versions ──
  getVersionById(id: string) {
    return prisma.translationVersion.findUnique({
      where: { id },
      include: {
        evaluations: {
          select: { id: true, status: true, evaluatorCount: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });
  },

  getVersionsByProject(projectId: string) {
    return prisma.translationVersion.findMany({
      where: { projectId },
      orderBy: { versionNumber: "desc" },
    });
  },

  async createVersion(data: {
    projectId: string;
    versionNumber: number;
    sourceText?: string;
    translatedText: string;
    parentVersionId?: string;
    changeSummary?: string;
  }) {
    return prisma.translationVersion.create({ data });
  },

  async getMaxVersionNumber(projectId: string) {
    const result = await prisma.translationVersion.aggregate({
      where: { projectId },
      _max: { versionNumber: true },
    });
    return result._max.versionNumber ?? 0;
  },

  // ── Evaluations ──
  getEvaluationById(id: string) {
    return prisma.translationEvaluation.findUnique({ where: { id } });
  },

  createEvaluation(data: {
    versionId: string;
    evaluatorCount: number;
    concurrency?: number;
    participantTemplateId?: string;
    llmConfigId?: string;
    status: "DRAFT" | "RUNNING" | "COMPLETED" | "FAILED";
  }) {
    return prisma.translationEvaluation.create({ data });
  },

  updateEvaluation(id: string, data: Record<string, unknown>) {
    return prisma.translationEvaluation.update({ where: { id }, data });
  },
};
