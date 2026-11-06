export class ApiError extends Error {
  status: number;
  fields?: Record<string, string>;

  constructor(status: number, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields;
  }
}

type ErrorBody = {
  message?: string | string[];
  fields?: Record<string, string>;
};

function messageFrom(body: ErrorBody, fallback: string) {
  if (Array.isArray(body.message)) return body.message.join(' ');
  if (typeof body.message === 'string' && body.message.trim()) return body.message;
  return fallback;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    credentials: 'same-origin',
    cache: 'no-store',
  });

  const text = await response.text();
  const body = text ? (JSON.parse(text) as ErrorBody & T) : ({} as ErrorBody & T);

  if (!response.ok) {
    throw new ApiError(response.status, messageFrom(body, 'Request failed.'), body.fields);
  }

  return body as T;
}
