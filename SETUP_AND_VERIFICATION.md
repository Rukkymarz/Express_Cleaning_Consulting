# Express Cleaning Consult — preview setup and verification

Updated 2026-11-01 (America/Chicago).

This is the active Cloudflare + Neon preview procedure. The `api/` Laravel and
Railway files remain rollback/reference source. Do not change the custom domain,
provider webhooks, or Railway data while the preview gates are open.

## Safety boundary

- Use free-tier, isolated preview resources only. No purchase or live charge is
  authorized.
- Quote submission is always free and never calls Stripe.
- Keep `STRIPE_PAYMENTS_MODE=disabled` by default. Use `test` only in preview;
  keep `STRIPE_LIVE_PAYMENTS_ENABLED=false`.
- Never commit `.env`, `.dev.vars`, database URLs, auth settings, Resend keys,
  Stripe keys, webhook secrets, exports, or customer data.
- Preserve the Railway volume and `Pre-Security-Patch Backup`. A plan change and
  temporary database start need an explicit confirmation immediately before the
  action.
- The prepared `Express_Cleaning_Cloudflare_Preview_Source.zip` is unavailable.
  The owner authorized the intact Git source as the current baseline; compare the
  archive later if recovered, especially before adding any supplied imagery.

## Reproducible local checks

Use Node 24.22 or a newer supported Node 24 patch for the Cloudflare deployment
helper. The application build also passed on this workstation's Node 24.18, but
`cf` reports that patch as below its supported engine range.

```text
cd web
npm ci
npm run typecheck
npm run test:tracking
npm run build
npx vinext check
npm run build:vinext

cd ../edge-api
npm ci
npm run check
npm test
npm run build
```

`web` keeps the ordinary Next.js build and Cloudflare vinext build side by side.
`edge-api`'s build is `wrangler deploy --dry-run`; neither build command deploys.
Generated `.next`, `.cloudflare`, `.vinext`, `dist`, and `node_modules` outputs
stay untracked.

## Preview resources

| Provider | Preview action | Required guardrail |
| --- | --- | --- |
| Cloudflare | Create separate web and API Workers on `workers.dev` preview URLs. Use the generated `web/cloudflare.config.ts` and `edge-api/wrangler.jsonc`. | Do not attach `expresscleaningconsult.com` yet. Keep caching and paid image optimization off until measured and approved. |
| Neon | Create an isolated free Postgres branch and enable branch-scoped Managed Auth. Create `ecc_edge_runtime` as a generated-password LOGIN role through the secure UI. | Do not import into or modify an unrelated project. Add only exact preview/live website origins as trusted auth origins; disable unmanaged public signup at the provider. |
| Resend | Verify the business sender/domain and create a restricted server-side key. | Public sender/support is `support@expresscleaningconsult.com`; internal quote recipient is `expressconsulting92@gmail.com`. Never put the key in `NEXT_PUBLIC_*`. |
| Stripe | Use a sandbox/test account, restricted test key where possible, and a test webhook. | Never issue a live invoice. The amount must come from an accepted stored quote; status changes only from a verified webhook. |
| Railway | Retain offline services, volume, and backup as the source/rollback boundary. | Do not delete, redeploy, reset, or overwrite. Activate its free plan only after a specific confirmation for the export action. |

## Configuration

For the web preview build, set:

```text
NEXT_PUBLIC_API_URL=https://<api-preview-worker>/api/v1
NEXT_PUBLIC_SITE_URL=https://<web-preview-worker>
NEXT_PUBLIC_PAYMENTS_MODE=disabled
```

Set `NEXT_PUBLIC_PAYMENTS_MODE=test` only while an approved synthetic booking has
a Stripe-hosted test invoice. There is no browser live-Payment-Element path in
the replacement frontend.

For the API Worker, use non-secret variables for exact preview origins, sender
address, recipient, review delay, and disabled payment mode. Configure these as
Cloudflare secrets:

```text
DATABASE_URL
RATE_LIMIT_SALT
RESEND_API_KEY
STRIPE_API_KEY
STRIPE_WEBHOOK_SECRET
```

Set branch-specific `NEON_AUTH_URL`. Add the exact web preview origin to
`CORS_ALLOWED_ORIGINS`, Neon Auth trusted origins, and the staff review URL. Leave
`REVIEW_URL` unset until the owner approves a real HTTPS destination; review mail
then remains queued. The API refuses live Stripe keys in test mode and keeps live
events gated separately.

## Database migration order

1. With specific approval, temporarily start preserved Railway MySQL and make an
   encrypted logical export plus source row counts. Inventory private uploads
   separately. Do not alter source rows.
2. Apply `migration/neon/001_schema.sql` to an empty isolated branch.
3. Import **data rows only** with explicit MySQL-to-Postgres type/column mapping.
   Never substitute the source ZIP for customer records.
4. Apply `002_seed_reference.sql` through `005_staff_workflow.sql` in order.
5. Create the secure `ecc_edge_runtime` login, apply
   `006_runtime_security.sql`, then store only its pooled URL as the Worker
   `DATABASE_URL` secret.
6. Apply `007_reset_sequences.sql`, then run `008_validate.sql`.
7. Reconcile every table count, receipt, relationship, permission link, and
   recoverable upload inventory against the captured source counts.

## Identity setup

Create controlled owner and Christine identities through the provider's invite
or reset flow. Link each provider opaque user ID to the correct imported
`users.auth_user_id`. Do not derive staff access from editable profile metadata.
The frontend uses `/api/v1/auth/sign-in/email`, `/sign-out`, and `/api/v1/session`;
the latter routes staff or customer accounts only after provider verification and
database mapping. Test anonymous, unlinked, customer, limited-staff, Christine,
and owner cases. Public registration must fail at both the proxy and provider.

## Preview verification record

Record URLs, Worker versions, database branch, timestamps, and synthetic IDs for
each result:

1. Desktop and mobile homepage, service pages, Contact phone/email, gallery,
   privacy/terms, sitemap, robots, canonical links, and private-page `noindex`.
2. A new synthetic quote with required name/phone/service/state/ZIP and optional email.
   Confirm the returned receipt, one saved request, one linked review task, and
   the staff view's receipt/contact/service/location/task status.
3. Confirm one Resend provider acceptance and inbox delivery when observable.
   Replay the exact idempotency key/payload and prove no second task or notice.
   A provider `sent` state alone is not inbox-delivery evidence.
4. Exercise every public intake, useful error states, rate limits, and CORS from
   the exact preview origin.
5. Sign in/out as each role, expire a session, deny anonymous staff access, deny
   cross-customer records, and verify booking, invoice PDF, recurring-plan change,
   lead/task, inquiry, prospect, quote, worker, and booking flows.
6. In Stripe test mode only, issue one hosted invoice from a synthetic accepted
   quote/prepared booking. Test success, failure, duplicate, mismatch, replay,
   and out-of-order signed events. Prove quote submission creates no Stripe
   object and test payment never advances a live booking.
7. Verify review-email consent, suppression, retry, and reconciliation with an
   owner-approved destination, or keep the feature queued if none is approved.
8. Test rollback to the preserved source plan without changing DNS.

Generic campaign delivery and private media/upload operations remain explicit
parity gaps. Approved before/after pairs and reviews must retain documented
source, same-location/sequence verification, customer permission, and website-use
rights. Do not use stock/AI imagery as completed customer work.

## Cutover

Show the isolated preview to the owner first. Change DNS only after the entire
feature-parity matrix passes, production counts reconcile, both staff identities
work, one quote/task/email flow and idempotent replay are proven, mobile/desktop
QA passes, and rollback is tested. Preserve mail DNS records. Keep Railway
resources intact through post-cutover acceptance, and leave live Stripe disabled
until payment timing, deposit/full/balance amount, due date, tax, cancellation,
refund, no-show, and partial-payment rules receive a separate decision.
