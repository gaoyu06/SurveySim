import "fastify";
import type { AuthUserContext } from "./auth.js";

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthUserContext;
  }
}
