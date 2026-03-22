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

interface RequestOptions {
  signal?: AbortSignal;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

interface StreamChunkResponse {
  choices?: Array<{
    delta?: {
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

function isAbortTimeoutError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.name === "AbortError" || /timeout/i.test(error.message);
}

function mergeAbortSignals(...signals: Array<AbortSignal | undefined>) {
  const available = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  if (available.length === 0) return undefined;
  if (available.length === 1) return available[0];

  const controller = new AbortController();
  const abort = () => {
    if (!controller.signal.aborted) {
      controller.abort(new Error("Aborted"));
    }
  };

  for (const signal of available) {
    if (signal.aborted) {
      abort();
      break;
    }
    signal.addEventListener("abort", abort, { once: true });
  }

  return controller.signal;
}

export class OpenAiCompatibleAdapter {
  async chatText(
    config: LlmRuntimeConfig,
    messages: ChatMessage[],
    overrides?: Partial<Pick<LlmRuntimeConfig, "temperature" | "maxTokens" | "timeoutMs">>,
    options?: RequestOptions,
  ) {
    const attempts = Math.max(1, (config.retryCount ?? 0) + 1);
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(new Error("Timeout")), overrides?.timeoutMs ?? config.timeoutMs);
      const signal = mergeAbortSignals(controller.signal, options?.signal);

      try {
        const response = await fetch(normalizeBaseUrl(config.baseUrl), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
          signal,
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

  async chatJson<T>(config: LlmRuntimeConfig, messages: ChatMessage[], fixerPrompt?: string, options?: RequestOptions): Promise<T> {
    const raw = await this.chatText(config, messages, undefined, options);
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
        options,
      );
      const retried = this.tryParse<T>(repaired);
      if (retried.ok) {
        return retried.value;
      }
    }

    throw new Error(`Unable to parse LLM JSON response: ${parsed.error}`);
  }

  async chatJsonWithEvents<T>(
    config: LlmRuntimeConfig,
    messages: ChatMessage[],
    fixerPrompt: string | undefined,
    onEvent?: (event: { type: "delta" | "status"; chunk?: string; message?: string }) => Promise<void> | void,
    options?: RequestOptions,
  ): Promise<T> {
    const raw = await this.chatTextStream(config, messages, onEvent, options);
    const parsed = this.tryParse<T>(raw);
    if (parsed.ok) {
      return parsed.value;
    }

    onEvent?.({ type: "status", message: "Attempting one JSON repair pass" });

    if (fixerPrompt) {
      const repaired = await this.chatText(
        config,
        [
          { role: "system", content: "You repair invalid JSON. Return valid JSON only." },
          { role: "user", content: `${fixerPrompt}\n\nInvalid JSON:\n${raw}` },
        ],
        { temperature: 0.1 },
        options,
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

  async streamText(
    config: LlmRuntimeConfig,
    messages: ChatMessage[],
    onEvent?: (event: { type: "delta" | "status"; chunk?: string; message?: string }) => Promise<void> | void,
    options?: RequestOptions,
  ) {
    return this.chatTextStream(config, messages, onEvent, options);
  }

  private async chatTextStream(
    config: LlmRuntimeConfig,
    messages: ChatMessage[],
    onEvent?: (event: { type: "delta" | "status"; chunk?: string; message?: string }) => Promise<void> | void,
    options?: RequestOptions,
  ) {
    const attempts = Math.max(1, (config.retryCount ?? 0) + 1);
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      let idleTimeout: ReturnType<typeof setTimeout> | null = null;
      const signal = mergeAbortSignals(controller.signal, options?.signal);
      const resetIdleTimeout = () => {
        if (idleTimeout) {
          clearTimeout(idleTimeout);
        }
        idleTimeout = setTimeout(() => controller.abort(new Error(`Stream idle timeout after ${config.timeoutMs}ms`)), config.timeoutMs);
      };

      try {
        resetIdleTimeout();
        const response = await fetch(normalizeBaseUrl(config.baseUrl), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
          signal,
          body: JSON.stringify({
            model: config.model,
            messages,
            temperature: config.temperature,
            max_tokens: config.maxTokens,
            stream: true,
          }),
        });

        if (!response.ok || !response.body) {
          throw new Error(`Streaming request failed with status ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let output = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          resetIdleTimeout();
          buffer += decoder.decode(value, { stream: true });

          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const eventBlock of events) {
            const lines = eventBlock
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean);

            for (const line of lines) {
              if (!line.startsWith("data:")) continue;
              const data = line.slice(5).trim();
              if (!data || data === "[DONE]") continue;
              const payload = JSON.parse(data) as StreamChunkResponse;
              const text = extractTextContent(payload.choices?.[0]?.delta?.content);
              if (!text) continue;
              resetIdleTimeout();
              output += text;
              await onEvent?.({ type: "delta", chunk: text });
            }
          }
        }

        if (!output.trim()) {
          throw new Error("LLM returned empty streamed content");
        }

        return output;
      } catch (error) {
        lastError = error;
        if (attempt >= attempts) {
          const message = isAbortTimeoutError(error)
            ? `Stream idle timeout after ${config.timeoutMs}ms`
            : error instanceof Error
              ? error.message
              : String(error);
          throw new Error(`LLM request failed after ${attempts} attempt(s): ${message}`);
        }
        await onEvent?.({ type: "status", message: `Streaming attempt ${attempt} failed, retrying` });
        await wait(Math.min(3000, 400 * attempt));
      } finally {
        if (idleTimeout) {
          clearTimeout(idleTimeout);
        }
      }
    }

    throw new Error(lastError instanceof Error ? lastError.message : String(lastError));
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
