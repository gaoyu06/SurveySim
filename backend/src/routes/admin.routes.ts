import type { FastifyInstance } from "fastify";
import { adminControllerFactory } from "../controllers/admin.controller.js";
import { AdminService } from "../services/admin.service.js";

export async function adminRoutes(app: FastifyInstance) {
  const controller = adminControllerFactory(new AdminService());
  const auth = { preHandler: [app.authenticate] };

  app.get("/users", auth, controller.listUsers as any);
  app.put("/users/:id", auth, controller.updateUser as any);
  app.get("/system-settings", auth, controller.getSystemSettings as any);
  app.put("/system-settings", auth, controller.updateSystemSettings as any);
}
