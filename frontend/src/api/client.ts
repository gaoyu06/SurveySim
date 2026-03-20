import { authStore } from "@/stores/auth.store";

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

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body as BodyInit | null | undefined }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body: body as BodyInit | null | undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, formData: FormData) => request<T>(path, { method: "POST", body: formData }),
};
