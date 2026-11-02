import { Webhook } from 'svix';

export interface ResendWebhookHeaders {
  id: string;
  timestamp: string;
  signature: string;
}

export interface ResendEmailEvent {
  type: string;
  createdAt: string;
  emailId: string;
  detail: string | null;
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function boundedString(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maximum) : null;
}

function providerDetail(type: string, data: Record<string, unknown>): string | null {
  if (type === 'email.bounced') {
    const bounce = object(data.bounce);
    if (!bounce) return null;
    const classification = [boundedString(bounce.type, 80), boundedString(bounce.subType, 80)]
      .filter((value): value is string => Boolean(value))
      .join('/');
    const message = boundedString(bounce.message, 400);
    return boundedString([classification, message].filter(Boolean).join(': '), 500);
  }
  if (type === 'email.failed') {
    return boundedString(object(data.failed)?.reason, 500);
  }
  if (type === 'email.suppressed') {
    const suppressed = object(data.suppressed);
    if (!suppressed) return null;
    const classification = boundedString(suppressed.type, 80);
    const message = boundedString(suppressed.message, 400);
    return boundedString([classification, message].filter(Boolean).join(': '), 500);
  }
  return null;
}

export function verifyResendWebhook(
  payload: string,
  headers: ResendWebhookHeaders,
  secret: string,
): boolean {
  try {
    new Webhook(secret).verify(payload, {
      'svix-id': headers.id,
      'svix-timestamp': headers.timestamp,
      'svix-signature': headers.signature,
    });
    return true;
  } catch {
    return false;
  }
}

export function parseResendEmailEvent(payload: string): ResendEmailEvent | null {
  let candidate: unknown;
  try { candidate = JSON.parse(payload); } catch { return null; }
  const envelope = object(candidate);
  const data = object(envelope?.data);
  const type = boundedString(envelope?.type, 80);
  const createdAt = boundedString(envelope?.created_at, 64);
  const emailId = boundedString(data?.email_id, 255);
  if (!type || !/^email\.[a-z_]+$/.test(type) || !createdAt || !emailId || emailId.length < 3) return null;
  if (Number.isNaN(Date.parse(createdAt))) return null;
  return { type, createdAt: new Date(createdAt).toISOString(), emailId, detail: providerDetail(type, data ?? {}) };
}
