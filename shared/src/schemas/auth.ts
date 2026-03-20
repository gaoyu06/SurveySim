import { z } from "zod";

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const registerInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const loginInputSchema = registerInputSchema;

export const authResponseSchema = z.object({
  token: z.string(),
  user: userSchema,
  canBootstrap: z.boolean().optional(),
});

export type UserDto = z.infer<typeof userSchema>;
export type RegisterInput = z.infer<typeof registerInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
