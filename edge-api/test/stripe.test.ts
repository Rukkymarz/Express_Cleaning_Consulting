import { describe, expect, it } from 'vitest';
import { isStripeTestApiKey } from '../src/stripe-api';
import { parseStripeEvent, verifyStripeSignature } from '../src/stripe';

async function signature(body: string, secret: string, timestamp: number): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${body}`));
  const hex = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
  return `t=${timestamp},v1=${hex}`;
}

describe('Stripe webhook verification', () => {
  const secret = 'whsec_synthetic_test_secret';
  const timestamp = 1_800_000_000;
  const body = JSON.stringify({
    id: 'evt_synthetic_1',
    type: 'invoice.paid',
    livemode: false,
    data: { object: { id: 'in_synthetic', amount_due: 5000, currency: 'usd', metadata: { payment_id: '12' } } },
  });

  it('accepts a current valid signature and rejects tampering', async () => {
    const header = await signature(body, secret, timestamp);
    expect(await verifyStripeSignature(body, header, secret, timestamp)).toBe(true);
    expect(await verifyStripeSignature(`${body} `, header, secret, timestamp)).toBe(false);
  });

  it('rejects signatures outside the tolerance', async () => {
    const header = await signature(body, secret, timestamp);
    expect(await verifyStripeSignature(body, header, secret, timestamp + 301)).toBe(false);
  });

  it('parses only the event fields used by the database workflow', () => {
    expect(parseStripeEvent(body)?.data.object.id).toBe('in_synthetic');
    expect(parseStripeEvent('{"id":1}')).toBeNull();
  });
});

describe('Stripe test API key gate', () => {
  it('accepts only Stripe test restricted or secret keys', () => {
    expect(isStripeTestApiKey('rk_test_synthetic')).toBe(true);
    expect(isStripeTestApiKey('sk_test_synthetic')).toBe(true);
    expect(isStripeTestApiKey('rk_live_never')).toBe(false);
    expect(isStripeTestApiKey('sk_live_never')).toBe(false);
    expect(isStripeTestApiKey(undefined)).toBe(false);
  });
});
