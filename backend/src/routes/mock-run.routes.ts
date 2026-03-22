import type { FastifyInstance } from "fastify";
import { mockRunControllerFactory } from "../controllers/mock-run.controller.js";
import { MockEngineService } from "../services/mock-engine/mock-engine.service.js";

const service = new MockEngineService();

export async function mockRunRoutes(app: FastifyInstance) {
  const controller = mockRunControllerFactory(service);
  const auth = { preHandler: [app.authenticate] };
  app.get("/", auth, controller.list as any);
  app.post("/", auth, controller.create as any);
  app.get("/:id", auth, controller.get as any);
  app.post("/:id/start", auth, controller.start as any);
  app.post("/:id/cancel", auth, controller.cancel as any);
  app.delete("/:id", auth, controller.delete as any);
  app.post("/:id/retry", auth, controller.retry as any);
  app.post("/:id/append-participants", auth, controller.appendParticipants as any);
}
