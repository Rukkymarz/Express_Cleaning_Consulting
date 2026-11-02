# Express Cleaning Consult — restoration state

Updated 2026-11-02 (America/Chicago).

## Verdict

**The isolated Cloudflare + Neon preview is operational, but the public custom
domain is not restored and DNS cutover is not ready.** The legacy Railway
deployment remains offline. The old API returns Railway's fallback, while
`www.expresscleaningconsult.com` currently does not resolve:

- `https://www.expresscleaningconsult.com/`
- `https://www.expresscleaningconsult.com/book`
- `https://api-production-c5c6f.up.railway.app/up`

The working isolated previews are:

- Web: `https://express-cleaning-consult-web.rukkymarz.workers.dev`
- API: `https://express-cleaning-edge-api.rukkymarz.workers.dev`

GoDaddy remains authoritative, but the old Railway `www` record is absent. No
nameserver or live-domain cutover has occurred. No Railway service, volume,
backup, or production row has been deleted or overwritten.

## Current target

- Web and API edge: Cloudflare Workers/free tier.
- Database: isolated Neon Postgres/free tier, with legacy numeric IDs and public
  receipts preserved during import.
- Authentication: branch-scoped Neon Managed Auth, with staff permission derived
  only from the imported database mapping—not editable user metadata.
- Transactional email: Resend, using a verified sender for
  `support@expresscleaningconsult.com`; new quote notifications go internally to
  `expressconsulting92@gmail.com`.
- Stripe: disabled by default. Preview testing is test-mode only and occurs only
  after a staff-approved quote/booking. The public free-quote request never calls
  Stripe and never takes payment.

The previously created Supabase free project remains untouched and empty of
application/customer data. The active local implementation targets Neon; no
production data has been copied to either provider.

## Capital deployed and plan state

- Capital deployed for this migration: **$0**.
- No purchase, paid upgrade, live invoice, or live charge has been made.
- Cloudflare Free preview Workers and the isolated Neon Free project
  `shiny-water-59739167` are provisioned. The deployed Worker versions are API
  `d7af9938-1f03-4929-b73c-cf80b6f19dc1` and web
  `a5e6df95-637f-479e-ae3e-8d32bcd37378`.
- Neon migrations through `010_quote_portal_workflow.sql` executed successfully
  on the preview branch. Migrations `011_resend_delivery_events.sql` and
  `012_lead_manager_and_exports.sql` are source complete but have **not** been
  applied. They must run before the related Worker source is deployed or any
  Resend key/webhook is configured. The API health
  endpoint reports both service and database `ok`. Only `DATABASE_URL` and
  `RATE_LIMIT_SALT` are configured as API Worker secrets; Resend and Stripe
  credentials are intentionally absent.
- Railway shows an expired trial and the web/API/MySQL services offline. Read-only
  inspection found the existing MySQL volume and a 186 MB
  `Pre-Security-Patch Backup`; the volume is scheduled for deletion on
  **2026-11-28**. Recoverability is not proven until a logical export is made and
  validated.
- Railway's public documentation describes a Free plan, but this workspace's
  current UI requires a paid Hobby upgrade to resume its paused services. The
  database UI confirms its required connection variables are present but says
  the service must be online before data can be inspected or exported. No paid
  upgrade is authorized, so Railway recovery is blocked under the $0 budget.

## Source and preview completed

- A Postgres equivalent of the legacy schema, preserving relationships, public
  IDs, permission tables, audit history, provider events, and outboxes.
- Transactional one-step quote persistence: lead + request + consent rows + one
  linked staff task + internal notification + optional customer confirmation.
- Idempotent request replay returns the original receipt and does not create a
  duplicate lead, task, or notification.
- Database-backed rate limiting with salted hashed buckets and strict CORS.
- Durable Resend outbox claiming, retry bounds, and manual reconciliation for
  ambiguous delivery outcomes.
- Verified raw-body Resend/Svix webhook handling, replay-window validation,
  provider-event deduplication, and distinct accepted/delayed/delivered/bounced/
  failed/suppressed/complained lifecycle states are source complete in migration
  011. The migration also quarantines the two known synthetic notifications and
  confirmations without deleting them, preventing unexpected delivery when mail
  is later enabled.
- Consent-gated post-service review mail with a configurable approved HTTPS
  destination; no message can leave the queue while that destination is absent.
- Server-verified staff context plus source-complete lead/task, inquiry, and
  prospect operations with database permissions and audit writes. Staff screens
  now enforce permission-aware controls; lead tasks support create/change/clear
  follow-up times, while read-only roles retain visibility without mutation
  controls.
- Source-complete staff quote issuance, customer-owned acceptance, worker-locked
  booking preparation/invoice snapshot, and audited booking transitions.
- Source-complete `lead_manager` role for Christine with only lead/prospect/
  outreach/follow-up and audited CSV-export capabilities. Payment issuance now
  requires the separate `payments.issue` permission, held by the owner role and
  absent from `lead_manager`.
- Ownership-scoped customer booking/payment/recurring-plan APIs, approved-worker
  lookup, explicit-approval recurring-plan creation and staff resolution.
- An ownership-scoped, dependency-free invoice PDF generated from the approved
  quote snapshot; only verified live payments reduce its displayed balance.
- Raw-body Stripe webhook verification and duplicate-safe database processing.
- Staff-only Stripe-hosted **test invoice** source for an accepted quote and
  server-derived deposit/full/balance amount. Live keys are rejected, live mode
  remains off, and uncertain provider results are held for reconciliation.
- Least-privilege runtime grants, sequence resets, and migration validation SQL.
- Twilio has not been ported into the replacement runtime; no new voice/SMS
  dependency or callback is being introduced.
- The existing Next.js app now has Cloudflare's non-destructive vinext setup.
  The official compatibility checker reported 100%, both the normal Next.js
  build and the Cloudflare Worker build complete, and the generated Worker
  preview served all 14 public smoke routes plus the private route shells.
- Frontend session calls no longer request a Laravel Sanctum cookie. Login and
  logout use the managed Better Auth-compatible endpoints, protected calls use
  the same-origin `/api/v1` rewrite, and `/api/v1/session` derives the account
  destination only from the provider-verified identity plus imported database
  mapping. Public registration is blocked at the application proxy.
- Missing service-card image references were removed from active CSS rather than
  publishing invented or unverified replacement photography.
- The shared public footer exposes an Admin sign-in link, same-mount quote retry
  retains a payload-bound idempotency key, and the customer portal hides payment
  links unless test mode is explicitly enabled.

The edge package now has a lockfile. Strict TypeScript, 36 Vitest cases, the
Wrangler dry-run bundle, the frontend typecheck, standard Next.js production
build/14-route smoke test, tracking test, vinext compatibility check, Cloudflare
build, and local workerd route smoke test all pass. The recovery cron is hourly,
not every minute, so an idle Neon Free database can scale to zero. Migration 010
was applied to the isolated database, and `/up` plus `/api/v1/catalog` pass on
the deployed API. The previously completed frontend improvements are deployed;
migrations 011/012 and their API/UI source are tested locally but remain
unapplied and undeployed.
The deployed mobile quote page shows all 50 states and Washington, DC by full
name while submitting a validated two-letter code, the approved public email and
clickable phone, and no payment control.

Two earlier synthetic preview receipts still resolve with one open review task
and a queued notification: `01M6DFF6BMNSE451J8X70PB37Z` and
`01M6DES1W4D246DY68W6FCHWTN`. No new synthetic request was submitted in this
work session. No email delivery, real account session, or Stripe sandbox
workflow has passed.

## Blocking gaps

1. `Express_Cleaning_Cloudflare_Preview_Source.zip` is still unavailable, so it
   cannot be compared for any unpublished refinements or assets. Per the owner's
   latest direction, the intact Git source is now the migration baseline; the
   missing archive is a provenance gap, not a reason to invent content.
2. No Railway customer rows or private uploads have been exported. This
   workspace currently requires a paid Hobby upgrade to start the expired MySQL
   service, so export is blocked by the owner's free-only requirement. Preserve
   the 186 MB backup and volume before their 2026-11-28 deletion date; do not
   restore, start, delete, or upgrade without a separately authorized path.
3. Branch-scoped Neon Managed Auth is not provisioned. Exact owner and Christine
   login addresses and their provider identities are not linked, so staff and
   customer permission flows remain unverified.
4. Generic campaign delivery and private media operations are not yet ported to
   the Worker. The quote/account/booking UI and migration source are deployed,
   but provider-authenticated permission, conflict, replay, and browser tests
   still need to run. See
   [`migration/FEATURE_PARITY.md`](migration/FEATURE_PARITY.md).
5. `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` are absent. The existing outbox
   inventory contains exactly two queued internal notifications and two queued
   customer confirmations, all for the known synthetic receipts and all with
   zero attempts/provider IDs. Migration 011 will quarantine them reversibly;
   it must be applied and validated before enabling dispatch. The inbound
   Cloudflare Email Routing destination is still unverified and cannot activate
   until the zone is active.
6. No Stripe sandbox is connected and no test key/webhook is configured. The
   connected Stripe account is live-only and must not be used for migration
   testing. Source-level hosted-invoice, signature, replay, mismatch,
   out-of-order, environment, idempotency, and permission checks pass, but that
   is not provider sandbox evidence. Live payments remain disabled.
7. Signed-in Neon, Resend, Cloudflare, and Stripe dashboard access is not
   available in the controlled browser session. Provider login is required to
   apply migrations, create write-only credentials, enable Managed Auth, and
   execute the sandbox/browser acceptance tests.

## Next three actions

1. Apply `011_resend_delivery_events.sql` and
   `012_lead_manager_and_exports.sql`, run `008_validate.sql`, and verify the
   four known synthetic outbox rows are quarantined before deploying the updated
   API. Then configure a restricted Resend key and one verified webhook, prove
   one new synthetic delivery, and prove an idempotent replay sends nothing twice.
2. Provision branch-scoped Managed Auth and link only the exact owner/Christine
   identities after their login addresses and roles are confirmed. Then run the
   permission and browser matrix before considering DNS.
3. Recover Railway production data only if Railway supplies a no-cost read/export
   path or the owner separately changes the $0 constraint. Export read-only,
   record source counts, import rows into the isolated branch, reset sequences,
   and reconcile every table and relationship before any DNS cutover.

The no-cost Railway export/grace message is prepared in
[`migration/RAILWAY_SUPPORT_REQUEST.md`](migration/RAILWAY_SUPPORT_REQUEST.md).
Stripe sandbox and future live-mode boundaries are recorded in
[`migration/STRIPE_LIVE_READINESS.md`](migration/STRIPE_LIVE_READINESS.md).

## Cutover rule

Do not change DNS until the Cloudflare frontend build, all critical parity gaps
are closed, production data counts reconcile, owner/Christine access is proven,
anonymous staff-data denial passes, a synthetic quote saves with one linked task
and one email, idempotent replay sends nothing twice, Stripe sandbox paid/failure
cases pass, desktop/mobile QA passes, and rollback has been tested. Keep Railway
resources intact until post-cutover acceptance.
