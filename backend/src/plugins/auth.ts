import fp from "fastify-plugin";
import fastifyJwt from "@fastify/jwt";
import { UserRole } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import { userRepository } from "../repositories/user.repository.js";

export const authPlugin = fp(async (app) => {
  await app.register(fastifyJwt, { secret: env.JWT_SECRET });

  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await userRepository.ensureAdminExists();
      const payload = await request.jwtVerify<{ id: string; email: string }>();
      const user = await userRepository.findById(payload.id);
      if (!user) {
        reply.code(401).send({ message: "Unauthorized" });
        return;
      }
      request.authUser = {
        id: payload.id,
        email: payload.email,
        role: (user.role === UserRole.ADMIN ? "admin" : "user"),
      };
    } catch {
      reply.code(401).send({ message: "Unauthorized" });
    }
  });
});

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
