import { describe, expect, it } from 'vitest';
import {
  callbackRequestSchema,
  bookingPrepareSchema,
  bookingTransitionSchema,
  customerLinkSchema,
  isIdempotencyKey,
  isUlid,
  planChangeRequestSchema,
  planResolutionSchema,
  prospectCreateSchema,
  publicIntakeSchema,
  quoteIssueSchema,
  servicePlanCreateSchema,
  testInvoiceSchema,
} from '../src/validation';

const valid = {
  request_kind: 'callback',
  service_code: 'RES-DEEP',
  address: { region: 'TX', postal_code: '77002' },
  contact: { name: 'Synthetic Browser Test', phone: '(281) 555-0147', email: 'browser@example.test' },
  notes: 'Synthetic migration preview request.',
  promotion_code: null,
};

describe('callback request validation', () => {
  it('accepts the one-step public quote shape', () => {
    expect(callbackRequestSchema.safeParse(valid).success).toBe(true);
    expect(callbackRequestSchema.parse({ ...valid, address: { region: 'tx', postal_code: '77002' } }).address.region).toBe('TX');
  });

  it('rejects invalid phones, ZIP codes, and unknown fields', () => {
    expect(callbackRequestSchema.safeParse({ ...valid, contact: { ...valid.contact, phone: '123' } }).success).toBe(false);
    expect(callbackRequestSchema.safeParse({ ...valid, address: { region: 'TX', postal_code: 'ABC' } }).success).toBe(false);
    expect(callbackRequestSchema.safeParse({ ...valid, address: { region: 'XX', postal_code: '77002' } }).success).toBe(false);
    expect(callbackRequestSchema.safeParse({ ...valid, payment: { card: 'not-allowed' } }).success).toBe(false);
  });

  it('requires safe replay and receipt identifiers', () => {
    expect(isIdempotencyKey('migration-test-1234')).toBe(true);
    expect(isIdempotencyKey('short')).toBe(false);
    expect(isUlid('01JQ7AHH6K2X2P1W3S8J5DD4MZ')).toBe(true);
    expect(isUlid('not-a-receipt')).toBe(false);
  });
});

describe('public intake validation', () => {
  it('accepts a requested discount without marketing consent', () => {
    expect(publicIntakeSchema.safeParse({
      kind: 'discount', email: 'owner@example.test', marketing_email: false, permission: false,
    }).success).toBe(true);
  });

  it('requires permission and client contact for referrals', () => {
    const referral = {
      kind: 'referral', email: 'referrer@example.test', name: 'Referrer', city: 'Houston',
      postal_code: '77002', client_name: 'Client', service: 'Deep cleaning',
      marketing_email: false, permission: false,
    };
    expect(publicIntakeSchema.safeParse(referral).success).toBe(false);
    expect(publicIntakeSchema.safeParse({ ...referral, permission: true, client_phone: '(281) 555-0199' }).success).toBe(true);
  });

  it('accepts only US state codes for partner and vendor requests', () => {
    const partner = {
      kind: 'partner', name: 'Synthetic Partner', email: 'partner@example.test', phone: '(281) 555-0147',
      city: 'Houston', region: 'tx', zip_codes: '77002', team_size: 2,
      services: 'Home cleaning', own_supplies: 'yes', marketing_email: false, permission: false,
    };
    expect(publicIntakeSchema.parse(partner).region).toBe('TX');
    expect(publicIntakeSchema.safeParse({ ...partner, region: 'XX' }).success).toBe(false);
  });
});

describe('staff prospect validation', () => {
  it('requires one valid contact method', () => {
    const prospect = {
      name: 'Synthetic Commercial Prospect', segment: 'commercial', email: '', phone: '',
      city: 'Houston', region: 'TX', service_interest: 'Office cleaning', source: 'Synthetic test', notes: '',
    };
    expect(prospectCreateSchema.safeParse(prospect).success).toBe(false);
    expect(prospectCreateSchema.safeParse({ ...prospect, phone: '(281) 555-0147' }).success).toBe(true);
  });
});

describe('test invoice validation', () => {
  it('accepts only an explicit approved-quote amount mode and bounded due date', () => {
    expect(testInvoiceSchema.safeParse({ mode: 'deposit', days_until_due: 14 }).success).toBe(true);
    expect(testInvoiceSchema.safeParse({ mode: 'live', days_until_due: 14 }).success).toBe(false);
    expect(testInvoiceSchema.safeParse({ mode: 'full', days_until_due: 0 }).success).toBe(false);
    expect(testInvoiceSchema.safeParse({ mode: 'full', days_until_due: 14, amount_cents: 1 }).success).toBe(false);
  });
});

describe('quote and booking workflow validation', () => {
  it('rejects caller-controlled quote totals and malformed booking transitions', () => {
    const quote = {
      items: [{ description: 'Approved deep cleaning', quantity: 1, unit_cents: 25000 }],
      tax_cents: 0,
      deposit_cents: 5000,
      expires_at: '2026-12-01T00:00:00.000Z',
    };
    expect(quoteIssueSchema.safeParse(quote).success).toBe(true);
    expect(quoteIssueSchema.safeParse({ ...quote, total_cents: 1 }).success).toBe(false);
    expect(bookingPrepareSchema.safeParse({
      worker_id: 7,
      start_at: '2026-12-02T15:00:00.000Z',
      end_at: '2026-12-02T18:00:00.000Z',
      time_zone: 'America/Chicago',
    }).success).toBe(true);
    expect(bookingTransitionSchema.safeParse({ action: 'complete', quality_confirmed: true }).success).toBe(true);
    expect(bookingTransitionSchema.safeParse({ action: 'charge' }).success).toBe(false);
  });

  it('accepts only a single verified customer-email link field', () => {
    expect(customerLinkSchema.safeParse({ email: 'customer@example.test' }).success).toBe(true);
    expect(customerLinkSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
    expect(customerLinkSchema.safeParse({ email: 'customer@example.test', role: 'owner' }).success).toBe(false);
  });
});

describe('customer plan change validation', () => {
  it('accepts only bounded review requests and never accepts payment details', () => {
    expect(planChangeRequestSchema.safeParse({ action: 'pause' }).success).toBe(true);
    expect(planChangeRequestSchema.safeParse({ action: 'resume', reason: 'Back from travel' }).success).toBe(true);
    expect(planChangeRequestSchema.safeParse({ action: 'delete' }).success).toBe(false);
    expect(planChangeRequestSchema.safeParse({ action: 'cancel', card: 'not-allowed' }).success).toBe(false);
    expect(planChangeRequestSchema.safeParse({ action: 'cancel', reason: 'x'.repeat(1001) }).success).toBe(false);
  });

  it('requires explicit customer approval for plan creation and validates resolution dates', () => {
    expect(servicePlanCreateSchema.safeParse({ customer_approved: true, next_service_on: '2026-12-15' }).success).toBe(true);
    expect(servicePlanCreateSchema.safeParse({ customer_approved: false }).success).toBe(false);
    expect(servicePlanCreateSchema.safeParse({ customer_approved: true, next_service_on: '2026-02-30' }).success).toBe(false);
    expect(planResolutionSchema.safeParse({ decision: 'approve', next_service_on: null }).success).toBe(true);
    expect(planResolutionSchema.safeParse({ decision: 'reject' }).success).toBe(false);
  });
});
