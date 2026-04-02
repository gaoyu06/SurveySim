import {
  llmPublicVisibilityInputSchema,
  llmProviderConfigInputSchema,
  testConnectionInputSchema,
  type LlmProviderConfigDto,
  type LlmProviderConfigInput,
} from "@surveysim/shared";
import { llmConfigRepository } from "../../repositories/llm-config.repository.js";
import type { AuthUserContext } from "../../types/auth.js";
import { requireAdmin, resolveDataScope } from "../../utils/access.js";
import { maskApiKey } from "../../utils/crypto.js";
import { toIsoString } from "../../utils/serialize.js";
import { OpenAiCompatibleAdapter, type ChatMessage, type LlmRuntimeConfig } from "./openai-compatible.adapter.js";

function mapConfig(config: {
  id: string;
  userId: string;
  user: { email: string };
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  concurrency: number;
  retryCount: number;
  isDefault: boolean;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}, viewer: AuthUserContext): LlmProviderConfigDto {
  return {
    id: config.id,
    ownerId: config.userId,
    ownerEmail: config.user.email,
    isOwnedByCurrentUser: config.userId === viewer.id,
    name: config.name,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    maskedApiKey: maskApiKey(config.apiKey),
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    timeoutMs: config.timeoutMs,
    concurrency: config.concurrency,
    retryCount: config.retryCount,
    isDefault: config.isDefault,
    isPublic: config.isPublic,
    createdAt: toIsoString(config.createdAt)!,
    updatedAt: toIsoString(config.updatedAt)!,
  };
}

export class LlmService {
  private readonly adapter = new OpenAiCompatibleAdapter();

  async list(user: AuthUserContext, scope?: unknown) {
    const dataScope = resolveDataScope(user, scope);
    const configs = dataScope === "all" ? await llmConfigRepository.listAll() : await llmConfigRepository.listAccessible(user.id);
    return configs.map((config) => mapConfig(config, user));
  }

  async getRuntimeConfig(user: AuthUserContext | string, id: string): Promise<LlmRuntimeConfig> {
    const viewer = typeof user === "string" ? { id: user, email: "", role: "user" as const } : user;
    const config = viewer.role === "admin"
      ? await llmConfigRepository.getAnyById(id)
      : await llmConfigRepository.getAccessibleById(viewer.id, id);
    if (!config) {
      throw new Error("LLM config not found");
    }
    return config;
  }

  async getDefaultRuntimeConfig(userId: string): Promise<LlmRuntimeConfig> {
    const config = await llmConfigRepository.getDefault(userId);
    if (!config) {
      throw new Error("No default LLM config found");
    }
    return config;
  }

  async create(userId: string, input: unknown) {
    const payload = llmProviderConfigInputSchema.parse(input) as LlmProviderConfigInput;
    const created = await llmConfigRepository.create(userId, payload);
    return mapConfig(created, { id: userId, email: created.user.email, role: "user" });
  }

  async update(userId: string, id: string, input: unknown) {
    const payload = llmProviderConfigInputSchema.parse(input) as LlmProviderConfigInput;
    const existing = await llmConfigRepository.getOwnedById(userId, id);
    if (!existing) {
      throw new Error("LLM config not found");
    }
    const updated = await llmConfigRepository.update(userId, id, payload);
    return mapConfig(updated, { id: userId, email: updated.user.email, role: "user" });
  }

  async delete(userId: string, id: string) {
    await llmConfigRepository.delete(userId, id);
    return { success: true };
  }

  async setDefault(userId: string, id: string) {
    const existing = await llmConfigRepository.getOwnedById(userId, id);
    if (!existing) {
      throw new Error("LLM config not found");
    }
    const updated = await llmConfigRepository.setDefault(userId, id);
    return mapConfig(updated, { id: userId, email: updated.user.email, role: "user" });
  }

  async setPublic(actor: AuthUserContext, id: string, input: unknown) {
    requireAdmin(actor);
    const payload = llmPublicVisibilityInputSchema.parse(input);
    const existing = await llmConfigRepository.getAnyById(id);
    if (!existing) {
      throw new Error("LLM config not found");
    }
    const updated = await llmConfigRepository.setPublic(id, payload.isPublic);
    return mapConfig(updated, actor);
  }

  async testConnection(input: unknown) {
    const payload = testConnectionInputSchema.parse(input);
    const ok = await this.adapter.testConnection({
      ...payload,
      timeoutMs: payload.timeoutMs,
    });
    return { ok };
  }

  async generateJson<T>(
    config: LlmRuntimeConfig,
    messages: ChatMessage[],
    fixerPrompt: string,
    options?: { signal?: AbortSignal },
  ) {
    return this.adapter.chatJson<T>(config, messages, fixerPrompt, options);
  }

  async generateJsonWithEvents<T>(
    config: LlmRuntimeConfig,
    messages: ChatMessage[],
    fixerPrompt: string,
    onEvent?: (event: { type: "delta" | "status"; chunk?: string; message?: string }) => Promise<void> | void,
    options?: { signal?: AbortSignal },
  ) {
    return this.adapter.chatJsonWithEvents<T>(config, messages, fixerPrompt, onEvent, options);
  }

  async generateTextStream(
    config: LlmRuntimeConfig,
    messages: ChatMessage[],
    onEvent?: (event: { type: "delta" | "status"; chunk?: string; message?: string }) => Promise<void> | void,
    options?: { signal?: AbortSignal },
  ) {
    return this.adapter.streamText(config, messages, onEvent, options);
  }

  async generateText(config: LlmRuntimeConfig, messages: ChatMessage[], options?: { signal?: AbortSignal }) {
    return this.adapter.chatText(config, messages, undefined, options);
  }
}
