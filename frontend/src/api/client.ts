import { authStore } from "@/stores/auth.store";
import {
  participantTemplateAiGenerateStreamEventSchema,
  surveyImportStreamEventSchema,
  type ParticipantTemplateAiGenerateStreamEvent,
  type SurveyImportStreamEvent,
} from "@surveysim/shared";

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = authStore.getState().token;
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body !== undefined && options.body !== null && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const serializedBody =
    options.body instanceof FormData
      ? options.body
      : options.body !== undefined && options.body !== null
        ? JSON.stringify(options.body)
        : undefined;

  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
    body: serializedBody,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new ApiError(payload?.message ?? `Request failed: ${response.status}`, response.status);
  }
  return payload as T;
}

async function streamSurveyImport(path: string, body: BodyInit, onEvent: (event: SurveyImportStreamEvent) => void) {
  const token = authStore.getState().token;
  const headers = new Headers();
  headers.set("Accept", "text/event-stream");
  if (!(body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`/api${path}`, {
    method: "POST",
    headers,
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    let payload: { message?: string } | null = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    throw new ApiError(payload?.message ?? `Request failed: ${response.status}`, response.status);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new ApiError("Streaming response is not available", response.status);
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const lines = frame
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw) continue;
        const parsed = surveyImportStreamEventSchema.parse(JSON.parse(raw));
        onEvent(parsed);
      }
    }

    if (done) {
      break;
    }
  }
}

async function streamParticipantTemplateGenerate(
  path: string,
  body: BodyInit,
  onEvent: (event: ParticipantTemplateAiGenerateStreamEvent) => void,
) {
  const token = authStore.getState().token;
  const headers = new Headers();
  headers.set("Accept", "text/event-stream");
  if (!(body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`/api${path}`, {
    method: "POST",
    headers,
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    let payload: { message?: string } | null = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    throw new ApiError(payload?.message ?? `Request failed: ${response.status}`, response.status);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new ApiError("Streaming response is not available", response.status);
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const lines = frame
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw) continue;
        const parsed = participantTemplateAiGenerateStreamEventSchema.parse(JSON.parse(raw));
        onEvent(parsed);
      }
    }

    if (done) {
      break;
    }
  }
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body as BodyInit | null | undefined }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body: body as BodyInit | null | undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, formData: FormData) => request<T>(path, { method: "POST", body: formData }),
  streamSurveyImport,
  streamParticipantTemplateGenerate,
};
