import type { FastifyInstance } from "fastify";
import { systemControllerFactory } from "../controllers/system.controller.js";
import { SystemConfigService } from "../services/system-config.service.js";

export async function systemRoutes(app: FastifyInstance) {
  const controller = systemControllerFactory(new SystemConfigService());
  app.get("/runtime-settings", { preHandler: [app.authenticate] }, controller.getRuntimeSettings as any);
}
