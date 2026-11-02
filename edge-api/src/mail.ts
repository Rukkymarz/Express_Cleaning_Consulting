import { isEmail, isHttpsUrl } from './config';
import type { ClaimedLaunchMail, ClaimedReviewRequest, Env, QuoteNotificationPayload } from './types';

const SUPPORT_SENDER = 'support@expresscleaningconsult.com';
const QUOTE_NOTIFICATION_RECIPIENT = 'expressconsulting92@gmail.com';

export type DeliveryResult =
  | { outcome: 'sent'; messageId: string }
  | { outcome: 'retry'; reason: string }
  | { outcome: 'failed'; reason: string };

function quotePayload(value: unknown): QuoteNotificationPayload | null {
  let candidate = value;
  if (typeof candidate === 'string') {
    try { candidate = JSON.parse(candidate); } catch { return null; }
  }
  if (!candidate || typeof candidate !== 'object') return null;
  const record = candidate as Record<string, unknown>;
  const required = ['receipt', 'customer_name', 'email', 'phone', 'service', 'location', 'task_status', 'review_url'] as const;
  if (!required.every((key) => typeof record[key] === 'string' && (record[key] as string).trim() !== '')) return null;
  if (!isHttpsUrl(record.review_url as string)) return null;
  return record as unknown as QuoteNotificationPayload;
}

export function mailConfigurationError(env: Env): string | null {
  if (!env.RESEND_API_KEY) return 'RESEND_API_KEY is not configured';
  if (env.MAIL_FROM_ADDRESS?.trim().toLowerCase() !== SUPPORT_SENDER) {
    return `MAIL_FROM_ADDRESS must be ${SUPPORT_SENDER}`;
  }
  if (env.QUOTE_NOTIFICATION_TO?.trim().toLowerCase() !== QUOTE_NOTIFICATION_RECIPIENT) {
    return `QUOTE_NOTIFICATION_TO must be ${QUOTE_NOTIFICATION_RECIPIENT}`;
  }
  return null;
}

export function reviewConfigurationError(env: Env): string | null {
  if (!env.RESEND_API_KEY) return 'RESEND_API_KEY is not configured';
  if (env.MAIL_FROM_ADDRESS?.trim().toLowerCase() !== SUPPORT_SENDER) {
    return `MAIL_FROM_ADDRESS must be ${SUPPORT_SENDER}`;
  }
  if (!isHttpsUrl(env.REVIEW_URL)) return 'REVIEW_URL must be an approved HTTPS review destination';
  return null;
}

async function send(
  env: Env,
  message: { to: string; subject: string; text: string; idempotencyKey: string },
): Promise<DeliveryResult> {
  if (!env.RESEND_API_KEY || env.MAIL_FROM_ADDRESS?.trim().toLowerCase() !== SUPPORT_SENDER) {
    return { outcome: 'failed', reason: 'notification_provider_or_verified_sender_not_configured' };
  }
  if (!isEmail(message.to)) return { outcome: 'failed', reason: 'invalid_recipient' };

  let response: Response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': message.idempotencyKey,
      },
      body: JSON.stringify({
        from: `Express Cleaning Consult <${env.MAIL_FROM_ADDRESS}>`,
        to: [message.to],
        reply_to: 'support@expresscleaningconsult.com',
        subject: message.subject,
        text: message.text,
      }),
    });
  } catch {
    return { outcome: 'retry', reason: 'provider_network_result_unknown' };
  }

  if (response.ok) {
    const body = await response.json().catch(() => null) as { id?: unknown } | null;
    if (typeof body?.id === 'string' && body.id) return { outcome: 'sent', messageId: body.id };
    return { outcome: 'retry', reason: 'provider_success_missing_message_id' };
  }

  if (response.status === 408 || response.status === 409 || response.status === 425 || response.status === 429 || response.status >= 500) {
    return { outcome: 'retry', reason: `provider_retryable_http_${response.status}` };
  }
  return { outcome: 'failed', reason: `provider_rejected_http_${response.status}` };
}

export async function sendQuoteNotification(env: Env, payloadValue: unknown): Promise<DeliveryResult> {
  const payload = quotePayload(payloadValue);
  if (!payload || env.QUOTE_NOTIFICATION_TO?.trim().toLowerCase() !== QUOTE_NOTIFICATION_RECIPIENT) {
    return { outcome: 'failed', reason: 'invalid_notification_payload_or_recipient' };
  }
  const text = [
    'A new free-quote request is ready for review.',
    '',
    `Receipt: ${payload.receipt}`,
    `Customer: ${payload.customer_name}`,
    `Email: ${payload.email}`,
    `Phone: ${payload.phone}`,
    `Service: ${payload.service}`,
    `Location: ${payload.location}`,
    `Task status: ${payload.task_status}`,
    '',
    `Review the request in the staff workflow: ${payload.review_url}`,
    `Search for receipt ${payload.receipt} if the request is not already filtered.`,
  ].join('\n');
  return send(env, {
    to: QUOTE_NOTIFICATION_RECIPIENT,
    subject: `New quote request ${payload.receipt}`,
    text,
    idempotencyKey: `quote-request-${payload.receipt}`,
  });
}

export async function sendLaunchMail(env: Env, mail: ClaimedLaunchMail): Promise<DeliveryResult> {
  return send(env, {
    to: mail.recipient,
    subject: mail.subject,
    text: mail.body,
    idempotencyKey: mail.message_key,
  });
}

export async function sendReviewRequest(env: Env, review: ClaimedReviewRequest): Promise<DeliveryResult> {
  if (reviewConfigurationError(env) || !isEmail(review.recipient) || !env.REVIEW_URL) {
    return { outcome: 'failed', reason: 'invalid_review_configuration_or_recipient' };
  }
  const name = review.customer_name.trim() || 'there';
  return send(env, {
    to: review.recipient,
    subject: 'How did your cleaning go?',
    text: [
      `Hello ${name},`,
      '',
      'Thank you for choosing Express Cleaning Consult. We would appreciate your honest feedback about your recent service.',
      `Share your feedback here: ${env.REVIEW_URL}`,
      '',
      'Thank you,',
      'Express Cleaning Consult',
    ].join('\n'),
    idempotencyKey: `review-booking-${review.booking_id}`,
  });
}
