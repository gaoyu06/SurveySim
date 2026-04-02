import { z } from "zod";

export const userRoleSchema = z.enum(["admin", "user"]);

export const systemSettingsSchema = z.object({
  defaultDailyUsageLimit: z.number().int().min(0).max(100000),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const systemSettingsInputSchema = systemSettingsSchema.pick({
  defaultDailyUsageLimit: true,
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
export type UserDailyUsageSummaryDto = z.infer<typeof userDailyUsageSummarySchema>;
export type AdminUserDto = z.infer<typeof adminUserSchema>;
export type AdminUserUpdateInput = z.infer<typeof adminUserUpdateSchema>;
