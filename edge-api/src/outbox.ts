import {
  claimLaunchMail,
  claimQuoteNotification,
  claimReviewRequest,
  markLaunchMailFailed,
  markLaunchMailRetry,
  markLaunchMailSent,
  markQuoteNotificationFailed,
  markQuoteNotificationRetry,
  markQuoteNotificationSent,
  markReviewRequestFailed,
  markReviewRequestRetry,
  markReviewRequestSent,
  pruneRateLimits,
} from './db';
import { reviewDelayHours } from './config';
import {
  mailConfigurationError,
  reviewConfigurationError,
  sendLaunchMail,
  sendQuoteNotification,
  sendReviewRequest,
} from './mail';
import type { Env } from './types';

async function drainQuoteNotifications(env: Env, maximum: number): Promise<void> {
  for (let processed = 0; processed < maximum; processed += 1) {
    const claimed = await claimQuoteNotification(env);
    if (!claimed) return;
    const result = await sendQuoteNotification(env, claimed.payload);
    if (result.outcome === 'sent') {
      await markQuoteNotificationSent(env, claimed.notification_id, claimed.attempt_token, result.messageId);
    } else if (result.outcome === 'retry') {
      await markQuoteNotificationRetry(env, claimed.notification_id, claimed.attempt_token, result.reason);
      console.warn('Quote notification delivery will retry.', { notificationId: claimed.notification_id, reason: result.reason });
    } else {
      await markQuoteNotificationFailed(env, claimed.notification_id, claimed.attempt_token, result.reason);
      console.error('Quote notification delivery failed permanently.', { notificationId: claimed.notification_id, reason: result.reason });
    }
  }
}

async function drainLaunchMail(env: Env, maximum: number): Promise<void> {
  for (let processed = 0; processed < maximum; processed += 1) {
    const claimed = await claimLaunchMail(env);
    if (!claimed) return;
    const result = await sendLaunchMail(env, claimed);
    if (result.outcome === 'sent') {
      await markLaunchMailSent(env, claimed.mail_id, claimed.attempt_token, result.messageId);
    } else if (result.outcome === 'retry') {
      await markLaunchMailRetry(env, claimed.mail_id, claimed.attempt_token, result.reason);
      console.warn('Customer email delivery will retry.', { mailId: claimed.mail_id, reason: result.reason });
    } else {
      await markLaunchMailFailed(env, claimed.mail_id, claimed.attempt_token, result.reason);
      console.error('Customer email delivery failed permanently.', { mailId: claimed.mail_id, reason: result.reason });
    }
  }
}

async function drainReviewRequests(env: Env, maximum: number): Promise<void> {
  for (let processed = 0; processed < maximum; processed += 1) {
    const claimed = await claimReviewRequest(env, reviewDelayHours(env.REVIEW_DELAY_HOURS));
    if (!claimed) return;
    const result = await sendReviewRequest(env, claimed);
    if (result.outcome === 'sent') {
      await markReviewRequestSent(env, claimed.review_request_id, claimed.attempt_token, result.messageId);
    } else if (result.outcome === 'retry') {
      await markReviewRequestRetry(env, claimed.review_request_id, claimed.attempt_token, result.reason);
      console.warn('Review request delivery will retry.', { reviewRequestId: claimed.review_request_id, reason: result.reason });
    } else {
      await markReviewRequestFailed(env, claimed.review_request_id, claimed.attempt_token, result.reason);
      console.error('Review request delivery failed permanently.', { reviewRequestId: claimed.review_request_id, reason: result.reason });
    }
  }
}

export async function processOutboxes(env: Env, maximumEach = 10): Promise<void> {
  const configurationError = mailConfigurationError(env);
  if (configurationError) {
    console.error('Quote and customer email outboxes remain queued because mail is not configured.', { reason: configurationError });
  } else {
    await drainQuoteNotifications(env, maximumEach);
    await drainLaunchMail(env, maximumEach);
  }
  const reviewError = reviewConfigurationError(env);
  if (reviewError) {
    console.warn('Post-service review requests remain queued because review mail is not configured.', { reason: reviewError });
  } else {
    await drainReviewRequests(env, maximumEach);
  }
}

export async function runScheduledMaintenance(env: Env): Promise<void> {
  await processOutboxes(env, 10);
  await pruneRateLimits(env);
}
