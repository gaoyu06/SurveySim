import type { FastifyInstance } from "fastify";
import { exportControllerFactory } from "../controllers/export.controller.js";
import { ExportService } from "../services/export.service.js";

export async function exportRoutes(app: FastifyInstance) {
  const controller = exportControllerFactory(new ExportService());
  const auth = { preHandler: [app.authenticate] };
  app.get("/:runId/json", auth, controller.json as any);
  app.get("/:runId/csv", auth, controller.csv as any);
  app.get("/:runId/open-text-csv", auth, controller.openTextCsv as any);
  app.get("/:runId/raw-csv", auth, controller.rawResponseCsv as any);
  app.get("/:runId/html", auth, controller.html as any);
}
