import type { FastifyInstance } from "fastify";
import { loginInputSchema, registerInputSchema, type AuthResponse } from "@surveysim/shared";
import { userRepository } from "../repositories/user.repository.js";
import { hashPassword, verifyPassword } from "../utils/crypto.js";
import { toIsoString } from "../utils/serialize.js";

function mapUser(user: { id: string; email: string; createdAt: Date; updatedAt: Date }) {
  return {
    id: user.id,
    email: user.email,
    createdAt: toIsoString(user.createdAt)!,
    updatedAt: toIsoString(user.updatedAt)!,
  };
}

export class AuthService {
  constructor(private readonly app: FastifyInstance) {}

  async register(input: unknown): Promise<AuthResponse> {
    const payload = registerInputSchema.parse(input);
    const existing = await userRepository.findByEmail(payload.email);
    if (existing) {
      throw new Error("Email already exists");
    }

    const passwordHash = await hashPassword(payload.password);
    const user = await userRepository.create(payload.email, passwordHash);
    const token = await this.app.jwt.sign({ id: user.id, email: user.email });

    return { token, user: mapUser(user) };
  }

  async login(input: unknown): Promise<AuthResponse> {
    const payload = loginInputSchema.parse(input);
    const user = await userRepository.findByEmail(payload.email);
    if (!user) {
      throw new Error("Invalid email or password");
    }

    const valid = await verifyPassword(payload.password, user.passwordHash);
    if (!valid) {
      throw new Error("Invalid email or password");
    }

    const token = await this.app.jwt.sign({ id: user.id, email: user.email });
    return { token, user: mapUser(user) };
  }

  async me(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }
    return mapUser(user);
  }

  async canBootstrap() {
    const count = await userRepository.count();
    return count === 0;
  }
}
