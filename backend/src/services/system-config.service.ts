import { prisma } from "../lib/db.js";
import { toIsoString } from "../utils/serialize.js";

function mapSystemConfig(config: { defaultDailyUsageLimit: number; createdAt: Date; updatedAt: Date }) {
  return {
    defaultDailyUsageLimit: config.defaultDailyUsageLimit,
    createdAt: toIsoString(config.createdAt)!,
    updatedAt: toIsoString(config.updatedAt)!,
  };
}

export class SystemConfigService {
  async get() {
    const config = await prisma.systemConfig.upsert({
      where: { id: "system" },
      update: {},
      create: { id: "system" },
    });
    return mapSystemConfig(config);
  }

  async update(input: { defaultDailyUsageLimit: number }) {
    const config = await prisma.systemConfig.upsert({
      where: { id: "system" },
      update: {
        defaultDailyUsageLimit: input.defaultDailyUsageLimit,
      },
      create: {
        id: "system",
        defaultDailyUsageLimit: input.defaultDailyUsageLimit,
      },
    });
    return mapSystemConfig(config);
  }
}
