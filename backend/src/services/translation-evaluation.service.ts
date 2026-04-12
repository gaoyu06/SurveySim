import type {
  EvaluatorResult,
  EvaluationAggregate,
  EvaluationSuggestion,
  TranslationEvaluationDto,
} from "@surveysim/shared";
import { evaluationStatusSchema } from "@surveysim/shared";
import { LlmService } from "./llm/llm.service.js";
import { translationRepository } from "../repositories/translation.repository.js";
import { TranslationService } from "./translation.service.js";
import {
  buildEvaluatorProfilesTask,
  buildEvaluatorAssessmentTask,
  evaluatorProfileResultSchema,
  singleEvaluatorAssessmentSchema,
} from "./ai-tasks/translation-evaluator.task.js";
import { buildTranslationAutoFixTask } from "./ai-tasks/translation-auto-fix.task.js";
import { toIsoString } from "../utils/serialize.js";
import type { AuthUserContext } from "../types/auth.js";
import { z } from "zod";
import pLimit from "p-limit";

const llmService = new LlmService();

function buildJsonFixer(schemaDescription: string) {
  return `Return valid JSON only. ${schemaDescription}. Do not include markdown fences or explanations.`;
}

export class TranslationEvaluationService {
  private readonly translationService = new TranslationService();

  async startEvaluation(user: AuthUserContext, versionId: string, input: unknown) {
    const { evaluatorCount, concurrency, participantTemplateId, llmConfigId } = (input as {
      evaluatorCount?: number;
      concurrency?: number;
      participantTemplateId?: string;
      llmConfigId?: string;
    }) ?? {};
    const count = evaluatorCount ?? 5;
    const conc = concurrency ?? 3;

    // Get version and project
    const version = await translationRepository.getVersionById(versionId);
    if (!version) throw new Error("Version not found");

    const project = await translationRepository.getProjectById(version.projectId, user.id);
    if (!project) throw new Error("Project not found");

    // Resolve LLM config
    const configId = llmConfigId ?? undefined;

    // Resolve participant template if provided
    let templateIdentities: any[] | null = null;
    if (participantTemplateId) {
      const { ParticipantTemplateService } = await import("./participant-template.service.js");
      const templateService = new ParticipantTemplateService();
      const template = await templateService.get(user, participantTemplateId);
      if (template) {
        templateIdentities = templateService.generateIdentities(template, count);
      }
    }

    // Create evaluation record
    const evaluation = await translationRepository.createEvaluation({
      versionId,
      evaluatorCount: count,
      concurrency: conc,
      participantTemplateId: participantTemplateId ?? undefined,
      llmConfigId: configId,
      status: "RUNNING",
    });

    const runtimeConfig = configId
      ? await llmService.getRuntimeConfig(user, configId)
      : await llmService.getDefaultRuntimeConfig(user.id);

    // Run evaluation asynchronously
    this.runEvaluation(evaluation.id, runtimeConfig, count, conc, version.translatedText, version.sourceText ?? undefined, project, templateIdentities).catch(
      async (error) => {
        await translationRepository.updateEvaluation(evaluation.id, {
          status: "FAILED",
          results: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
          completedAt: new Date(),
        });
      },
    );

    return this.mapEvaluation(evaluation);
  }

  private async runEvaluation(
    evaluationId: string,
    runtimeConfig: any,
    evaluatorCount: number,
    concurrency: number,
    translatedText: string,
    sourceText: string | undefined,
    project: any,
    templateIdentities: any[] | null,
  ) {
    // Step 1: Generate evaluator profiles
    let evaluators: any[];

    if (templateIdentities && templateIdentities.length > 0) {
      // Convert template identities to evaluator profiles
      evaluators = templateIdentities.map((identity: any, i: number) => ({
        name: identity.extra?.archetypeLabel || identity.occupation || `Evaluator ${i + 1}`,
        age: identity.ageRange ? parseInt(identity.ageRange.split("-")[0]) || 25 + Math.floor(Math.random() * 20) : 25 + Math.floor(Math.random() * 20),
        gender: identity.gender || "unspecified",
        culturalBackground: [identity.country, identity.region, identity.continent].filter(Boolean).join(", ") || project.targetCulture || "diverse background",
        viewingHabits: `Interests: ${(identity.interests || []).join(", ") || "general entertainment"}`,
        evaluationFocus: identity.extra?.archetypeSeedTags?.join(", ") || "overall quality",
      }));
    } else {
      const profilesTask = buildEvaluatorProfilesTask({
        evaluatorCount,
        dramaTheme: project.dramaTheme ?? undefined,
        targetMarket: project.targetMarket ?? undefined,
        targetCulture: project.targetCulture ?? undefined,
        targetLanguage: project.targetLanguage ?? undefined,
      });

      const profilesResult = await llmService.generateJson<z.infer<typeof evaluatorProfileResultSchema>>(
        runtimeConfig,
        profilesTask.messages,
        buildJsonFixer("Object with 'evaluators' array of profiles"),
      );

      evaluators = profilesResult.evaluators;
    }

    // Step 2: Run each evaluator assessment with concurrency limit
    const limit = pLimit(concurrency);
    const assessmentPromises = evaluators.map((profile: any, index: number) =>
      limit(async () => {
        const assessmentTask = buildEvaluatorAssessmentTask({
          evaluatorProfile: profile,
          evaluatorIndex: index,
          translatedText,
          sourceText,
          dramaTheme: project.dramaTheme ?? undefined,
          targetMarket: project.targetMarket ?? undefined,
          targetLanguage: project.targetLanguage ?? undefined,
        });

        const result = await llmService.generateJson<z.infer<typeof singleEvaluatorAssessmentSchema>>(
          runtimeConfig,
          assessmentTask.messages,
          buildJsonFixer("Object with dimensionScores array, suggestions array, and overallImpression string"),
        );

        // Prefix suggestion IDs with evaluator index
        const suggestions = (result.suggestions ?? []).map((s: any) => ({
          ...s,
          id: s.id ?? `e${index}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          evaluatorIndex: index,
        }));

        return {
          profile,
          dimensionScores: result.dimensionScores,
          suggestions,
          overallImpression: result.overallImpression,
        } as EvaluatorResult;
      }),
    );

    const results = await Promise.all(assessmentPromises);

    // Step 3: Aggregate scores
    const aggregate = this.computeAggregate(results);

    // Step 4: Collect all suggestions
    const allSuggestions = results.flatMap((r) => r.suggestions);

    // Step 5: Save results
    await translationRepository.updateEvaluation(evaluationId, {
      status: "COMPLETED",
      results: JSON.stringify(results),
      aggregateScores: JSON.stringify(aggregate),
      completedAt: new Date(),
    });

    // Store allSuggestions in a field — we'll return them from the evaluation DTO
    // Since our schema uses Json type, we can store suggestions alongside results
    return { results, aggregate, allSuggestions };
  }

  private computeAggregate(results: EvaluatorResult[]): EvaluationAggregate {
    const dimensions = [
      "cultural_adaptation",
      "emotional_fidelity",
      "naturalness",
      "timing_rhythm",
      "character_voice",
      "localization_quality",
      "overall",
    ] as const;

    const aggregate: Record<string, number> = {};
    for (const dim of dimensions) {
      const scores = results
        .flatMap((r) => r.dimensionScores)
        .filter((ds) => ds.dimension === dim)
        .map((ds) => ds.score);
      aggregate[dim] = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0;
    }

    return aggregate as EvaluationAggregate;
  }

  async getEvaluation(evaluationId: string) {
    const row = await translationRepository.getEvaluationById(evaluationId);
    if (!row) throw new Error("Evaluation not found");
    return this.mapEvaluation(row);
  }

  async autoFix(user: AuthUserContext, evaluationId: string, input: unknown) {
    const { selectedSuggestionIds } = (input as { selectedSuggestionIds?: string[] }) ?? {};
    if (!selectedSuggestionIds?.length) throw new Error("No suggestions selected");

    // Get evaluation with results
    const evaluation = await translationRepository.getEvaluationById(evaluationId);
    if (!evaluation) throw new Error("Evaluation not found");
    if (evaluation.status !== "COMPLETED") throw new Error("Evaluation not completed");

    const results: EvaluatorResult[] = evaluation.results ? JSON.parse(evaluation.results as string) : [];
    const allSuggestions = results.flatMap((r) => r.suggestions);
    const selected = allSuggestions.filter((s) => selectedSuggestionIds.includes(s.id));
    if (!selected.length) throw new Error("No matching suggestions found");

    // Get version
    const version = await translationRepository.getVersionById(evaluation.versionId);
    if (!version) throw new Error("Version not found");

    // Get project for context
    const project = await translationRepository.getProjectById(version.projectId, user.id);
    if (!project) throw new Error("Project not found");

    // Resolve LLM config
    const runtimeConfig = evaluation.llmConfigId
      ? await llmService.getRuntimeConfig(user, evaluation.llmConfigId)
      : await llmService.getDefaultRuntimeConfig(user.id);

    // Build and run auto-fix task
    const fixTask = buildTranslationAutoFixTask({
      translatedText: version.translatedText,
      selectedSuggestions: selected,
      dramaTheme: project.dramaTheme ?? undefined,
      targetMarket: project.targetMarket ?? undefined,
      targetLanguage: project.targetLanguage ?? undefined,
    });

    const fixResult = await llmService.generateJson<{ revisedText: string; changeSummary: string }>(
      runtimeConfig,
      fixTask.messages,
      buildJsonFixer("Object with revisedText string and changeSummary string"),
    );

    // Create new version
    const newVersion = await this.translationService.createVersion(user, version.projectId, {
      sourceText: version.sourceText ?? undefined,
      translatedText: fixResult.revisedText,
      parentVersionId: version.id,
    });

    // Update version change summary
    await translationRepository.updateEvaluation(evaluationId, {
      // no-op, just needed a way to update the version
    });

    return {
      version: newVersion,
      changeSummary: fixResult.changeSummary,
      appliedSuggestions: selected,
    };
  }

  private mapEvaluation(row: any): TranslationEvaluationDto {
    const results: EvaluatorResult[] | null = row.results ? JSON.parse(row.results as string) : null;
    const aggregateScores: EvaluationAggregate | null = row.aggregateScores
      ? JSON.parse(row.aggregateScores as string)
      : null;

    // Extract all suggestions from results
    const allSuggestions: EvaluationSuggestion[] | null = results
      ? results.flatMap((r) => r.suggestions)
      : null;

    return {
      id: row.id,
      versionId: row.versionId,
      evaluatorCount: row.evaluatorCount,
      status: row.status.toLowerCase(),
      results,
      aggregateScores,
      allSuggestions,
      startedAt: toIsoString(row.startedAt),
      completedAt: toIsoString(row.completedAt),
      createdAt: toIsoString(row.createdAt)!,
      updatedAt: toIsoString(row.updatedAt)!,
    };
  }
}
