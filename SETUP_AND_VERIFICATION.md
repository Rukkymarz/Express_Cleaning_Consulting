# Express Cleaning Consult — integration setup and verification

## Accounts and settings for the owner

Create separate **test/sandbox** credentials first. Add credentials through local untracked `.env` files and Railway variables; never commit or paste them into chat.

| Provider | Link | Configure | Application variables |
|---|---|---|---|
| Stripe | [Dashboard](https://dashboard.stripe.com/) | Test sandbox, restricted API key, publishable key, signed webhook for `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded` | API: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`; web build: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` |
| Twilio | [Console](https://console.twilio.com/) | Voice number, API key, TwiML App; set the App voice request URL and the number's incoming voice URL below | `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_AUTH_TOKEN`, `TWILIO_TWIML_APP_SID`, `TWILIO_PHONE_NUMBER` |
| Resend | [Domains](https://resend.com/domains) · [API keys](https://resend.com/api-keys) | Verify owned sending domain and choose an honest HTTPS feedback/review destination | `RESEND_API_KEY`, `MAIL_FROM_ADDRESS`, `REVIEW_URL`, optional `REVIEW_DELAY_HOURS` |
| Railway | [Projects](https://railway.com/dashboard) | Create web, API, queue worker, scheduler, MySQL services; set HTTPS public domains | Refer to `README.md` service map and both `.env.example` files |

Replace `https://api.your-domain.example` with the real API domain:

| Provider setting | Callback URL |
|---|---|
| Stripe signed webhook | `https://api.your-domain.example/api/v1/webhooks/stripe` |
| Twilio TwiML App voice request | `https://api.your-domain.example/api/v1/call-center/voice` (POST) |
| Twilio phone number incoming voice | `https://api.your-domain.example/api/v1/webhooks/twilio/incoming` (POST) |
| Twilio SMS opt-out webhook, if SMS is enabled | `https://api.your-domain.example/api/v1/webhooks/twilio/message` (POST) |

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
php artisan queue:work --sleep=3 --tries=3
```

Run the API with `php artisan serve --host=127.0.0.1 --port=8000` and web with `npm run dev` from `web/`. The browser requires compatible HTTPS/same-site cookie, CORS and Sanctum settings for non-local domains. Run the worker and scheduler as independent processes in deployment. Do not run `migrate:fresh` against production; use `php artisan migrate --force` for a reviewed release.

## Verification performed September 28, 2026

| Gate | Result |
|---|---|
| `npm install lucide-react autoprefixer` | Installed; both are wired into the UI/PostCSS. |
| `composer install` | Success; Laravel 13.33.0, Stripe PHP 21.3.2, Twilio SDK 8.12.2, Resend PHP 1.16.0, Spatie Permission 7.4.2. |
| SQLite `migrate:fresh --seed` | Six project migrations and catalog/permission seeders passed. This is a portability test; MySQL remains unverified. |
| `php artisan test` | Four feature tests passed (14 assertions). Stripe signatures and duplicate delivery tested; review send mocked and consent suppression tested. |
| Queue worker `--once --stop-when-empty` | Started successfully against local SQLite; no real provider job was sent. |
| `npm run build` | Pass: Next.js compile, TypeScript, static page generation. |
| Local HTTP smoke | API `/up` 200; web `/` 200. |

Live card payments, actual Twilio calling, actual Resend delivery, MySQL behavior, and a Railway deployment remain untested until accounts, verified domains, approved business settings, and private credentials are provided. Keep the existing Square/Jobber records authoritative until reconciliation and a tested cutover.
