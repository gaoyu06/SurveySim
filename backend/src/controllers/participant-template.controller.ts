import type { FastifyReply, FastifyRequest } from "fastify";
import { ParticipantTemplateService } from "../services/participant-template.service.js";

export function participantTemplateControllerFactory(service: ParticipantTemplateService) {
  return {
    list: async (request: FastifyRequest<{ Querystring: { scope?: string } }>, reply: FastifyReply) => {
      reply.send(await service.list(request.authUser!, request.query.scope));
    },
    get: async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        reply.send(await service.get(request.authUser!, request.params.id));
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
      try {
        reply.send(await service.delete(request.authUser!.id, request.params.id));
      } catch (error) {
        reply.code(400).send({ message: error instanceof Error ? error.message : String(error) });
      }
    },
    clone: async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      reply.send(await service.clone(request.authUser!.id, request.params.id));
    },
    preview: async (request: FastifyRequest<{ Params: { id: string }; Querystring: { sampleSize?: number } }>, reply: FastifyReply) => {
      reply.send(await service.preview(request.authUser!.id, request.params.id, request.query.sampleSize));
    },
    generateWithAi: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        reply.send(await service.generateWithAi(request.authUser!, request.body));
      } catch (error) {
        reply.code(400).send({ message: error instanceof Error ? error.message : String(error) });
      }
    },
    generateWithAiStream: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        reply.hijack();
        reply.raw.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        reply.raw.write(": connected\n\n");

        for await (const event of service.generateWithAiStream(request.authUser!, request.body)) {
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        }

        reply.raw.end();
      } catch (error) {
        if (!reply.sent) {
          reply.hijack();
          reply.raw.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });
        }
        reply.raw.write(`data: ${JSON.stringify({ type: "error", message: error instanceof Error ? error.message : String(error) })}\n\n`);
        reply.raw.end();
      }
    },
  };
}
