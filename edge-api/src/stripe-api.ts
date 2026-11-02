import type { Env } from './types';

export interface PreparedTestInvoice {
  payment_id: number | string;
  payment_status: string;
  stripe_invoice_id: string | null;
  hosted_invoice_url: string | null;
  amount_cents: number | string;
  currency: string;
  customer_email: string;
  customer_name: string;
  description: string;
  days_until_due: number;
  booking_id: string;
  quote_id: string;
  request_receipt: string;
  payment_mode: string;
}

export interface CreatedTestInvoice {
  customerId: string;
  invoiceId: string;
  hostedInvoiceUrl: string;
  invoicePdfUrl: string | null;
}

export function isStripeTestApiKey(value: string | undefined): value is string {
  return Boolean(value && (value.startsWith('rk_test_') || value.startsWith('sk_test_')));
}

function testApiKey(env: Env): string {
  const key = env.STRIPE_API_KEY ?? '';
  if (!isStripeTestApiKey(key)) {
    throw new Error('Stripe test mode requires a test restricted or secret key.');
  }
  return key;
}

async function stripeRequest<T>(
  env: Env,
  path: string,
  idempotencyKey: string,
  values: Record<string, string | number | boolean>,
): Promise<T> {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) body.set(key, String(value));
  const response = await fetch(`https://api.stripe.com/v1/${path.replace(/^\/+/, '')}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${testApiKey(env)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': idempotencyKey,
      'Stripe-Version': '2026-09-30.endive',
    },
    body,
  });
  if (!response.ok) throw new Error(`Stripe test API rejected the request with HTTP ${response.status}.`);
  return await response.json() as T;
}

function metadata(invoice: PreparedTestInvoice): Record<string, string> {
  return {
    payment_id: String(invoice.payment_id),
    booking_id: invoice.booking_id,
    quote_id: invoice.quote_id,
    request_receipt: invoice.request_receipt,
    payment_mode: invoice.payment_mode,
  };
}

function withMetadata(values: Record<string, string | number | boolean>, valuesMetadata: Record<string, string>): Record<string, string | number | boolean> {
  const result = { ...values };
  for (const [key, value] of Object.entries(valuesMetadata)) result[`metadata[${key}]`] = value;
  return result;
}

export async function createStripeTestInvoice(env: Env, invoice: PreparedTestInvoice): Promise<CreatedTestInvoice> {
  const keyRoot = `ecc-invoice-payment-${invoice.payment_id}`;
  const valuesMetadata = metadata(invoice);
  const amountCents = Number(invoice.amount_cents);
  if (!Number.isSafeInteger(amountCents) || amountCents < 50 || amountCents > 99_999_999) {
    throw new Error('The approved Stripe test-invoice amount is invalid.');
  }
  const customer = await stripeRequest<{ id?: unknown }>(env, 'customers', `${keyRoot}-customer`, withMetadata({
    email: invoice.customer_email,
    name: invoice.customer_name,
    description: 'Express Cleaning Consult approved quote customer',
  }, valuesMetadata));
  if (typeof customer.id !== 'string' || !customer.id.startsWith('cus_')) throw new Error('Stripe customer result was invalid.');

  const draft = await stripeRequest<{ id?: unknown }>(env, 'invoices', `${keyRoot}-invoice`, withMetadata({
    customer: customer.id,
    collection_method: 'send_invoice',
    days_until_due: invoice.days_until_due,
    auto_advance: false,
    description: invoice.description,
  }, valuesMetadata));
  if (typeof draft.id !== 'string' || !draft.id.startsWith('in_')) throw new Error('Stripe invoice result was invalid.');

  await stripeRequest<Record<string, unknown>>(env, 'invoiceitems', `${keyRoot}-item`, withMetadata({
    customer: customer.id,
    invoice: draft.id,
    amount: amountCents,
    currency: invoice.currency.toLowerCase(),
    description: invoice.description,
  }, valuesMetadata));

  const sent = await stripeRequest<{
    id?: unknown;
    hosted_invoice_url?: unknown;
    invoice_pdf?: unknown;
  }>(env, `invoices/${encodeURIComponent(draft.id)}/send`, `${keyRoot}-send`, {});
  if (typeof sent.id !== 'string' || sent.id !== draft.id || typeof sent.hosted_invoice_url !== 'string'
      || !sent.hosted_invoice_url.startsWith('https://')) {
    throw new Error('Stripe sent-invoice result was invalid.');
  }
  return {
    customerId: customer.id,
    invoiceId: sent.id,
    hostedInvoiceUrl: sent.hosted_invoice_url,
    invoicePdfUrl: typeof sent.invoice_pdf === 'string' && sent.invoice_pdf.startsWith('https://') ? sent.invoice_pdf : null,
  };
}
