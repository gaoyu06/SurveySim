import type { FastifyInstance } from "fastify";
import { translationControllerFactory } from "../controllers/translation.controller.js";
import { TranslationService } from "../services/translation.service.js";
import { TranslationEvaluationService } from "../services/translation-evaluation.service.js";

export async function translationRoutes(app: FastifyInstance) {
  const controller = translationControllerFactory(new TranslationService(), new TranslationEvaluationService());

  // Projects
  app.get("/projects", { preHandler: [app.authenticate] }, controller.listProjects as any);
  app.post("/projects", { preHandler: [app.authenticate] }, controller.createProject as any);
  app.get("/projects/:id", { preHandler: [app.authenticate] }, controller.getProject as any);
  app.put("/projects/:id", { preHandler: [app.authenticate] }, controller.updateProject as any);
  app.delete("/projects/:id", { preHandler: [app.authenticate] }, controller.deleteProject as any);

  // Versions
  app.post("/projects/:id/versions", { preHandler: [app.authenticate] }, controller.createVersion as any);
  app.get("/versions/:id", { preHandler: [app.authenticate] }, controller.getVersion as any);

  // Evaluations
  app.post("/versions/:id/evaluate", { preHandler: [app.authenticate] }, controller.startEvaluation as any);
  app.get("/evaluations/:id", { preHandler: [app.authenticate] }, controller.getEvaluation as any);
  app.post("/evaluations/:id/auto-fix", { preHandler: [app.authenticate] }, controller.autoFix as any);

  // Chat
  app.post("/chat", { preHandler: [app.authenticate] }, controller.chat as any);
}
