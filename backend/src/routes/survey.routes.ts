import type { FastifyInstance } from "fastify";
import { surveyControllerFactory } from "../controllers/survey.controller.js";
import { SurveyService } from "../services/survey.service.js";

export async function surveyRoutes(app: FastifyInstance) {
  const controller = surveyControllerFactory(new SurveyService());
  const auth = { preHandler: [app.authenticate] };
  app.get("/", auth, controller.list as any);
  app.get("/:id", auth, controller.get as any);
  app.post("/import", auth, controller.importDraft as any);
  app.post("/", auth, controller.create as any);
  app.put("/:id", auth, controller.update as any);
}
