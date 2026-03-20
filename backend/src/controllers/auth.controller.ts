import type { FastifyReply, FastifyRequest } from "fastify";
import { AuthService } from "../services/auth.service.js";

export function authControllerFactory(service: AuthService) {
  return {
    register: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await service.register(request.body);
        reply.send(result);
      } catch (error) {
        reply.code(400).send({ message: error instanceof Error ? error.message : String(error) });
      }
    },
    login: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await service.login(request.body);
        reply.send(result);
      } catch (error) {
        reply.code(400).send({ message: error instanceof Error ? error.message : String(error) });
      }
    },
    me: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await service.me(request.authUser!.id);
        reply.send(result);
      } catch (error) {
        reply.code(400).send({ message: error instanceof Error ? error.message : String(error) });
      }
    },
    bootstrap: async (_request: FastifyRequest, reply: FastifyReply) => {
      const canBootstrap = await service.canBootstrap();
      reply.send({ canBootstrap });
    },
  };
}
