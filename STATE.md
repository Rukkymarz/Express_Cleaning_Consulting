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
  `c6e9fbdc-0b1b-46ff-ac91-adfaf159e8ff`.
- Neon migration `010_quote_portal_workflow.sql` executed successfully on the
  preview branch. The API health endpoint reports both service and database
  `ok`. Only `DATABASE_URL` and `RATE_LIMIT_SALT` are configured as API Worker
  secrets; Resend and Stripe credentials are intentionally absent.
- Railway shows an expired trial and the web/API/MySQL services offline. Read-only
  inspection found the existing MySQL volume and a 186 MB
  `Pre-Security-Patch Backup`; recoverability is not proven until a logical export
  is made and validated.
- Railway currently offers a **Free** workspace plan with $1 monthly usage credit,
  up to 1 vCPU / 0.5 GB RAM per service, and 0.5 GB volume storage. It has not
  been activated. The database UI confirms its required connection variables are
  present but says the service must be online before data can be inspected or
  exported.

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
- Consent-gated post-service review mail with a configurable approved HTTPS
  destination; no message can leave the queue while that destination is absent.
- Server-verified staff context plus source-complete lead/task, inquiry, and
  prospect operations with database permissions and audit writes.
- Source-complete staff quote issuance, customer-owned acceptance, worker-locked
  booking preparation/invoice snapshot, and audited booking transitions.
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

The edge package now has a lockfile. Strict TypeScript, 23 Vitest cases, the
Wrangler dry-run bundle, the frontend typecheck, standard Next.js production
build/14-route smoke test, tracking test, vinext compatibility check, Cloudflare
build, and local workerd route smoke test all pass. Migration 010 was applied to
the isolated database, and `/up` plus `/api/v1/catalog` pass on the deployed API.
The deployed mobile quote page shows all 50 states and Washington, DC by full
name while submitting a validated two-letter code, the approved public email and
clickable phone, and no payment control.

Two earlier synthetic preview receipts still resolve with one open review task
and a queued notification: `01M6DFF6BMNSE451J8X70PB37Z` and
`01M6DES1W4D246DY68W6FCHWTN`. A fresh synthetic request is prepared in the
browser but has not been submitted; it therefore is not evidence of the current
deployment's complete browser mutation. No email delivery, real account session,
or Stripe sandbox workflow has passed.

## Blocking gaps

1. `Express_Cleaning_Cloudflare_Preview_Source.zip` is still unavailable, so it
   cannot be compared for any unpublished refinements or assets. Per the owner's
   latest direction, the intact Git source is now the migration baseline; the
   missing archive is a provenance gap, not a reason to invent content.
2. No Railway customer rows or private uploads have been exported. Starting the
   expired MySQL service long enough to export requires explicit approval for the
   temporary Railway free-plan activation immediately before that action.
3. Branch-scoped Neon Managed Auth is not provisioned. Exact owner and Christine
   login addresses and their provider identities are not linked, so staff and
   customer permission flows remain unverified.
4. Generic campaign delivery and private media operations are not yet ported to
   the Worker. The quote/account/booking UI and migration source are deployed,
   but provider-authenticated permission, conflict, replay, and browser tests
   still need to run. See
   [`migration/FEATURE_PARITY.md`](migration/FEATURE_PARITY.md).
5. `RESEND_API_KEY` is absent and the existing outbox must be inventoried before
   enabling dispatch, so no old synthetic notice is sent unexpectedly. The
   inbound Cloudflare Email Routing destination is still unverified and cannot
   activate until the zone is active.
6. No Stripe sandbox is connected and no test key/webhook is configured. The
   connected Stripe account is live-only and must not be used for migration
   testing. Live payments remain disabled.

## Next three actions

1. With action-time confirmation, submit the prepared synthetic preview request
   and verify its success message, receipt, one request, one task, and one queued
   notification. Then provision branch-scoped Managed Auth and link only the
   exact owner/Christine identities after their login addresses are confirmed.
2. Configure a restricted Resend key only after the existing outbox is audited,
   then prove one delivery and no duplicate delivery on replay. Connect a Stripe
   sandbox separately and test only the approved-quote hosted-invoice workflow.
3. Explicitly approve the temporary Railway **Free** activation. Then export
   MySQL and private uploads read-only, record source counts, import into the
   isolated Postgres branch, reset sequences, and reconcile every table and
   relationship before any DNS cutover.

## Cutover rule

Do not change DNS until the Cloudflare frontend build, all critical parity gaps
are closed, production data counts reconcile, owner/Christine access is proven,
anonymous staff-data denial passes, a synthetic quote saves with one linked task
and one email, idempotent replay sends nothing twice, Stripe sandbox paid/failure
cases pass, desktop/mobile QA passes, and rollback has been tested. Keep Railway
resources intact until post-cutover acceptance.
