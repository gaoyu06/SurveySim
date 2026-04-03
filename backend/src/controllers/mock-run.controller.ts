import type { FastifyReply, FastifyRequest } from "fastify";
import type { MockRunStartInput } from "@surveysim/shared";
import { MockEngineService } from "../services/mock-engine/mock-engine.service.js";

export function mockRunControllerFactory(service: MockEngineService) {
  return {
    list: async (request: FastifyRequest<{ Querystring: { scope?: string } }>, reply: FastifyReply) => {
      reply.send(await service.list(request.authUser!, request.query.scope));
    },
    get: async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        reply.send(await service.get(request.authUser!, request.params.id));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        reply.code(message === "Mock run not found" ? 404 : 500).send({ message });
      }
    },
    create: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        reply.send(await service.create(request.authUser!, request.body));
      } catch (error) {
        reply.code(400).send({ message: error instanceof Error ? error.message : String(error) });
      }
    },
    start: async (request: FastifyRequest<{ Params: { id: string }; Body: MockRunStartInput }>, reply: FastifyReply) => {
      try {
        reply.send(await service.start(request.authUser!, request.params.id, request.body));
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
    delete: async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        reply.send(await service.delete(request.authUser!.id, request.params.id));
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
    appendParticipants: async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        reply.send(await service.appendParticipants(request.authUser!.id, request.params.id, request.body));
      } catch (error) {
        reply.code(400).send({ message: error instanceof Error ? error.message : String(error) });
      }
    },
  };
}
