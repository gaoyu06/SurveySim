import type { FastifyReply, FastifyRequest } from "fastify";
import { WorkspaceAssistantService } from "../services/workspace-assistant.service.js";

export function workspaceAssistantControllerFactory(service: WorkspaceAssistantService) {
  return {
    quickCreate: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        reply.send(await service.quickCreate(request.authUser!, request.body));
      } catch (error) {
        reply.code(400).send({ message: error instanceof Error ? error.message : String(error) });
      }
    },
  };
}
