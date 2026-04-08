import { z } from "zod";

export const llmProviderConfigInputSchema = z.object({
  name: z.string().min(1).max(80),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1).optional(),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(64).max(16000),
  timeoutMs: z.number().int().min(1000).max(300000),
  concurrency: z.number().int().min(1).max(64),
  retryCount: z.number().int().min(0).max(8),
  isDefault: z.boolean().optional(),
});

export const llmProviderConfigCreateInputSchema = llmProviderConfigInputSchema.extend({
  apiKey: z.string().min(1),
});

export const llmProviderConfigSchema = llmProviderConfigInputSchema.omit({ apiKey: true }).extend({
  id: z.string(),
  ownerId: z.string(),
  ownerEmail: z.string().email(),
  isOwnedByCurrentUser: z.boolean().default(true),
  isPublic: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
  maskedApiKey: z.string(),
});

export const llmPublicVisibilityInputSchema = z.object({
  isPublic: z.boolean(),
});

export const testConnectionInputSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  model: z.string().min(1),
  timeoutMs: z.number().int().min(1000).max(300000),
});

export type LlmProviderConfigInput = z.infer<typeof llmProviderConfigInputSchema>;
export type LlmProviderConfigCreateInput = z.infer<typeof llmProviderConfigCreateInputSchema>;
export type LlmProviderConfigDto = z.infer<typeof llmProviderConfigSchema>;
export type TestConnectionInput = z.infer<typeof testConnectionInputSchema>;
export type LlmPublicVisibilityInput = z.infer<typeof llmPublicVisibilityInputSchema>;
