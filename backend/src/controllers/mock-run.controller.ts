import type { FastifyReply, FastifyRequest } from "fastify";
import { MockEngineService } from "../services/mock-engine/mock-engine.service.js";

export function mockRunControllerFactory(service: MockEngineService) {
  return {
    list: async (request: FastifyRequest, reply: FastifyReply) => {
      reply.send(await service.list(request.authUser!.id));
    },
    get: async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        reply.send(await service.get(request.authUser!.id, request.params.id));
      } catch (error) {
        reply.code(404).send({ message: error instanceof Error ? error.message : String(error) });
      }
    },
    create: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        reply.send(await service.create(request.authUser!.id, request.body));
      } catch (error) {
        reply.code(400).send({ message: error instanceof Error ? error.message : String(error) });
      }
    },
    start: async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        reply.send(await service.start(request.authUser!.id, request.params.id));
      } catch (error) {
        reply.code(400).send({ message: error instanceof Error ? error.message : String(error) });
      }
    },
    cancel: async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        reply.send(await service.cancel(request.authUser!.id, request.params.id));
      } catch (error) {
        reply.code(400).send({ message: error instanceof Error ? error.message : String(error) });
      }
    },
    retry: async (request: FastifyRequest<{ Params: { id: string }; Body: { participantIds?: string[] } }>, reply: FastifyReply) => {
      try {
        reply.send(await service.retryParticipants(request.authUser!.id, request.params.id, request.body.participantIds ?? []));
      } catch (error) {
        reply.code(400).send({ message: error instanceof Error ? error.message : String(error) });
      }
    },
  };
}
