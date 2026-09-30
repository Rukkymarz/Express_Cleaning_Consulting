export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

type JsonRequestOptions = {
  csrf?: boolean;
  networkErrorMessage?: string;
};

function responseMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const record = body as { error?: { message?: unknown }; errors?: Record<string, unknown>; message?: unknown };
  if (typeof record.error?.message === 'string') return record.error.message;
  if (record.errors) {
    for (const messages of Object.values(record.errors)) {
      if (Array.isArray(messages) && typeof messages[0] === 'string') return messages[0];
      if (typeof messages === 'string') return messages;
    }
  }
  return typeof record.message === 'string' ? record.message : undefined;
}

export async function jsonRequest<T>(path: string, init: RequestInit = {}, options: JsonRequestOptions = {}): Promise<T> {
  const method = (init.method || 'GET').toUpperCase();
  const csrf = options.csrf !== false;
  try {
    if (csrf && !['GET','HEAD','OPTIONS'].includes(method)) {
      const csrfResponse = await fetch(`${new URL(API_URL).origin}/sanctum/csrf-cookie`, { credentials: 'include', cache: 'no-store' });
      if (!csrfResponse.ok) throw new Error('We could not start a secure session. Please refresh and try again.');
    }
    const xsrf = csrf && typeof document !== 'undefined' ? document.cookie.split('; ').find(c=>c.startsWith('XSRF-TOKEN='))?.split('=')[1] || '' : '';
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(xsrf ? { 'X-XSRF-TOKEN': decodeURIComponent(xsrf) } : {}), ...init.headers },
      credentials: init.credentials ?? (csrf ? 'include' : 'omit'),
      cache: 'no-store',
    });
    const body: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 429) throw new Error('Too many requests were sent. Please wait a minute and try again.');
      if (response.status >= 500) throw new Error('The quote service is temporarily unavailable. Please try again shortly.');
      throw new Error(responseMessage(body) || 'Something went wrong. Please review your information and try again.');
    }
    return body as T;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(options.networkErrorMessage || 'We could not reach the service. Check your connection and try again.');
    }
    throw error;
  }
}
