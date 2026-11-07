export function readApiFailure(status: number, data: unknown): { message: string; code?: string; details?: { fieldErrors?: Record<string, string[]> } } {
  if (data && typeof data === "object") {
    const body = data as { error?: unknown; message?: unknown };
    if (body.error && typeof body.error === "object") {
      const error = body.error as { message?: unknown; code?: unknown; details?: { fieldErrors?: Record<string, string[]> } };
      if (typeof error.message === "string" && error.message.trim()) {
        return { message: error.message, code: typeof error.code === "string" ? error.code : undefined, details: error.details };
      }
    }
    if (typeof body.message === "string" && body.message.trim()) {
      return { message: body.message, code: typeof body.error === "string" ? body.error : undefined };
    }
  }
  return { message: `The request failed (${status}).` };
}

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: { fieldErrors?: Record<string, string[]> };

  constructor(status: number, message: string, code?: string, details?: { fieldErrors?: Record<string, string[]> }) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, { ...options, headers, credentials: "include" });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const failure = readApiFailure(response.status, data);
    throw new ApiError(response.status, failure.message, failure.code, failure.details);
  }
  return data as T;
}
