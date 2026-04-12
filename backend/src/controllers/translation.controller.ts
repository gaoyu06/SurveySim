import type { FastifyReply, FastifyRequest } from "fastify";
import { TranslationService } from "../services/translation.service.js";
import { TranslationEvaluationService } from "../services/translation-evaluation.service.js";
import { LlmService } from "../services/llm/llm.service.js";
import { buildTranslationChatTask, translationChatResponseSchema } from "../services/ai-tasks/translation-chat.task.js";
import { buildJsonFixerPrompt } from "../services/ai-tasks/prompt-support/schema-text.js";
import { z } from "zod";

const llmService = new LlmService();

const chatInputSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
  })),
  llmConfigId: z.string().optional(),
});

export function translationControllerFactory(
  translationService: TranslationService,
  evaluationService: TranslationEvaluationService,
) {
  return {
    // ── Chat ──
    chat: async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = chatInputSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ message: "Invalid input", errors: parsed.error.flatten() });
        return;
      }
      const { messages, llmConfigId } = parsed.data;
      const user = request.authUser!;

      const runtimeConfig = llmConfigId
        ? await llmService.getRuntimeConfig(user, llmConfigId)
        : await llmService.getDefaultRuntimeConfig(user.id);

      const lastUserMessage = messages.filter((m) => m.role === "user").pop()?.content ?? "";
      const history = messages.slice(0, -1); // everything except the last user message

      const task = buildTranslationChatTask({
        conversationHistory: history,
        userMessage: lastUserMessage,
        locale: (request.headers["accept-language"] as string) || undefined,
      });

      const result = await llmService.generateJson<z.infer<typeof translationChatResponseSchema>>(
        runtimeConfig,
        task.messages,
        task.fixerPrompt,
      );

      reply.send(result);
    },

    // ── Projects ──
    // ── Projects ──
    listProjects: async (request: FastifyRequest, reply: FastifyReply) => {
      reply.send(await translationService.listProjects(request.authUser!));
    },
    getProject: async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      reply.send(await translationService.getProject(request.authUser!, request.params.id));
    },
    createProject: async (request: FastifyRequest, reply: FastifyReply) => {
      reply.send(await translationService.createProject(request.authUser!, request.body));
    },
    updateProject: async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      reply.send(await translationService.updateProject(request.authUser!, request.params.id, request.body));
    },
    deleteProject: async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      reply.send(await translationService.deleteProject(request.authUser!, request.params.id));
    },

    // ── Versions ──
    createVersion: async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      reply.send(await translationService.createVersion(request.authUser!, request.params.id, request.body));
    },
    getVersion: async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      reply.send(await translationService.getVersion(request.params.id));
    },

    // ── Evaluations ──
    startEvaluation: async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      reply.send(await evaluationService.startEvaluation(request.authUser!, request.params.id, request.body));
    },
    getEvaluation: async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      reply.send(await evaluationService.getEvaluation(request.params.id));
    },
    autoFix: async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        reply.send(await evaluationService.autoFix(request.authUser!, request.params.id, request.body));
      } catch (error) {
        reply.code(400).send({ message: error instanceof Error ? error.message : String(error) });
      }
    },
  };
}
