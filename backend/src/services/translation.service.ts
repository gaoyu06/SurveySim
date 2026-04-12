import {
  translationProjectCreateInputSchema,
  translationProjectUpdateInputSchema,
  translationVersionCreateInputSchema,
  type TranslationProjectDto,
  type TranslationVersionDto,
} from "@surveysim/shared";
import { translationRepository } from "../repositories/translation.repository.js";
import { toIsoString } from "../utils/serialize.js";
import type { AuthUserContext } from "../types/auth.js";

function mapProject(row: any): TranslationProjectDto {
  const latest = row.versions?.[0] ?? null;
  return {
    id: row.id,
    title: row.title,
    dramaTheme: row.dramaTheme,
    targetMarket: row.targetMarket,
    targetCulture: row.targetCulture,
    sourceLanguage: row.sourceLanguage,
    targetLanguage: row.targetLanguage,
    versionCount: row._count?.versions ?? row.versions?.length ?? 0,
    latestVersion: latest ? { id: latest.id, versionNumber: latest.versionNumber, createdAt: toIsoString(latest.createdAt)! } : null,
    createdAt: toIsoString(row.createdAt)!,
    updatedAt: toIsoString(row.updatedAt)!,
  };
}

function mapVersion(row: any): TranslationVersionDto {
  return {
    id: row.id,
    projectId: row.projectId,
    versionNumber: row.versionNumber,
    sourceText: row.sourceText,
    translatedText: row.translatedText,
    parentVersionId: row.parentVersionId,
    changeSummary: row.changeSummary,
    evaluations: (row.evaluations ?? []).map((e: any) => ({
      id: e.id,
      status: e.status.toLowerCase(),
      evaluatorCount: e.evaluatorCount,
      createdAt: toIsoString(e.createdAt)!,
    })),
    createdAt: toIsoString(row.createdAt)!,
    updatedAt: toIsoString(row.updatedAt)!,
  };
}

export class TranslationService {
  async listProjects(user: AuthUserContext) {
    const rows = await translationRepository.listProjects(user.id);
    return rows.map(mapProject);
  }

  async getProject(user: AuthUserContext, projectId: string) {
    const row = await translationRepository.getProjectById(projectId, user.id);
    if (!row) throw new Error("Project not found");
    return {
      ...mapProject(row),
      versions: (row.versions ?? []).map(mapVersion),
    };
  }

  async createProject(user: AuthUserContext, input: unknown) {
    const payload = translationProjectCreateInputSchema.parse(input);
    const row = await translationRepository.createProject({
      userId: user.id,
      ...payload,
    });
    return mapProject(row);
  }

  async updateProject(user: AuthUserContext, projectId: string, input: unknown) {
    const payload = translationProjectUpdateInputSchema.parse(input);
    const cleaned = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined));
    await translationRepository.updateProject(projectId, user.id, cleaned);
    return this.getProject(user, projectId);
  }

  async deleteProject(user: AuthUserContext, projectId: string) {
    const result = await translationRepository.deleteProject(projectId, user.id);
    if (!result.count) throw new Error("Project not found");
    return { success: true };
  }

  async createVersion(user: AuthUserContext, projectId: string, input: unknown) {
    const payload = translationVersionCreateInputSchema.parse(input);

    // Verify project ownership
    const project = await translationRepository.getProjectById(projectId, user.id);
    if (!project) throw new Error("Project not found");

    const maxVersion = await translationRepository.getMaxVersionNumber(projectId);
    const row = await translationRepository.createVersion({
      projectId,
      versionNumber: maxVersion + 1,
      sourceText: payload.sourceText,
      translatedText: payload.translatedText,
      parentVersionId: payload.parentVersionId,
    });

    return mapVersion(row);
  }

  async getVersion(versionId: string) {
    const row = await translationRepository.getVersionById(versionId);
    if (!row) throw new Error("Version not found");
    return mapVersion(row);
  }
}
