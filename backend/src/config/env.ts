import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3123),
  HOST: z.string().default("0.0.0.0"),
  JWT_SECRET: z.string().min(16).default("surveysim-dev-secret"),
  DATABASE_URL: z.string().min(1),
  STORAGE_DIR: z.string().default("./storage/runtime"),
  FRONTEND_DIST: z.string().default("../frontend/dist"),
});

export const env = envSchema.parse(process.env);
