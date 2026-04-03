import type { FastifyReply, FastifyRequest } from "fastify";
import { SystemConfigService } from "../services/system-config.service.js";

export function systemControllerFactory(service: SystemConfigService) {
  return {
    getRuntimeSettings: async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        reply.send(await service.getRuntimeSettings());
      } catch (error) {
        reply.code(400).send({ message: error instanceof Error ? error.message : String(error) });
      }
    },
  };
}
