import { UserRole } from "@prisma/client";
import { adminUserUpdateSchema, systemSettingsInputSchema } from "@surveysim/shared";
import { userRepository } from "../repositories/user.repository.js";
import type { AuthUserContext } from "../types/auth.js";
import { requireAdmin } from "../utils/access.js";
import { toIsoString } from "../utils/serialize.js";
import { getTodayDateKey } from "../utils/usage.js";
import { SystemConfigService } from "./system-config.service.js";

function mapRole(role: UserRole) {
  return role === UserRole.ADMIN ? "admin" : "user";
}

export class AdminService {
  private readonly systemConfigService = new SystemConfigService();

  async listUsers(actor: AuthUserContext) {
    requireAdmin(actor);
    const dateKey = getTodayDateKey();
    const users = await userRepository.listWithUsage(dateKey);
    const systemSettings = await this.systemConfigService.get();

    return users.map((user) => {
      const usageCount = user.dailyUsages[0]?.usageCount ?? 0;
      const limit = user.dailyUsageLimit ?? systemSettings.defaultDailyUsageLimit;
      return {
        id: user.id,
        email: user.email,
        role: mapRole(user.role),
        dailyUsageLimit: user.dailyUsageLimit ?? null,
        createdAt: toIsoString(user.createdAt)!,
        updatedAt: toIsoString(user.updatedAt)!,
        todayUsage: {
          dateKey,
          usageCount,
          limit,
          remaining: limit === 0 ? null : Math.max(limit - usageCount, 0),
        },
      };
    });
  }

  async updateUser(actor: AuthUserContext, userId: string, input: unknown) {
    requireAdmin(actor);
    const payload = adminUserUpdateSchema.parse(input);
    const targetUser = await userRepository.findById(userId);
    if (!targetUser) {
      throw new Error("User not found");
    }

    if (payload.role) {
      await userRepository.updateRole(userId, payload.role === "admin" ? UserRole.ADMIN : UserRole.USER);
    }

    if (payload.dailyUsageLimit !== undefined) {
      await userRepository.updateDailyUsageLimit(userId, payload.dailyUsageLimit);
    }

    const users = await this.listUsers(actor);
    return users.find((user) => user.id === userId)!;
  }

  async getSystemSettings(actor: AuthUserContext) {
    requireAdmin(actor);
    return this.systemConfigService.get();
  }

  async updateSystemSettings(actor: AuthUserContext, input: unknown) {
    requireAdmin(actor);
    const payload = systemSettingsInputSchema.parse(input);
    return this.systemConfigService.update(payload);
  }
}
