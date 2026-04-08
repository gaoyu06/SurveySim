import type { FastifyInstance } from "fastify";
import { workspaceAssistantControllerFactory } from "../controllers/workspace-assistant.controller.js";
import { WorkspaceAssistantService } from "../services/workspace-assistant.service.js";

export async function workspaceAssistantRoutes(app: FastifyInstance) {
  const controller = workspaceAssistantControllerFactory(new WorkspaceAssistantService());
  const auth = { preHandler: [app.authenticate] };

  app.post("/quick-create", auth, controller.quickCreate as any);
}
