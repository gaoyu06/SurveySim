import { z } from "zod";

export const idSchema = z.string().min(1);
export const timestampSchema = z.string().datetime().optional();

export const optionValueSchema = z.union([z.string(), z.number(), z.boolean()]);
export const jsonRecordSchema: z.ZodType<Record<string, unknown>> = z.record(z.string(), z.unknown());
