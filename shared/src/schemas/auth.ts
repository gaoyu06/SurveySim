import { z } from "zod";
import { userRoleSchema } from "./admin.js";

const emailInputSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .email("Please enter a valid email address");

const passwordInputSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long");

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  role: userRoleSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const registerInputSchema = z.object({
  email: emailInputSchema,
  password: passwordInputSchema,
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
