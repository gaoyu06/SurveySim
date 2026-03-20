import type { FastifyInstance } from "fastify";
import { authRoutes } from "./auth.routes.js";
import { llmRoutes } from "./llm.routes.js";
import { participantTemplateRoutes } from "./participant-template.routes.js";
import { surveyRoutes } from "./survey.routes.js";
import { mockRunRoutes } from "./mock-run.routes.js";
import { reportRoutes } from "./report.routes.js";
import { exportRoutes } from "./export.routes.js";

export async function registerRoutes(app: FastifyInstance) {
  app.get("/api/health", async () => ({ ok: true }));
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(llmRoutes, { prefix: "/api/llm-configs" });
  await app.register(participantTemplateRoutes, { prefix: "/api/participant-templates" });
  await app.register(surveyRoutes, { prefix: "/api/surveys" });
  await app.register(mockRunRoutes, { prefix: "/api/mock-runs" });
  await app.register(reportRoutes, { prefix: "/api/reports" });
  await app.register(exportRoutes, { prefix: "/api/exports" });
}
