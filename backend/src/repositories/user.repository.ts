import { prisma } from "../lib/db.js";

export const userRepository = {
  count() {
    return prisma.user.count();
  },
  findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },
  findById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },
  create(email: string, passwordHash: string) {
    return prisma.user.create({ data: { email, passwordHash } });
  },
};
