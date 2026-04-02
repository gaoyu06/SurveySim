import { prisma } from "../lib/db.js";
import type { AuthUserContext } from "../types/auth.js";
import { getTodayDateKey } from "../utils/usage.js";

export class UsageLimitService {
  async getTodayUsage(userId: string) {
    const dateKey = getTodayDateKey();
    const [user, systemConfig, usage] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      prisma.systemConfig.upsert({
        where: { id: "system" },
        update: {},
        create: { id: "system" },
      }),
      prisma.userDailyUsage.findUnique({
        where: {
          userId_dateKey: {
            userId,
            dateKey,
          },
        },
      }),
    ]);

    const limit = user.dailyUsageLimit ?? systemConfig.defaultDailyUsageLimit;
    const usageCount = usage?.usageCount ?? 0;
    return {
      dateKey,
      usageCount,
      limit,
      remaining: limit === 0 ? null : Math.max(limit - usageCount, 0),
    };
  }

  async consumeOrThrow(user: AuthUserContext, reason: string) {
    if (user.role === "admin") {
      return;
    }

    const dateKey = getTodayDateKey();
    await prisma.$transaction(async (tx) => {
      const [dbUser, systemConfig] = await Promise.all([
        tx.user.findUniqueOrThrow({ where: { id: user.id } }),
        tx.systemConfig.upsert({
          where: { id: "system" },
          update: {},
          create: { id: "system" },
        }),
      ]);

      const limit = dbUser.dailyUsageLimit ?? systemConfig.defaultDailyUsageLimit;
      if (limit <= 0) {
        return;
      }

      const usage = await tx.userDailyUsage.upsert({
        where: {
          userId_dateKey: {
            userId: user.id,
            dateKey,
          },
        },
        update: {},
        create: {
          userId: user.id,
          dateKey,
          usageCount: 0,
        },
      });

      if (usage.usageCount >= limit) {
        throw new Error(`Daily usage limit reached for today while attempting: ${reason}`);
      }

      await tx.userDailyUsage.update({
        where: { id: usage.id },
        data: { usageCount: { increment: 1 } },
      });
    });
  }
}
