# Express Cleaning Consult platform — implementation package

Read [ARCHITECTURE.md](ARCHITECTURE.md) first. This package implements the core request-first path, normalized schema, CRM/quote/dispatch/payment/voice endpoints, a four-step Next.js booking wizard, customer and staff portals, review follow-up job, and deployment configuration. It is an **engineering starter**, not a live production system. No prices, guarantee of availability, or payment credentials were invented.

## Current business behavior

- Customers submit a free quote request. Staff review scope and approve a specific price, date and worker before taking a deposit or full payment.
- The seed catalog is based on the business handoff. Every seeded market is `request_only`; every service has `instant_eligible=false`; there are no active pricing rules. Payment requires an accepted quote and a staff-prepared booking.
- The optional `/quotes/preview` logic returns an estimate only after an owner-approved rate and market are enabled. The actual checkout remains quote/assignment gated; it does not silently turn a submitted date into a confirmed booking.
- The public contact details, real served ZIPs, service policies, deposit percentage, taxes, and real-time crew capacity require owner approval before launch.
- Lead stages are derived from the latest service request, its quote, and booking. The 0–100 score is a deterministic work priority, not a predicted conversion rate. Staff may assign a permitted agent and record disposition/follow-up; stages cannot be manually forced.
- A completed recurring booking can start a service plan only after staff attest to customer approval. The plan is an operational schedule, not a Stripe subscription. Customer pause/resume/cancel requests wait for staff review and do not charge or cancel any external payment agreement.
- Booking completion queues one review email after the configured delay, only when a customer explicitly opted into review email. Set a verified HTTPS `REVIEW_URL`, `RESEND_API_KEY`, and a verified `MAIL_FROM_ADDRESS`. Uncertain send outcomes become `needs_reconciliation` and must be checked in Resend before any manual retry. Historical requests lacking consent are suppressed.

## Stack and local commands

- Web: Next.js 16 App Router, React 19, Tailwind 4, React Hook Form/Zod, Framer Motion. From `web`: `npm ci && npm run dev`.
- API: Laravel 13 on PHP 8.3, MySQL, Sanctum, Spatie Permission, Stripe PHP, Twilio PHP, Resend PHP, Dompdf. From `api`: `composer install`, copy `.env.example` to `.env`, set DB credentials, `php artisan key:generate`, `php artisan migrate --seed`, `php artisan serve --host=0.0.0.0 --port=8000`, and separately `php artisan queue:work --tries=3`.
- Approved campaigns require `php artisan schedule:work` (or a Railway cron service running `php artisan schedule:run` every minute). A delivery in `sending` after an uncertain SMS error requires manual provider reconciliation before retrying.
- Start MySQL separately. For first-party browser auth, use matching trusted web/API domains and configure `SESSION_DOMAIN`, `SANCTUM_STATEFUL_DOMAINS`, CORS and HTTPS. `GET /sanctum/csrf-cookie` precedes browser POST login.
- Test provider callbacks using Stripe CLI and Twilio's test environment; use their exact public webhook URLs and secrets.
- Staff access `/admin` for the pipeline and `/admin/calls` for the browser phone. Twilio inbound calls route to agents whose browser registered and heartbeated recently; production requires browser microphone permission, configured TwiML endpoints, and agent training. Customers access `/account` for booking history, invoice PDFs and recurring plan change requests. Older bookings created before the invoice migration have no invoice snapshot and need an explicit backfill.

## Railway service map

| Service | Root | Image/process | Variables |
|---|---|---|---|
| Public web | `web/` | `web/Dockerfile`, standalone Node server | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` at **build** time, `PORT=3000` at run time |
| Laravel API | `api/` | `api/Dockerfile`, Apache | `APP_KEY`, `APP_URL`, `DB_*` or `DATABASE_URL`, `SESSION_DOMAIN`, `SANCTUM_STATEFUL_DOMAINS`, `CORS_ALLOWED_ORIGINS`, `STRIPE_*`, `TWILIO_*`, `RESEND_API_KEY`, `REVIEW_URL`, `MAIL_FROM_ADDRESS`, `PORT=8080` |
| Queue worker | `api/` | same image, override command `php artisan queue:work --sleep=3 --tries=3 --max-time=3600` | same API secrets and DB settings; no public domain |
| Scheduler | `api/` | same image, `php artisan schedule:work` or scheduled `schedule:run` | same DB settings; no public domain |
| MySQL | Railway managed database | managed | reference internal `MYSQLHOST`, `MYSQLPORT`, `MYSQLDATABASE`, `MYSQLUSER`, `MYSQLPASSWORD` into API/worker `DB_*` |

Run `php artisan migrate --force` as an **explicit one-time release action** before accepting traffic. Do not run migrations on every process boot. Set up backups and test a restore. Add an approved private object store before scope/photo uploads.

## Incomplete release gates

The Next.js frontend passed a production build and TypeScript check. Composer installed the locked SDKs. SQLite migrations and seeders passed; four feature tests passed, covering signed/duplicate/invalid Stripe webhooks and consent-aware review delivery with a mocked mailer. A queue worker started and both the web homepage and API health endpoint returned HTTP 200. MySQL migration, Docker image build, provider callbacks, browser auth, quote approval, live voice, live email, invoice PDF rendering and payment reconciliation still require tests with real sandbox accounts. The package does not include automatic subscription billing, worker self-service, media upload/review, email unsubscribe management, or a completed operations UI for all roles. These **must be implemented and tested before calling the full platform production ready**. The earlier Square/Jobber workbook must be reconciled before this database is made authoritative. See [SETUP_AND_VERIFICATION.md](SETUP_AND_VERIFICATION.md) for account setup, callback URLs, and exact verification results.
