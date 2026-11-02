export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

type JsonRequestOptions = {
  session?: boolean;
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
  const session = options.session !== false;
  // Authenticated browser requests use the website origin and its API rewrite,
  // keeping the managed auth cookie first-party. Public form submissions stay
  // stateless and call the configured API origin directly.
  const sameOriginSession = session && typeof window !== 'undefined';
  const requestBase = sameOriginSession ? '/api/v1' : API_URL;
  try {
    const response = await fetch(`${requestBase}${path}`, {
      ...init,
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', ...init.headers },
      credentials: init.credentials ?? (session ? 'include' : 'omit'),
      cache: 'no-store',
    });
    const body: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 429) throw new Error('Too many requests were sent. Please wait a minute and try again.');
      if (response.status === 401) {
        if (path.startsWith('/auth/')) throw new Error(responseMessage(body) || 'The email or password was not accepted.');
        throw new Error('Your session has expired. Please sign in again.');
      }
      if (response.status === 403) throw new Error(responseMessage(body) || 'Your account does not have permission to use this feature.');
      if (response.status >= 500) throw new Error('This service is temporarily unavailable. Please try again shortly.');
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
