import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import path from "node:path";
import { env } from "./config/env.js";
import { authPlugin } from "./plugins/auth.js";
import { registerRoutes } from "./routes/index.js";
import { ensureDir } from "./utils/fs.js";

export async function buildApp() {
  const app = Fastify({ logger: true });

  await ensureDir(env.STORAGE_DIR);
  await app.register(cors, { origin: true });
  await app.register(multipart);
  await app.register(authPlugin);

  await registerRoutes(app);

  const frontendDist = path.resolve(process.cwd(), env.FRONTEND_DIST);
  const hasFrontendDist = existsSync(frontendDist);

  if (hasFrontendDist) {
    await app.register(fastifyStatic, {
      root: frontendDist,
      prefix: "/",
    });
  }

  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith("/api")) {
      reply.code(404).send({ message: "Not found" });
      return;
    }

    if (!hasFrontendDist) {
      reply.code(404).send({ message: "Frontend build not found" });
      return;
    }

    return reply.sendFile("index.html");
  });

  return app;
}
