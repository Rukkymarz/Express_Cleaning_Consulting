import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStripeTestInvoice, type PreparedTestInvoice } from '../src/stripe-api';
import type { Env } from '../src/types';

const prepared: PreparedTestInvoice = {
  payment_id: 42,
  payment_status: 'creating',
  stripe_invoice_id: null,
  hosted_invoice_url: null,
  amount_cents: 2500,
  currency: 'USD',
  customer_email: 'synthetic@example.test',
  customer_name: 'Synthetic Customer',
  description: 'Approved synthetic cleaning quote',
  days_until_due: 14,
  booking_id: '01SYNTHETICBOOKING000000001',
  quote_id: '01SYNTHETICQUOTE00000000001',
  request_receipt: '01SYNTHETICREQUEST000000001',
  payment_mode: 'deposit',
};

function response(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => vi.unstubAllGlobals());

describe('Stripe hosted test invoice creation', () => {
  it('uses deterministic provider idempotency keys, approved amount, metadata, and no forced payment methods', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ id: 'cus_synthetic' }))
      .mockResolvedValueOnce(response({ id: 'in_synthetic' }))
      .mockResolvedValueOnce(response({ id: 'ii_synthetic' }))
      .mockResolvedValueOnce(response({ id: 'in_synthetic', hosted_invoice_url: 'https://invoice.stripe.test/synthetic', invoice_pdf: 'https://invoice.stripe.test/synthetic.pdf' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createStripeTestInvoice({ STRIPE_API_KEY: 'rk_test_synthetic' } as Env, prepared);
    expect(result.invoiceId).toBe('in_synthetic');
    expect(fetchMock).toHaveBeenCalledTimes(4);

    const calls = fetchMock.mock.calls as [string, RequestInit][];
    expect(calls.map((call) => new Headers(call[1].headers).get('Idempotency-Key'))).toEqual([
      'ecc-invoice-payment-42-customer',
      'ecc-invoice-payment-42-invoice',
      'ecc-invoice-payment-42-item',
      'ecc-invoice-payment-42-send',
    ]);
    for (const [, options] of calls) {
      const headers = new Headers(options.headers);
      expect(headers.get('Authorization')).toBe('Bearer rk_test_synthetic');
      expect(headers.get('Stripe-Version')).toBe('2026-09-30.endive');
      expect(String(options.body)).not.toContain('payment_method_types');
      expect(String(options.body)).not.toContain('automatic_tax');
    }
    const itemCall = calls[2];
    if (!itemCall) throw new Error('Stripe invoice-item call was not recorded.');
    const item = new URLSearchParams(String(itemCall[1].body));
    expect(item.get('amount')).toBe('2500');
    expect(item.get('currency')).toBe('usd');
    expect(item.get('metadata[payment_id]')).toBe('42');
    expect(item.get('metadata[booking_id]')).toBe(prepared.booking_id);
  });

  it('rejects live keys and invalid approved amounts before any provider call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(createStripeTestInvoice({ STRIPE_API_KEY: 'rk_live_never' } as Env, prepared)).rejects.toThrow('test mode');
    await expect(createStripeTestInvoice({ STRIPE_API_KEY: 'rk_test_synthetic' } as Env, { ...prepared, amount_cents: 0 })).rejects.toThrow('amount is invalid');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
