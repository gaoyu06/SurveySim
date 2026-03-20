import type { FastifyReply, FastifyRequest } from "fastify";
import { ParticipantTemplateService } from "../services/participant-template.service.js";

export function participantTemplateControllerFactory(service: ParticipantTemplateService) {
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
    clone: async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      reply.send(await service.clone(request.authUser!.id, request.params.id));
    },
    preview: async (request: FastifyRequest<{ Params: { id: string }; Querystring: { sampleSize?: number } }>, reply: FastifyReply) => {
      reply.send(await service.preview(request.authUser!.id, request.params.id, request.query.sampleSize));
    },
  };
}
