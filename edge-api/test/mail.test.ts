import { describe, expect, it } from 'vitest';
import { reviewDelayHours } from '../src/config';
import { mailConfigurationError, reviewConfigurationError } from '../src/mail';
import type { Env } from '../src/types';

const configured = {
  DATABASE_URL: 'postgresql://preview.invalid/database',
  RATE_LIMIT_SALT: 'synthetic-test-salt-at-least-32-characters',
  RESEND_API_KEY: 're_test_synthetic',
  MAIL_FROM_ADDRESS: 'support@expresscleaningconsult.com',
  QUOTE_NOTIFICATION_TO: 'expressconsulting92@gmail.com',
  REVIEW_URL: 'https://reviews.example.test/express-cleaning',
} satisfies Env;

describe('mail configuration gates', () => {
  it('keeps the public sender and internal quote inbox fixed', () => {
    expect(mailConfigurationError(configured)).toBeNull();
    expect(mailConfigurationError({ ...configured, MAIL_FROM_ADDRESS: 'other@example.test' })).toContain('support@');
    expect(mailConfigurationError({ ...configured, QUOTE_NOTIFICATION_TO: 'customer@example.test' })).toContain('expressconsulting92@');
  });

  it('requires an explicit HTTPS destination before review mail can leave the queue', () => {
    expect(reviewConfigurationError(configured)).toBeNull();
    expect(reviewConfigurationError({ ...configured, REVIEW_URL: undefined })).toContain('REVIEW_URL');
    expect(reviewConfigurationError({ ...configured, REVIEW_URL: 'http://reviews.example.test' })).toContain('HTTPS');
  });

  it('bounds the review delay and falls back to 24 hours', () => {
    expect(reviewDelayHours('0')).toBe(0);
    expect(reviewDelayHours('72')).toBe(72);
    expect(reviewDelayHours('-1')).toBe(24);
    expect(reviewDelayHours('not-a-number')).toBe(24);
  });
});
