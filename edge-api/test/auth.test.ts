import { afterEach, describe, expect, it, vi } from 'vitest';
import { proxyAuth, validatedSession } from '../src/auth';
import type { Env } from '../src/types';

const env = {
  DATABASE_URL: 'postgresql://preview.invalid/database',
  RATE_LIMIT_SALT: 'synthetic-test-salt-at-least-32-characters',
  NEON_AUTH_URL: 'https://auth.example.test/neondb/auth',
} satisfies Env;

afterEach(() => vi.restoreAllMocks());

describe('managed auth proxy', () => {
  it('validates the provider session instead of trusting browser profile fields', async () => {
    const provider = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      user: { id: 'auth-user-1', email: 'owner@example.test' },
      session: { id: 'session-1' },
    }), { headers: { 'Content-Type': 'application/json' } }));

    const session = await validatedSession(new Request('https://api.example.test/api/v1/session', {
      headers: { Cookie: 'better-auth.session_token=synthetic' },
    }), env);

    expect(session?.user.id).toBe('auth-user-1');
    expect(provider).toHaveBeenCalledOnce();
    const [target, init] = provider.mock.calls[0] as [string, RequestInit];
    expect(target).toBe('https://auth.example.test/neondb/auth/get-session?disableCookieCache=true');
    expect(new Headers(init.headers).get('cookie')).toBe('better-auth.session_token=synthetic');
    expect(init.redirect).toBe('manual');
  });

  it('keeps the provider cookie first-party and rewrites provider redirects', async () => {
    const providerHeaders = new Headers({
      Location: 'https://auth.example.test/neondb/auth/callback/email?ok=1',
    });
    providerHeaders.append('Set-Cookie', 'better-auth.session_token=synthetic; Domain=auth.example.test; Path=/neondb/auth; HttpOnly; Secure; SameSite=Lax');
    const provider = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, {
      status: 302,
      headers: providerHeaders,
    }));

    const response = await proxyAuth(new Request('https://api.example.test/api/v1/auth/sign-in/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://preview.example.test',
      },
      body: JSON.stringify({ email: 'owner@example.test', password: 'synthetic-password' }),
    }), env, 'sign-in/email');

    const [target, init] = provider.mock.calls[0] as [string, RequestInit];
    expect(target).toBe('https://auth.example.test/neondb/auth/sign-in/email');
    expect(new Headers(init.headers).get('origin')).toBe('https://preview.example.test');
    expect(new Headers(init.headers).get('x-forwarded-host')).toBeNull();
    expect(new Headers(init.headers).get('x-forwarded-proto')).toBeNull();
    expect(response.headers.get('location')).toBe('https://preview.example.test/api/v1/auth/callback/email?ok=1');
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).not.toMatch(/Domain=/i);
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('HttpOnly');
  });

  it('treats rejected or malformed provider sessions as unauthenticated', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(validatedSession(new Request('https://api.example.test/api/v1/session'), env)).resolves.toBeNull();

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ user: { email: 'missing-id@example.test' } }), {
      headers: { 'Content-Type': 'application/json' },
    }));
    await expect(validatedSession(new Request('https://api.example.test/api/v1/session'), env)).resolves.toBeNull();
  });
});
