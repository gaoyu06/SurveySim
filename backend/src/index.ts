import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/db.js";

const app = await buildApp();

const close = async () => {
  await prisma.$disconnect();
  await app.close();
  process.exit(0);
};

process.on("SIGINT", close);
process.on("SIGTERM", close);

await app.listen({ port: env.PORT, host: env.HOST });
