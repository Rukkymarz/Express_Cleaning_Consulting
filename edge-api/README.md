# Express Cleaning Consult edge API

Cloudflare Worker replacement for the launch-critical Laravel public API. It is
kept parallel to `api/` until the Neon import and preview tests pass; the Railway
source remains the rollback reference.

## Implemented routes

- `GET /up` checks Worker and database availability.
- `GET /api/v1/catalog` returns published requestable services and markets.
- `POST /api/v1/requests` validates the selected US state code and saves the
  one-step callback request transactionally,
  creates one staff review task, queues the internal and optional customer
  emails, and safely replays an `Idempotency-Key` without duplication.
- `GET /api/v1/requests/:receipt/status` reports the saved request/task/email
  workflow state.
- `/api/v1/auth/*` is a same-origin reverse proxy for branch-scoped Neon Managed
  Better Auth. Protected staff endpoints validate the live session with the auth
  service and then enforce imported database permissions; editable auth profile
  fields never grant staff access.
- `GET /api/v1/session` validates the provider session, requires a linked imported
  account, and returns the staff/customer destination derived from effective
  database permissions. The proxy blocks public signup; disable it in the
  provider configuration too.
- Lead/task and website-inquiry staff endpoints preserve the current admin
  workflow once an approved auth identity is linked to `users.auth_user_id`.
- Customer account routes provide ownership-scoped booking history/details,
  payment history, recurring plans, and retry-safe change requests. The invoice
  download is rendered in the Worker from the approved quote snapshot and only
  verified live payments reduce the balance shown in that document.
- Staff quote issuance calculates totals from validated line items, binds replay
  keys to the exact payload, and supersedes older unaccepted revisions. Customer
  acceptance is ownership-scoped. Booking preparation locks the approved worker,
  rejects overlapping active assignments, snapshots the invoice, and applies an
  audited state transition matrix.
- Staff can list approved workers, create a recurring plan only for a completed
  recurring booking with explicit customer approval, and approve/decline a
  customer plan request. These operations never create a Stripe subscription or
  authorize automatic charges.
- `POST /api/v1/admin/bookings/:bookingId/payment-invoices` creates a
  Stripe-hosted invoice only when the saved quote is accepted, the booking is
  eligible, the Worker is explicitly in `test` mode, and the credential is a
  Stripe test key. The request amount is selected from the approved quote;
  clients cannot supply an arbitrary amount. Ambiguous provider results are
  held for staff reconciliation instead of being retried blindly.
- `POST /api/v1/webhooks/stripe` verifies the raw Stripe signature and delegates
  duplicate-safe payment state changes to Postgres. Payments are disabled by
  default and quote submission never calls Stripe.
- `POST /api/v1/webhooks/resend` verifies the raw Svix signature, deduplicates
  provider retries, and records accepted, delayed, delivered, bounced, failed,
  suppressed, or complained delivery state separately from the send outbox.
- An hourly recovery cron drains quote/customer Resend outboxes, sends
  consent-gated post-service review requests only when an approved HTTPS
  destination is configured, and prunes expired hashed rate-limit buckets.
  New submissions also start an immediate best-effort drain. Durable outbox
  retries can therefore wait up to about one hour after a transient failure;
  the recovery cadence lets Neon scale down between runs on its free tier.

This is not yet the complete replacement for Laravel operations. Generic
campaign delivery, private media, provider-configured auth/account validation,
and executed database permission tests remain cutover blockers.

## Local checks

Copy `.dev.vars.example` to the untracked `.dev.vars` file and use only preview
credentials. Then run:

```text
npm ci
npm run check
npm test
npm run build
```

`npm run build` is a dry-run bundle and does not deploy.

## Cloudflare secrets

Configure these with Cloudflare's secret flow; never commit their values:

- `DATABASE_URL`: pooled Neon URL for the least-privilege `ecc_edge_runtime` role
- `RATE_LIMIT_SALT`: at least 32 random characters
- `RESEND_API_KEY`: restricted to the verified sender/domain where supported
- `RESEND_WEBHOOK_SECRET`: signing secret for the single Resend webhook endpoint
- `STRIPE_API_KEY`: a restricted `rk_test_...` key for preview testing; use a
  secret test key only if the required restricted-key permissions are not
  available
- `STRIPE_WEBHOOK_SECRET`: test endpoint secret until live payments are
  separately approved
- `REVIEW_URL`: owner-approved HTTPS destination for honest post-service
  feedback; leave unset to keep all review mail queued

Keep `STRIPE_PAYMENTS_MODE=disabled` in the committed/live defaults. Set it to
`test` only in the isolated preview environment after adding the test key and
webhook secret. `STRIPE_LIVE_PAYMENTS_ENABLED=false` remains a separate hard
gate; this migration does not issue live invoices or charges.

Set branch-specific `NEON_AUTH_URL` as a non-secret environment variable and
add the exact preview/live origins to Neon Auth's trusted origins. Owner and
Christine access must be provisioned by controlled invite/reset and explicitly
linked to the imported legacy user; ordinary signup creates no staff mapping.
Authenticated application mutations also require an `Origin` header that exactly
matches a configured website origin. This replaces the legacy Sanctum-CSRF
behavior for Worker routes and must be tested through the website's same-origin
preview rewrite.

The non-secret variables in `wrangler.jsonc` keep the public support sender,
internal quote recipient, allowed browser origins, staff review URL, and Stripe
mode explicit. A preview deployment must add its exact origin to
`CORS_ALLOWED_ORIGINS` before browser QA.

Migration `011_resend_delivery_events.sql` also quarantines the two known
preview receipts and their two optional customer confirmations without deleting
them. The rows remain available for audit and replay checks, but the outbox
claimer cannot send them when Resend is enabled. Releasing one requires a
deliberate database review followed by changing only that row from
`quarantined` back to `queued` and clearing
`prelaunch_synthetic_quarantine`; launch setup does not release them.

Migration `012_lead_manager_and_exports.sql` adds an exact non-billing
`lead_manager` role, a formula-safe audited lead CSV export, and the distinct
`payments.issue` permission. Hosted test-invoice mutations require
`payments.issue`; `leads.edit` or `quotes.issue` alone is insufficient.

## Cutover gates

Do not attach the live domain merely because this Worker bundles. Required gates
are documented in `migration/neon/README.md` and include source/target count
reconciliation, quote + replay testing, linked task visibility, email delivery,
staff authorization, Stripe test webhooks, and a tested rollback path.
