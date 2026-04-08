import { prisma } from "../lib/db.js";
import { UserRole } from "@prisma/client";

export const userRepository = {
  count() {
    return prisma.user.count();
  },
  countAdmins() {
    return prisma.user.count({ where: { role: UserRole.ADMIN } });
  },
  findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },
  findById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },
  listWithUsage(dateKey: string) {
    return prisma.user.findMany({
      include: {
        dailyUsages: {
          where: { dateKey },
          take: 1,
        },
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    });
  },
  create(email: string, passwordHash: string, role: UserRole) {
    return prisma.user.create({ data: { email, passwordHash, role } });
  },
  updateRole(id: string, role: UserRole) {
    return prisma.user.update({ where: { id }, data: { role } });
  },
  updateDailyUsageLimit(id: string, dailyUsageLimit: number | null) {
    return prisma.user.update({ where: { id }, data: { dailyUsageLimit } });
  },
};
