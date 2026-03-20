import type { FastifyInstance } from "fastify";
import { participantTemplateControllerFactory } from "../controllers/participant-template.controller.js";
import { ParticipantTemplateService } from "../services/participant-template.service.js";

export async function participantTemplateRoutes(app: FastifyInstance) {
  const controller = participantTemplateControllerFactory(new ParticipantTemplateService());
  const auth = { preHandler: [app.authenticate] };
  app.get("/", auth, controller.list as any);
  app.post("/", auth, controller.create as any);
  app.get("/:id", auth, controller.get as any);
  app.put("/:id", auth, controller.update as any);
  app.delete("/:id", auth, controller.delete as any);
  app.post("/:id/clone", auth, controller.clone as any);
  app.get("/:id/preview", auth, controller.preview as any);
}
