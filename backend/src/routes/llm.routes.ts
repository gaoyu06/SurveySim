import type { FastifyInstance } from "fastify";
import { llmControllerFactory } from "../controllers/llm.controller.js";
import { LlmService } from "../services/llm/llm.service.js";

export async function llmRoutes(app: FastifyInstance) {
  const controller = llmControllerFactory(new LlmService());
  app.get("/", { preHandler: [app.authenticate] }, controller.list as any);
  app.post("/", { preHandler: [app.authenticate] }, controller.create as any);
  app.put("/:id", { preHandler: [app.authenticate] }, controller.update as any);
  app.delete("/:id", { preHandler: [app.authenticate] }, controller.delete as any);
  app.post("/:id/default", { preHandler: [app.authenticate] }, controller.setDefault as any);
  app.post("/:id/public", { preHandler: [app.authenticate] }, controller.setPublic as any);
  app.post("/test", { preHandler: [app.authenticate] }, controller.testConnection as any);
}
