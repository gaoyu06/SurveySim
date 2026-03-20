import {
  llmProviderConfigInputSchema,
  testConnectionInputSchema,
  type LlmProviderConfigDto,
  type LlmProviderConfigInput,
} from "@formagents/shared";
import { llmConfigRepository } from "../../repositories/llm-config.repository.js";
import { maskApiKey } from "../../utils/crypto.js";
import { toIsoString } from "../../utils/serialize.js";
import { OpenAiCompatibleAdapter, type ChatMessage, type LlmRuntimeConfig } from "./openai-compatible.adapter.js";

function mapConfig(config: {
  id: string;
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
  createdAt: Date;
  updatedAt: Date;
}): LlmProviderConfigDto {
  return {
    id: config.id,
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
    createdAt: toIsoString(config.createdAt)!,
    updatedAt: toIsoString(config.updatedAt)!,
  };
}

export class LlmService {
  private readonly adapter = new OpenAiCompatibleAdapter();

  async list(userId: string) {
    const configs = await llmConfigRepository.list(userId);
    return configs.map(mapConfig);
  }

  async getRuntimeConfig(userId: string, id: string): Promise<LlmRuntimeConfig> {
    const config = await llmConfigRepository.getById(userId, id);
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
    return mapConfig(created);
  }

  async update(userId: string, id: string, input: unknown) {
    const payload = llmProviderConfigInputSchema.parse(input) as LlmProviderConfigInput;
    const existing = await llmConfigRepository.getById(userId, id);
    if (!existing) {
      throw new Error("LLM config not found");
    }
    const updated = await llmConfigRepository.update(userId, id, payload);
    return mapConfig(updated);
  }

  async delete(userId: string, id: string) {
    await llmConfigRepository.delete(userId, id);
    return { success: true };
  }

  async setDefault(userId: string, id: string) {
    const updated = await llmConfigRepository.setDefault(userId, id);
    return mapConfig(updated);
  }

  async testConnection(input: unknown) {
    const payload = testConnectionInputSchema.parse(input);
    const ok = await this.adapter.testConnection({
      ...payload,
      timeoutMs: payload.timeoutMs,
    });
    return { ok };
  }

  async generateJson<T>(config: LlmRuntimeConfig, messages: ChatMessage[], fixerPrompt: string) {
    return this.adapter.chatJson<T>(config, messages, fixerPrompt);
  }

  async generateText(config: LlmRuntimeConfig, messages: ChatMessage[]) {
    return this.adapter.chatText(config, messages);
  }
}
