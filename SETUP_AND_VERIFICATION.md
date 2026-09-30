# Express Cleaning Consult — integration setup and verification

## Accounts and settings for the owner

Create separate **test/sandbox** credentials first. Add credentials through local untracked `.env` files and Railway variables; never commit or paste them into chat.

| Provider | Link | Configure | Application variables |
|---|---|---|---|
| Stripe | [Dashboard](https://dashboard.stripe.com/) | Test sandbox, restricted API key, optional publishable key, signed webhook for `invoice.paid`, `invoice.payment_failed`, `invoice.voided`, `invoice.marked_uncollectible`, plus the existing PaymentIntent/refund events | API: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PAYMENTS_MODE=test`, `STRIPE_LIVE_PAYMENTS_ENABLED=false`; web build: `NEXT_PUBLIC_PAYMENTS_MODE=disabled` until the test flow is intentionally exposed |
| Twilio | [Console](https://console.twilio.com/) | Voice number, API key, TwiML App; set the App voice request URL and the number's incoming voice URL below | `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_AUTH_TOKEN`, `TWILIO_TWIML_APP_SID`, `TWILIO_PHONE_NUMBER` |
| Resend | [Domains](https://resend.com/domains) · [API keys](https://resend.com/api-keys) | Verify the domain used by `MAIL_FROM_ADDRESS`; quote notices go to the private inbox and review mail needs an honest HTTPS destination | `RESEND_API_KEY`, verified `MAIL_FROM_ADDRESS`, `QUOTE_NOTIFICATION_TO=expressconsulting92@gmail.com`, `STAFF_REVIEW_URL=https://www.expresscleaningconsult.com/admin`, `REVIEW_URL`, optional `REVIEW_DELAY_HOURS` |
| Railway | [Projects](https://railway.com/dashboard) | Use the existing web and API services plus MySQL; the API container supervises Apache, the quote-notification worker, and its recovery loop | Refer to `README.md` service map and both `.env.example` files |

The current production API origin is `https://api-production-c5c6f.up.railway.app`:

| Provider setting | Callback URL |
|---|---|
| Stripe signed webhook | `https://api-production-c5c6f.up.railway.app/api/v1/webhooks/stripe` |
| Twilio TwiML App voice request | `https://api-production-c5c6f.up.railway.app/api/v1/call-center/voice` (POST) |
| Twilio phone number incoming voice | `https://api-production-c5c6f.up.railway.app/api/v1/webhooks/twilio/incoming` (POST) |
| Twilio SMS opt-out webhook, if SMS is enabled | `https://api-production-c5c6f.up.railway.app/api/v1/webhooks/twilio/message` (POST) |

The frontend obtains an authenticated token at `GET /api/v1/call-center/token`, then the Twilio SDK makes the outbound call through its configured TwiML App. It does not call the signed Twilio voice webhook directly. The callback signatures are checked server-side. Use the actual public HTTPS URL in Twilio, since signature validation includes the URL.

## Reproducible local steps

```bash
cd web
npm ci
npm run build

cd ../api
composer install
cp .env.example .env
php artisan key:generate
# Add a local MySQL 8 database and fill the DB_* fields in .env.
php artisan migrate:fresh --seed   # Local disposable database only; destructive.
php artisan test
php artisan queue:work database --queue=quote-notifications --sleep=3 --tries=3
php artisan quote-notifications:recover
```

Run the API with `php artisan serve --host=127.0.0.1 --port=8000` and web with `npm run dev` from `web/`. Set the web build's `NEXT_PUBLIC_API_URL` to the absolute Railway API v1 URL; Next derives the upstream origin for its same-origin authenticated `/api/*` and `/sanctum/*` rewrites. On the API, leave `SESSION_DOMAIN` unset, set `SESSION_SECURE_COOKIE=true`, include `www.expresscleaningconsult.com` in `SANCTUM_STATEFUL_DOMAINS`, and allow the web origin in CORS. In the Railway API image, Supervisor runs Apache, the dedicated `quote-notifications` worker, and `quote-notifications:recover` every minute. A separate scheduler is still needed only for unrelated scheduled campaign/review work. Do not run `migrate:fresh` against production; use `php artisan migrate --force` for a reviewed release.

The public quote request is `POST /api/v1/requests`. It requires an `Idempotency-Key` header but does **not** require a Sanctum CSRF cookie, and it never calls Stripe. A new request creates one `quote_review` staff task and one notification record in the same database transaction. The response and `GET /api/v1/requests/{receipt}/status` expose only the opaque receipt plus request, task, and notification statuses; customer PII remains in the protected staff workflow. Replay the same request with the same idempotency key to confirm it returns the original receipt without another task or notice.

Quote notifications are queued after the request is committed so mail-provider latency cannot block the receipt. Confirm the API service has `QUEUE_CONNECTION=database`, `RESEND_API_KEY`, a domain-verified `MAIL_FROM_ADDRESS`, `QUOTE_NOTIFICATION_TO=expressconsulting92@gmail.com`, and an HTTPS `STAFF_REVIEW_URL`. The Gmail address is the private notification inbox; the public Contact details are `support@expresscleaningconsult.com` and `(281) 972-7712`. A notification status of `sent` records Resend acceptance; confirm inbox delivery separately when possible. `failed` means configuration was missing, while `needs_reconciliation` means the provider result was ambiguous and must be checked before retrying.

To create a sandbox hosted invoice, staff first issue and the customer accepts a quote, staff prepare the booking, and an authorized user with `quotes.issue` calls `POST /api/v1/admin/bookings/{bookingPublicId}/payment-invoices` with an idempotency key, `mode` (`deposit`, `full`, or `balance`), and `days_until_due`. The amount always comes from the stored quote. The test payment is stored separately from live payments and cannot schedule the booking. Only a signature-verified Stripe webhook with matching environment, invoice ID, amount, and currency can mark the payment succeeded or failed. Do not set live payment variables until sandbox success, failure, duplicate webhook, refund, and business-policy checks are complete.

Before enabling live payments, the owner must decide when an approved invoice is sent, whether the customer pays a deposit, the full amount, or a post-service balance, the deposit percentage or minimum, the due-day rule (the API accepts 1–90 days), tax treatment, and cancellation/refund/no-show/partial-payment handling. The current code does not invent those rules.

To publish a before/after project, place only original owner-supplied or explicitly approved images under `web/public/gallery/`, then add one paired entry to `web/lib/gallery.ts` with useful captions, distinct alt text, and a source note. It appears only after `published`, customer approval, website-use rights, same-location matching, and sequence verification are all confirmed. Never label stock or AI imagery as completed customer work. Illustrative licensed photography belongs outside the company-results data and must be visibly labeled with any required credit/license.

The supplied Canva short links could not provide the original assets or reliable source, capture-date, ownership, customer-consent, and license evidence in this environment, so no Canva photo or testimonial content was published. The Ari T, Megan L, and Jonas K quotes remain unpublished because no review source or publication permission was provided. Add a review to `web/lib/reviews.ts` only after verifying its source and permission. The public Instagram grid did not expose the requested pressure-washing post; obtain the exact post URL or original paired files plus website-use confirmation before publishing it. No licensed genuine junk-removal pair was found, so that results slot remains empty.

## Current verification scope — September 30, 2026

| Gate | Result |
|---|---|
| `npm ci` | Pass in a clean verification copy with the committed lockfile. A repeat inside the source directory hit `EBUSY` because the existing `node_modules` is locked by a Windows/OneDrive process. |
| `npm run typecheck` | Pass for the current frontend in the clean verification copy. |
| `npm run build` | Pass in the clean verification copy: Next.js compile, TypeScript, and static page generation completed. Existing local build/dependency locks are workstation artifacts rather than application failures. |
| Authenticated same-origin proxy | Pass against the live API from the local production build: `/sanctum/csrf-cookie` returned host-only CSRF/session cookies through the rewrite, and a synthetic invalid login reached the credential check with HTTP 422 rather than a CSRF 419. Real staff sign-in still requires an authorized account. |
| PHP migrations and `php artisan test` | Not run in this workspace because PHP, Composer, and Docker are unavailable. The suite includes the new quote notification and Stripe invoice/webhook cases; it must run in an environment with the locked PHP dependencies. |
| Railway migration/deployment | `api/railway.json` configures `php artisan migrate --force` as a pre-deploy command. A successful Railway release and `/up` response are required to verify it against production MySQL. |
| Live quote/task/email | Requires a fresh synthetic request after deployment, a same-key replay, status/admin inspection, Resend acceptance, and inbox confirmation if available. Do not infer delivery merely from a successful HTTP response. |
| Stripe sandbox invoice | Requires a connected Stripe sandbox/test key, signed test webhook, an accepted synthetic quote, a prepared booking, and authorized staff access. Do not test with the connected live account. |
| Gallery | The responsive component and honest empty state are implemented. Visual job pairs remain intentionally absent until the owner supplies or explicitly approves original before/after photos, captions, and alt text. |

Record live-domain, mobile/desktop, synthetic quote, staff task, and notification results in the release handoff after deployment. Live card payments, actual Twilio calling, inbox-level Resend delivery, full production MySQL behavior, and Stripe sandbox invoice handling remain separate gates until the required access, approved business settings, and private credentials are available. Keep the existing Square/Jobber records authoritative until reconciliation and a tested cutover.
