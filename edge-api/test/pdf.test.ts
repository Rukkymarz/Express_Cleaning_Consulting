import { describe, expect, it } from 'vitest';
import { buildInvoicePdf } from '../src/pdf';

const invoice = {
  invoice_number: 'ECC-01JQ7AHH6K2X2P1W3S8J5DD4MZ', currency: 'USD',
  subtotal_cents: '25000', tax_cents: '2063', total_cents: '27063',
  paid_cents: '5000', balance_due_cents: '22063', issued_at: '2026-11-01T12:00:00Z',
  due_at: '2026-11-10T12:00:00Z', service_at: '2026-11-10T16:00:00Z',
  time_zone: 'America/Chicago', customer_name: 'Jane (Synthetic)', customer_email: 'jane@example.test',
  street: '100 Test Way', unit: null, city: 'Houston', region: 'TX', postal_code: '77002',
};

describe('invoice PDF', () => {
  it('builds a valid uncompressed PDF without counting test payments', () => {
    const bytes = buildInvoicePdf(invoice, [{
      description: 'Approved deep cleaning', quantity: 1, unit_cents: '25000', total_cents: '25000',
    }]);
    const text = new TextDecoder().decode(bytes);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('xref');
    expect(text).toContain('Verified live payments: $50.00');
    expect(text).toContain('Test-mode Stripe activity is never counted as a live payment.');
    expect(text).toContain('Jane \\(Synthetic\\)');
    expect(text.endsWith('%%EOF\n')).toBe(true);
  });
});
