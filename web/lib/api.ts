export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export async function jsonRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || 'GET').toUpperCase();
  if (!['GET','HEAD','OPTIONS'].includes(method)) await fetch(`${new URL(API_URL).origin}/sanctum/csrf-cookie`, { credentials: 'include' });
  const xsrf = typeof document === 'undefined' ? '' : document.cookie.split('; ').find(c=>c.startsWith('XSRF-TOKEN='))?.split('=')[1] || '';
  const response = await fetch(`${API_URL}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(xsrf ? { 'X-XSRF-TOKEN': decodeURIComponent(xsrf) } : {}), ...init.headers }, credentials: 'include', cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || body?.message || 'Something went wrong. Please try again.');
  return body as T;
}
