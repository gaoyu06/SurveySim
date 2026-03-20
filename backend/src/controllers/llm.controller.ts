import type { FastifyReply, FastifyRequest } from "fastify";
import { LlmService } from "../services/llm/llm.service.js";

export function llmControllerFactory(service: LlmService) {
  return {
    list: async (request: FastifyRequest, reply: FastifyReply) => {
      reply.send(await service.list(request.authUser!.id));
    },
    create: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        reply.send(await service.create(request.authUser!.id, request.body));
      } catch (error) {
        reply.code(400).send({ message: error instanceof Error ? error.message : String(error) });
      }
    },
    update: async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        reply.send(await service.update(request.authUser!.id, request.params.id, request.body));
      } catch (error) {
        reply.code(400).send({ message: error instanceof Error ? error.message : String(error) });
      }
    },
    delete: async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      reply.send(await service.delete(request.authUser!.id, request.params.id));
    },
    setDefault: async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      reply.send(await service.setDefault(request.authUser!.id, request.params.id));
    },
    testConnection: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        reply.send(await service.testConnection(request.body));
      } catch (error) {
        reply.code(400).send({ message: error instanceof Error ? error.message : String(error) });
      }
    },
  };
}
