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
    throw new ApiError(response.status, data.error?.message || "Request failed.", data.error?.code, data.error?.details);
  }
  return data as T;
}
