# Express Cleaning Consult platform — implementation package

> **Restoration notice (2026-11-02):** the custom domain is unresolved and the
> Railway API returns its fallback. The Railway/MySQL instructions below describe
> the preserved legacy baseline, not a currently working deployment. The active
> zero-cost migration work is tracked in [STATE.md](STATE.md) and
> [migration/FEATURE_PARITY.md](migration/FEATURE_PARITY.md). Do not deploy or
> change DNS from this legacy section.

Read [STATE.md](STATE.md) first for the active restoration. This package retains
the legacy Laravel/Railway source as rollback/reference while adding a parallel
Cloudflare Worker + Neon Postgres implementation. The intact Next.js UI is now
configured for Cloudflare through vinext without removing the normal Next.js
build. No prices, availability guarantees, credentials, reviews, or project
photography were invented.

## Current business behavior

- Customers submit a free quote request. Staff review scope and approve a specific price, date and worker before taking a deposit or full payment.
- The seed catalog is based on the business handoff. Every seeded market is `request_only`; every service has `instant_eligible=false`; there are no active pricing rules. Payment requires an accepted quote and a staff-prepared booking.
- The optional `/quotes/preview` logic is a legacy Laravel-only capability and is not ported to the Worker. It returns an estimate only after an owner-approved rate and market are enabled. The actual checkout remains quote/assignment gated; it does not silently turn a submitted date into a confirmed booking.
- The approved public contact details are `support@expresscleaningconsult.com` and `(281) 972-7712`. The private quote-notification inbox is `expressconsulting92@gmail.com`. Real served ZIPs, service policies, deposit percentage, taxes, and real-time crew capacity still require owner approval.
- Lead stages are derived from the latest service request, its quote, and booking. The 0–100 score is a deterministic work priority, not a predicted conversion rate. Staff may assign a permitted agent and record disposition/follow-up; stages cannot be manually forced.
- Every newly saved quote request atomically creates one `quote_review` staff task and one notification record. After returning the receipt, the API dispatches that notice through configured Resend credentials to `QUOTE_NOTIFICATION_TO`; request replays and provider retries use database and provider idempotency controls so the same receipt is not intentionally mailed twice. Provider-ambiguous sends stop in `needs_reconciliation` and are logged. The staff pipeline shows the receipt, contact details, service, location, task status, and notification status.
- Stripe is disabled by default. The hosted-invoice endpoint only runs when `STRIPE_PAYMENTS_MODE=test` is paired with a Stripe test/restricted-test key. It derives the amount from an accepted quote and prepared booking; only a signature-verified, duplicate-safe webhook can mark it paid or failed. Live mode additionally requires `STRIPE_LIVE_PAYMENTS_ENABLED=true` and must not be enabled until the business rules in this document are approved and sandbox tests pass.
- The before-and-after gallery renders only entries marked both `published` and `customerApproved` in `web/lib/gallery.ts`. Five owner-supplied, rights-confirmed matched project pairs are currently published; the review section remains an honest ready state until sourced customer reviews are approved.
- A completed recurring booking can start a service plan only after staff attest to customer approval. The plan is an operational schedule, not a Stripe subscription. Customer pause/resume/cancel requests wait for staff review and do not charge or cancel any external payment agreement.
- Booking completion queues one review email after the configured delay, only when a customer explicitly opted into review email. Set a verified HTTPS `REVIEW_URL`, `RESEND_API_KEY`, and a verified `MAIL_FROM_ADDRESS`. Uncertain send outcomes become `needs_reconciliation` and must be checked in Resend before any manual retry. Historical requests lacking consent are suppressed.

## Stack and local commands

- Web: Next.js 16 App Router, React 19, Tailwind 4, and Cloudflare vinext.
  From `web`, run `npm ci`, `npm run typecheck`, `npm run build`, and
  `npm run build:vinext`. `npm run deploy:vinext` is intentionally not part of
  local verification because it changes external state.
- Replacement API: Hono on Cloudflare Workers with hardened Postgres functions,
  branch-scoped Neon Managed Auth, Resend outboxes, and Stripe test-invoice
  webhooks. From `edge-api`, run `npm ci`, `npm run check`, `npm test`, and
  `npm run build`; the last command is a Wrangler dry run and does not deploy.
- Replacement database: apply the migrations through
  `010_quote_portal_workflow.sql`, then `008_validate.sql`, in the documented order to an isolated Neon branch after
  importing reconciled rows. Never run these against the preserved MySQL source.
- Authenticated browser calls stay first-party through `/api/*`; public quote
  and intake calls remain stateless. The replacement frontend does not request a
  Sanctum CSRF cookie. Staff status comes only from imported database
  permissions linked to a provider-verified opaque identity.
- The Laravel 13/MySQL/Sanctum/Twilio code under `api/` remains the historical
  Railway rollback/reference implementation. Do not treat its deployment map or
  callbacks as the active migration target.

## Preserved Railway service map (historical rollback reference)

| Service | Root | Image/process | Variables |
|---|---|---|---|
| Public web | `web/` | `web/Dockerfile`, standalone Node server with authenticated API/CSRF rewrites | absolute `NEXT_PUBLIC_API_URL=https://api-production-c5c6f.up.railway.app/api/v1`, `NEXT_PUBLIC_SITE_URL=https://www.expresscleaningconsult.com`, `NEXT_PUBLIC_PAYMENTS_MODE`, optional `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` at **build** time, `PORT=3000` at run time |
| Laravel API | `api/` | `api/Dockerfile`; Supervisor runs Apache, a database worker limited to `quote-notifications`, and the notification recovery loop | `APP_KEY`, `APP_URL`, `DB_*` or `DATABASE_URL`, `QUEUE_CONNECTION=database`, `SESSION_DOMAIN`, `SANCTUM_STATEFUL_DOMAINS`, `CORS_ALLOWED_ORIGINS`, `STRIPE_*`, `TWILIO_*`, `RESEND_API_KEY`, `MAIL_FROM_ADDRESS`, `QUOTE_NOTIFICATION_TO`, `STAFF_REVIEW_URL`, `REVIEW_URL`, `PORT=8080` |
| Scheduler | `api/` | same image, `php artisan schedule:work` or scheduled `schedule:run` | same DB settings; no public domain |
| MySQL | Railway managed database | managed | reference internal `MYSQLHOST`, `MYSQLPORT`, `MYSQLDATABASE`, `MYSQLUSER`, `MYSQLPASSWORD` into API/worker `DB_*` |

The API Railway config runs `php artisan migrate --force` as a pre-deploy command, before the new container receives traffic. It does not migrate on every process restart. Confirm the pre-deploy step succeeds, set up backups, and test a restore. Add an approved private object store before scope/photo uploads.

## Verification and remaining release gates

On November 2, 2026, locked frontend dependencies installed successfully. The
frontend typecheck, tracking test, standard Next.js production build and
14-public-route runtime smoke test passed. Cloudflare's official vinext checker
reported 100% compatibility; its production Worker build passed, and a local
workerd preview returned 200 for all 14 public routes plus the login, account,
and admin shells with the correct private-page `noindex` header. A hydrated
browser check confirmed all 50 states and Washington, DC display by full name.
The edge API passed strict TypeScript, 23 Vitest tests, and a Wrangler dry-run bundle. The PDF
renderer test confirms structural output and excludes test payments from a live
balance.

The isolated preview is deployed at
`https://express-cleaning-consult-web.rukkymarz.workers.dev` (version
`c6e9fbdc-0b1b-46ff-ac91-adfaf159e8ff`) and
`https://express-cleaning-edge-api.rukkymarz.workers.dev` (version
`d7af9938-1f03-4929-b73c-cf80b6f19dc1`). Neon migration 010 executed
successfully; API health/catalog checks pass; and receipts
`01M6DFF6BMNSE451J8X70PB37Z` and `01M6DES1W4D246DY68W6FCHWTN` each resolve with
one open task and a queued notification. These results do not prove Resend
delivery, provider-authenticated staff/customer workflows, Stripe sandbox
behavior, or a production-data migration.

The prepared `Express_Cleaning_Cloudflare_Preview_Source.zip` is still missing.
Per the owner's latest direction, the intact Git source was used and refined;
the unavailable archive is still worth comparing if recovered, especially for
owner-supplied assets. Known absent service-card references were removed rather
than filled with unverified images.

Remaining verification must record: a fresh browser-submitted synthetic quote receipt and success message; its single linked staff task; Resend provider acceptance and, if possible, inbox delivery; an idempotent replay that creates neither a second task nor a second notice; provider-authenticated account and permission checks; canonical-domain checks; and Stripe sandbox invoice success/failure/duplicate-event results. A Resend status of `sent` means the provider accepted the request, not that inbox delivery was independently observed. Do not enable live Stripe mode or issue a live invoice while these gates remain open.

The package does not include automatic subscription billing, worker self-service, media upload/review, email unsubscribe management, or a completed operations UI for all roles. Additional approved project photo pairs, verified customer reviews, payment timing/amount/refund rules, and the Square/Jobber reconciliation remain owner decisions. Five rights-confirmed before/after pairs are already published in the preview. See [SETUP_AND_VERIFICATION.md](SETUP_AND_VERIFICATION.md) for configuration and verification procedures.
