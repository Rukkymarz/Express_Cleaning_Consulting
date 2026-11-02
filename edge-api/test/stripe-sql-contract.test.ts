// @ts-expect-error -- Vitest executes this contract test in Node; the Worker bundle never imports it.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stripeSql = readFileSync(new URL('../../migration/neon/004_stripe_webhook.sql', import.meta.url), 'utf8');
const staffSql = readFileSync(new URL('../../migration/neon/005_staff_workflow.sql', import.meta.url), 'utf8');
const roleSql = readFileSync(new URL('../../migration/neon/012_lead_manager_and_exports.sql', import.meta.url), 'utf8');

describe('Stripe database workflow contract', () => {
  it('deduplicates provider events and checks invoice/intent amount plus currency', () => {
    expect(stripeSql).toContain('on conflict (provider, event_id) do nothing');
    expect(stripeSql).toContain("select 'duplicate'::text");
    expect(stripeSql).toContain('v_reported_amount is distinct from v_payment.amount_cents');
    expect(stripeSql).toContain('v_reported_currency is distinct from upper(v_payment.currency)');
    expect(stripeSql).toContain("select 'mismatch'::text");
  });

  it('handles success and failure events without allowing later failure to downgrade success', () => {
    expect(stripeSql).toContain("'invoice.paid','invoice.payment_failed','invoice.voided','invoice.marked_uncollectible'");
    expect(stripeSql).toContain("v_payment.status not in ('succeeded','partially_refunded','refunded')");
    expect(stripeSql).toContain("when 'invoice.payment_failed' then 'failed'");
    expect(stripeSql).toContain('if p_livemode then');
  });

  it('requires the distinct payment-issuance permission for every test-invoice mutation', () => {
    expect(staffSql.match(/require_permission\(p_auth_user_id, 'payments\.issue'\)/g)).toHaveLength(3);
    expect(staffSql).toContain('Idempotency key reused for a different payment.');
    expect(staffSql).toContain('Another test payment option is already in progress.');
  });

  it('keeps the lead-manager role outside quote, payment, dispatch, worker, and administration grants', () => {
    expect(roleSql).toContain("permission.name in ('leads.view','leads.edit','leads.export','calls.place')");
    expect(roleSql).toContain("permission.name not in ('leads.view','leads.edit','leads.export','calls.place')");
    expect(roleSql).not.toMatch(/lead_manager[^;]+payments\.issue/s);
    expect(roleSql).not.toMatch(/lead_manager[^;]+quotes\.issue/s);
    expect(roleSql).not.toMatch(/lead_manager[^;]+bookings\.dispatch/s);
  });
});
