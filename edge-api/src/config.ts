const DEFAULT_ORIGINS = [
  'https://www.expresscleaningconsult.com',
  'https://expresscleaningconsult.com',
];

export function allowedOrigins(value?: string): Set<string> {
  const configured = value?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? [];
  return new Set([...DEFAULT_ORIGINS, ...configured]);
}

export function isHttpsUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function isEmail(value: string | undefined): value is string {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

export function paymentsMode(value?: string): 'disabled' | 'test' | 'live' {
  return value === 'test' || value === 'live' ? value : 'disabled';
}

export function enabled(value?: string): boolean {
  return value?.trim().toLowerCase() === 'true';
}

export function reviewDelayHours(value?: string): number {
  const parsed = Number(value ?? '24');
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 168 ? parsed : 24;
}
