import { isHttpsUrl } from './config';
import type { Env } from './types';

export interface AuthSession {
  user: { id: string; email?: string; name?: string };
  session?: Record<string, unknown>;
}

function baseUrl(env: Env): string {
  if (!isHttpsUrl(env.NEON_AUTH_URL)) throw new Error('NEON_AUTH_URL is not configured.');
  return env.NEON_AUTH_URL.replace(/\/$/, '');
}

function forwardedHeaders(request: Request): Headers {
  const headers = new Headers();
  for (const name of ['accept', 'content-type', 'cookie', 'origin', 'user-agent', 'authorization']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Neon Auth validates its own provider host. Supplying a synthetic
  // x-forwarded-host for the website or Worker causes the managed provider to
  // reject the request with INVALID_HOSTNAME, even when the browser Origin is
  // trusted. The provider URL already establishes the correct HTTPS host.
  return headers;
}

export async function validatedSession(request: Request, env: Env): Promise<AuthSession | null> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl(env)}/get-session?disableCookieCache=true`, {
      method: 'GET',
      headers: forwardedHeaders(request),
      redirect: 'manual',
    });
  } catch {
    throw new Error('Authentication provider is unavailable.');
  }
  if (response.status === 401 || response.status === 403 || response.status === 404) return null;
  if (!response.ok) throw new Error('Authentication provider is unavailable.');
  const body = await response.json().catch(() => null) as AuthSession | null;
  return body?.user && typeof body.user.id === 'string' && body.user.id ? body : null;
}

function proxyCookie(cookie: string): string {
  const hostOnly = cookie.replace(/;\s*Domain=[^;]+/gi, '');
  return /;\s*Path=/i.test(hostOnly)
    ? hostOnly.replace(/;\s*Path=[^;]+/i, '; Path=/')
    : `${hostOnly}; Path=/`;
}

export async function proxyAuth(request: Request, env: Env, path: string): Promise<Response> {
  const incoming = new URL(request.url);
  const target = `${baseUrl(env)}/${path.replace(/^\/+/, '')}${incoming.search}`;
  const response = await fetch(target, {
    method: request.method,
    headers: forwardedHeaders(request),
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
  });

  const headers = new Headers();
  response.headers.forEach((value, name) => {
    if (!['content-length', 'set-cookie', 'access-control-allow-origin'].includes(name.toLowerCase())) headers.append(name, value);
  });
  const cookieHeaders = response.headers as Headers & { getSetCookie?: () => string[] };
  const cookies = cookieHeaders.getSetCookie?.() ?? (response.headers.get('set-cookie') ? [response.headers.get('set-cookie') as string] : []);
  for (const cookie of cookies) headers.append('Set-Cookie', proxyCookie(cookie));

  const location = headers.get('location');
  const authBase = baseUrl(env);
  if (location?.startsWith(authBase)) {
    let redirectOrigin = incoming.origin;
    try {
      const candidate = request.headers.get('origin') ? new URL(request.headers.get('origin') as string) : null;
      if (candidate?.protocol === 'https:' || candidate?.protocol === 'http:') redirectOrigin = candidate.origin;
    } catch {
      // The route-level trusted-origin check rejects malformed browser origins.
    }
    headers.set('location', `${redirectOrigin}/api/v1/auth${location.slice(authBase.length)}`);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
