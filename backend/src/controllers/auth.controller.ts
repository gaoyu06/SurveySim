import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { AuthService } from "../services/auth.service.js";

function getErrorMessage(error: unknown) {
  if (error instanceof ZodError) {
    return error.issues.map((issue) => issue.message).join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}

export function authControllerFactory(service: AuthService) {
  return {
    bootstrapSetup: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await service.bootstrap(request.body);
        reply.send(result);
      } catch (error) {
        reply.code(400).send({ message: getErrorMessage(error) });
      }
    },
    register: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await service.register(request.body);
        reply.send(result);
      } catch (error) {
        reply.code(400).send({ message: getErrorMessage(error) });
      }
    },
    login: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await service.login(request.body);
        reply.send(result);
      } catch (error) {
        reply.code(400).send({ message: getErrorMessage(error) });
      }
    },
    me: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await service.me(request.authUser!.id);
        reply.send(result);
      } catch (error) {
        reply.code(400).send({ message: getErrorMessage(error) });
      }
    },
    bootstrap: async (_request: FastifyRequest, reply: FastifyReply) => {
      const canBootstrap = await service.canBootstrap();
      reply.send({ canBootstrap });
    },
  };
}
