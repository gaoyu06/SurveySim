import { z } from "zod";

export const userRoleSchema = z.enum(["admin", "user"]);

const systemSettingsBaseSchema = z.object({
  defaultDailyUsageLimit: z.number().int().min(0).max(100000),
  defaultRunConcurrency: z.number().int().min(1).max(64),
  maxUserRunConcurrency: z.number().int().min(1).max(64),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const systemSettingsSchema = systemSettingsBaseSchema.refine((value) => value.defaultRunConcurrency <= value.maxUserRunConcurrency, {
  message: "Default concurrency cannot exceed the max user concurrency",
  path: ["defaultRunConcurrency"],
});

export const systemSettingsInputSchema = systemSettingsBaseSchema.pick({
  defaultDailyUsageLimit: true,
  defaultRunConcurrency: true,
  maxUserRunConcurrency: true,
}).refine((value) => value.defaultRunConcurrency <= value.maxUserRunConcurrency, {
  message: "Default concurrency cannot exceed the max user concurrency",
  path: ["defaultRunConcurrency"],
});

export const systemRuntimeSettingsSchema = systemSettingsBaseSchema.pick({
  defaultRunConcurrency: true,
  maxUserRunConcurrency: true,
});

export const userDailyUsageSummarySchema = z.object({
  dateKey: z.string(),
  usageCount: z.number().int().min(0),
  limit: z.number().int().nullable(),
  remaining: z.number().int().nullable(),
});

export const adminUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  role: userRoleSchema,
  dailyUsageLimit: z.number().int().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  todayUsage: userDailyUsageSummarySchema,
});

export const adminUserUpdateSchema = z.object({
  role: userRoleSchema.optional(),
  dailyUsageLimit: z.number().int().min(0).nullable().optional(),
});

export type UserRole = z.infer<typeof userRoleSchema>;
export type SystemSettingsDto = z.infer<typeof systemSettingsSchema>;
export type SystemSettingsInput = z.infer<typeof systemSettingsInputSchema>;
export type SystemRuntimeSettingsDto = z.infer<typeof systemRuntimeSettingsSchema>;
export type UserDailyUsageSummaryDto = z.infer<typeof userDailyUsageSummarySchema>;
export type AdminUserDto = z.infer<typeof adminUserSchema>;
export type AdminUserUpdateInput = z.infer<typeof adminUserUpdateSchema>;
