import { describe, expect, it } from 'vitest';
import { checkOpsToken, deliveryHealthBody, type DeliveryHealthRow } from '../src/ops';

const token = 'synthetic-ops-token-'.padEnd(40, 'x');
const row: DeliveryHealthRow = {
  checked_at: '2026-11-20T14:00:00Z',
  quote_terminal: '0', quote_stuck: '0', quote_oldest_pending_minutes: 0, quote_provider_problem: '0',
  launch_terminal: '0', launch_stuck: '0', launch_provider_problem: '0', review_terminal: '0',
  newest_problem_at: null, last_quote_sent_at: null,
};

describe('operator health token', () => {
  it('fails closed when no strong token is configured', () => {
    expect(checkOpsToken(`Bearer ${token}`, undefined)).toBe('unconfigured');
    expect(checkOpsToken('Bearer short', 'short')).toBe('unconfigured');
  });
  it('rejects missing, wrong-scheme, and wrong-length tokens', () => {
    expect(checkOpsToken(undefined, token)).toBe('unauthorized');
    expect(checkOpsToken(`Basic ${token}`, token)).toBe('unauthorized');
    expect(checkOpsToken(`Bearer ${token}x`, token)).toBe('unauthorized');
    expect(checkOpsToken(`Bearer ${token.slice(1)}`, token)).toBe('unauthorized');
  });
  it('accepts the exact bearer token', () => {
    expect(checkOpsToken(`Bearer ${token}`, token)).toBe('ok');
  });
});

describe('delivery health body', () => {
  it('reports ok with no problems', () => {
    const body = deliveryHealthBody(row, null);
    expect(body.status).toBe('ok');
    expect(body.problems).toEqual([]);
    expect(body.mail_configured).toBe(true);
  });
  it('lists mail configuration first and numeric counts, with no PII fields', () => {
    const body = deliveryHealthBody({ ...row, quote_terminal: '2', launch_stuck: 1 }, 'RESEND_API_KEY is missing');
    expect(body.status).toBe('alert');
    expect(body.problems).toEqual(['mail_not_configured', 'quote_terminal', 'launch_stuck']);
    expect(body.counts.quote_terminal).toBe(2);
    expect(JSON.stringify(body)).not.toMatch(/@|recipient|payload|phone/);
  });
});
