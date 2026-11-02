export interface Env {
  DATABASE_URL: string;
  RATE_LIMIT_SALT: string;
  NEON_AUTH_URL?: string;
  CORS_ALLOWED_ORIGINS?: string;
  RESEND_API_KEY?: string;
  RESEND_WEBHOOK_SECRET?: string;
  MAIL_FROM_ADDRESS?: string;
  QUOTE_NOTIFICATION_TO?: string;
  STAFF_REVIEW_URL?: string;
  REVIEW_URL?: string;
  REVIEW_DELAY_HOURS?: string;
  STRIPE_PAYMENTS_MODE?: string;
  STRIPE_LIVE_PAYMENTS_ENABLED?: string;
  STRIPE_API_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
}

export interface QuoteNotificationPayload {
  receipt: string;
  customer_name: string;
  email: string;
  phone: string;
  service: string;
  location: string;
  task_status: string;
  review_url: string;
}

export interface ClaimedNotification {
  notification_id: number | string;
  attempts: number;
  attempt_token: string;
  payload: QuoteNotificationPayload | string;
}

export interface ClaimedLaunchMail {
  mail_id: number | string;
  attempt_token: string;
  message_key: string;
  recipient: string;
  subject: string;
  body: string;
  attempts: number;
}

export interface ClaimedReviewRequest {
  review_request_id: number | string;
  booking_id: number | string;
  attempt_token: string;
  recipient: string;
  customer_name: string;
  attempts: number;
}

export type StripePaymentsMode = 'disabled' | 'test' | 'live';
