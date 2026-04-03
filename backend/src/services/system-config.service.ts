import { prisma } from "../lib/db.js";
import { toIsoString } from "../utils/serialize.js";

function mapSystemConfig(config: {
  defaultDailyUsageLimit: number;
  defaultRunConcurrency: number;
  maxUserRunConcurrency: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    defaultDailyUsageLimit: config.defaultDailyUsageLimit,
    defaultRunConcurrency: config.defaultRunConcurrency,
    maxUserRunConcurrency: config.maxUserRunConcurrency,
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

  async getRuntimeSettings() {
    const config = await this.get();
    return {
      defaultRunConcurrency: config.defaultRunConcurrency,
      maxUserRunConcurrency: config.maxUserRunConcurrency,
    };
  }

  async update(input: { defaultDailyUsageLimit: number; defaultRunConcurrency: number; maxUserRunConcurrency: number }) {
    const config = await prisma.systemConfig.upsert({
      where: { id: "system" },
      update: {
        defaultDailyUsageLimit: input.defaultDailyUsageLimit,
        defaultRunConcurrency: input.defaultRunConcurrency,
        maxUserRunConcurrency: input.maxUserRunConcurrency,
      },
      create: {
        id: "system",
        defaultDailyUsageLimit: input.defaultDailyUsageLimit,
        defaultRunConcurrency: input.defaultRunConcurrency,
        maxUserRunConcurrency: input.maxUserRunConcurrency,
      },
    });
    return mapSystemConfig(config);
  }
}
