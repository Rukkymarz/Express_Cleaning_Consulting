import { describe, expect, it } from 'vitest';
import { Webhook } from 'svix';
import { parseResendEmailEvent, verifyResendWebhook } from '../src/resend-webhook';

const secret = 'whsec_dGVzdF9yZXNlbmRfd2ViaG9va19zZWNyZXQ=';
const eventId = 'msg_synthetic_resend_event';
const payload = JSON.stringify({
  type: 'email.bounced',
  created_at: '2026-11-02T18:00:00.000Z',
  data: {
    email_id: '56761188-7520-42d8-8898-ff6fc54ce618',
    bounce: { type: 'Permanent', subType: 'Suppressed', message: 'Mailbox unavailable.' },
  },
});

function signedHeaders(body: string, timestamp = new Date()) {
  const signature = new Webhook(secret).sign(eventId, timestamp, body);
  return {
    id: eventId,
    timestamp: String(Math.floor(timestamp.getTime() / 1000)),
    signature,
  };
}

describe('Resend webhook verification', () => {
  it('accepts a current signature over the untouched body and rejects tampering', () => {
    const headers = signedHeaders(payload);
    expect(verifyResendWebhook(payload, headers, secret)).toBe(true);
    expect(verifyResendWebhook(`${payload} `, headers, secret)).toBe(false);
  });

  it('rejects missing headers and signatures outside the replay window', () => {
    expect(verifyResendWebhook(payload, { id: '', timestamp: '', signature: '' }, secret)).toBe(false);
    const old = new Date(Date.now() - 301_000);
    expect(verifyResendWebhook(payload, signedHeaders(payload, old), secret)).toBe(false);
  });
});

describe('Resend email event parsing', () => {
  it('keeps only correlation and bounded provider-status details', () => {
    expect(parseResendEmailEvent(payload)).toEqual({
      type: 'email.bounced',
      createdAt: '2026-11-02T18:00:00.000Z',
      emailId: '56761188-7520-42d8-8898-ff6fc54ce618',
      detail: 'Permanent/Suppressed: Mailbox unavailable.',
    });
  });

  it('rejects non-email events and malformed envelopes', () => {
    expect(parseResendEmailEvent('{"type":"contact.updated","created_at":"2026-11-02T18:00:00Z","data":{"email_id":"abc"}}')).toBeNull();
    expect(parseResendEmailEvent('{"type":"email.sent","data":{}}')).toBeNull();
    expect(parseResendEmailEvent('not-json')).toBeNull();
  });
});
