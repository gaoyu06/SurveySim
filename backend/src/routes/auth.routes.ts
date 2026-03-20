import type { FastifyInstance } from "fastify";
import { authControllerFactory } from "../controllers/auth.controller.js";
import { AuthService } from "../services/auth.service.js";

export async function authRoutes(app: FastifyInstance) {
  const controller = authControllerFactory(new AuthService(app));
  app.get("/bootstrap", controller.bootstrap);
  app.post("/register", controller.register);
  app.post("/login", controller.login);
  app.get("/me", { preHandler: [app.authenticate] }, controller.me);
}
