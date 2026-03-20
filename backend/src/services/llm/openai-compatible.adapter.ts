import { jsonrepair } from "jsonrepair";
import { safeJson } from "../../utils/http.js";

export interface LlmRuntimeConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  retryCount: number;
  concurrency?: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

function normalizeBaseUrl(baseUrl: string) {
  if (baseUrl.endsWith("/chat/completions")) {
    return baseUrl;
  }
  return `${baseUrl.replace(/\/$/, "")}/chat/completions`;
}

function extractTextContent(content: string | Array<{ type?: string; text?: string }> | undefined) {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((item) => item.text ?? "").join("\n");
  }
  return "";
}

function stripCodeFence(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
    return trimmed.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  }
  return trimmed;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class OpenAiCompatibleAdapter {
  async chatText(config: LlmRuntimeConfig, messages: ChatMessage[], overrides?: Partial<Pick<LlmRuntimeConfig, "temperature" | "maxTokens" | "timeoutMs">>) {
    const attempts = Math.max(1, (config.retryCount ?? 0) + 1);
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(new Error("Timeout")), overrides?.timeoutMs ?? config.timeoutMs);

      try {
        const response = await fetch(normalizeBaseUrl(config.baseUrl), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: config.model,
            messages,
            temperature: overrides?.temperature ?? config.temperature,
            max_tokens: overrides?.maxTokens ?? config.maxTokens,
          }),
        });

        const payload = await safeJson<ChatCompletionResponse>(response);
        const text = extractTextContent(payload.choices?.[0]?.message?.content).trim();
        if (!text) {
          throw new Error("LLM returned empty content");
        }
        return text;
      } catch (error) {
        lastError = error;
        if (attempt >= attempts) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`LLM request failed after ${attempts} attempt(s): ${message}`);
        }
        await wait(Math.min(3000, 400 * attempt));
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new Error(lastError instanceof Error ? lastError.message : String(lastError));
  }

  async chatJson<T>(config: LlmRuntimeConfig, messages: ChatMessage[], fixerPrompt?: string): Promise<T> {
    const raw = await this.chatText(config, messages);
    const parsed = this.tryParse<T>(raw);
    if (parsed.ok) {
      return parsed.value;
    }

    if (fixerPrompt) {
      const repaired = await this.chatText(
        config,
        [
          { role: "system", content: "You repair invalid JSON. Return valid JSON only." },
          { role: "user", content: `${fixerPrompt}\n\nInvalid JSON:\n${raw}` },
        ],
        { temperature: 0.1 },
      );
      const retried = this.tryParse<T>(repaired);
      if (retried.ok) {
        return retried.value;
      }
    }

    throw new Error(`Unable to parse LLM JSON response: ${parsed.error}`);
  }

  async testConnection(config: Pick<LlmRuntimeConfig, "baseUrl" | "apiKey" | "model" | "timeoutMs">) {
    const text = await this.chatText(
      {
        ...config,
        temperature: 0,
        maxTokens: 256,
        retryCount: 0,
      },
      [
        { role: "system", content: "Return JSON only." },
        { role: "user", content: 'Return {"ok":true,"message":"pong"}.' },
      ],
      { temperature: 0, maxTokens: 128 },
    );

    return this.tryParse<{ ok: boolean; message?: string }>(text).ok;
  }

  private tryParse<T>(value: string): { ok: true; value: T } | { ok: false; error: string } {
    try {
      return { ok: true, value: JSON.parse(stripCodeFence(value)) as T };
    } catch (error) {
      try {
        return { ok: true, value: JSON.parse(jsonrepair(stripCodeFence(value))) as T };
      } catch (repairError) {
        return { ok: false, error: repairError instanceof Error ? repairError.message : String(error) };
      }
    }
  }
}
