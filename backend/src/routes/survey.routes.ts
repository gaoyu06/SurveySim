import type { FastifyInstance } from "fastify";
import { surveyControllerFactory } from "../controllers/survey.controller.js";
import { SurveyService } from "../services/survey.service.js";

export async function surveyRoutes(app: FastifyInstance) {
  const controller = surveyControllerFactory(new SurveyService());
  const auth = { preHandler: [app.authenticate] };
  app.get("/", auth, controller.list as any);
  app.get("/:id", auth, controller.get as any);
  app.post("/generate-with-ai", auth, controller.generateWithAi as any);
  app.post("/import", auth, controller.importDraft as any);
  app.post("/import/stream", auth, controller.importDraftStream as any);
  app.post("/import/retry-record", auth, controller.retryImportRecord as any);
  app.post("/", auth, controller.create as any);
  app.post("/:id/public", auth, controller.setPublic as any);
  app.delete("/:id", auth, controller.delete as any);
  app.put("/:id", auth, controller.update as any);
}
