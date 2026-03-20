import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  JWT_SECRET: z.string().min(16).default("formagents-dev-secret"),
  DATABASE_URL: z.string().default("file:./dev.db"),
  STORAGE_DIR: z.string().default("./storage/runtime"),
  FRONTEND_DIST: z.string().default("../frontend/dist"),
});

export const env = envSchema.parse(process.env);
