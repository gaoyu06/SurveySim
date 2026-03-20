import fp from "fastify-plugin";
import fastifyJwt from "@fastify/jwt";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";

export const authPlugin = fp(async (app) => {
  await app.register(fastifyJwt, { secret: env.JWT_SECRET });

  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const payload = await request.jwtVerify<{ id: string; email: string }>();
      request.authUser = { id: payload.id, email: payload.email };
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
