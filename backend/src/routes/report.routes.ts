import type { FastifyInstance } from "fastify";
import { reportControllerFactory } from "../controllers/report.controller.js";
import { ReportService } from "../services/reporting/report.service.js";

export async function reportRoutes(app: FastifyInstance) {
  const controller = reportControllerFactory(new ReportService());
  app.post("/compare", { preHandler: [app.authenticate] }, controller.compare as any);
  app.post("/:runId", { preHandler: [app.authenticate] }, controller.getByRun as any);
}
