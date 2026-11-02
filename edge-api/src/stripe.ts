export interface StripeEventEnvelope {
  id: string;
  type: string;
  livemode: boolean;
  data: { object: Record<string, unknown> };
}

function parseHeader(header: string): { timestamp: number; signatures: string[] } | null {
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const [key, value] = part.trim().split('=', 2);
    if (key === 't' && value && /^\d+$/.test(value)) timestamp = Number(value);
    if (key === 'v1' && value && /^[a-f0-9]{64}$/i.test(value)) signatures.push(value.toLowerCase());
  }
  return timestamp && Number.isSafeInteger(timestamp) && signatures.length ? { timestamp, signatures } : null;
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): Promise<boolean> {
  const parsed = parseHeader(signatureHeader);
  if (!parsed || !secret || Math.abs(nowSeconds - parsed.timestamp) > toleranceSeconds) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(`${parsed.timestamp}.${rawBody}`));
  const expected = toHex(digest);
  return parsed.signatures.some((signature) => constantTimeEqual(signature, expected));
}

export function parseStripeEvent(rawBody: string): StripeEventEnvelope | null {
  let value: unknown;
  try { value = JSON.parse(rawBody); } catch { return null; }
  if (!value || typeof value !== 'object') return null;
  const event = value as Record<string, unknown>;
  if (typeof event.id !== 'string' || event.id.length < 3 || event.id.length > 255) return null;
  if (typeof event.type !== 'string' || event.type.length < 3 || event.type.length > 255) return null;
  if (typeof event.livemode !== 'boolean') return null;
  if (!event.data || typeof event.data !== 'object') return null;
  const object = (event.data as Record<string, unknown>).object;
  if (!object || typeof object !== 'object' || Array.isArray(object)) return null;
  return { id: event.id, type: event.type, livemode: event.livemode, data: { object: object as Record<string, unknown> } };
}
