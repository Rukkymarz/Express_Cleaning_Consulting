# Express Cleaning Consult — restoration state

Updated 2026-11-01 (America/Chicago).

## Verdict

**Outage confirmed; the replacement source now builds locally; provider and
data setup are still required before a preview, and DNS cutover is not ready.**
A fresh browser check on 2026-11-01 returned Railway's `404 Not
Found` fallback for all three launch-critical URLs:

- `https://www.expresscleaningconsult.com/`
- `https://www.expresscleaningconsult.com/book`
- `https://api-production-c5c6f.up.railway.app/up`

The indexed/cached website copy is not evidence of current availability. The
custom domain remains unchanged and still points at Railway. No Railway service,
volume, backup, or production row has been deleted or overwritten.

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
- Cloudflare and Neon preview resources have not yet been provisioned in this
  workspace/session.
- Railway shows an expired trial and the web/API/MySQL services offline. Read-only
  inspection found the existing MySQL volume and a 186 MB
  `Pre-Security-Patch Backup`; recoverability is not proven until a logical export
  is made and validated.
- Railway currently offers a **Free** workspace plan with $1 monthly usage credit,
  up to 1 vCPU / 0.5 GB RAM per service, and 0.5 GB volume storage. It has not
  been activated. The database UI confirms its required connection variables are
  present but says the service must be online before data can be inspected or
  exported.

## Source completed locally

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

The edge package now has a lockfile. Strict TypeScript, 22 Vitest cases, the
Wrangler dry-run bundle, the frontend typecheck, standard Next.js production
build/14-route smoke test, tracking test, vinext compatibility check, Cloudflare
build, and local workerd route smoke test all pass. The hydrated quote preview
shows all 50 states and Washington, DC by full name while submitting a validated
two-letter code. Database execution, provider
delivery, real account sessions, and end-to-end browser mutations have **not**
passed and must not be inferred from source or bundle checks.

## Blocking gaps

1. `Express_Cleaning_Cloudflare_Preview_Source.zip` is still unavailable, so it
   cannot be compared for any unpublished refinements or assets. Per the owner's
   latest direction, the intact Git source is now the migration baseline; the
   missing archive is a provenance gap, not a reason to invent content.
2. No Railway customer rows or private uploads have been exported. Starting the
   expired MySQL service long enough to export requires explicit approval for the
   temporary Railway free-plan activation immediately before that action.
3. Cloudflare/Neon project creation, Resend sender verification, secrets, staff
   account linking, and Stripe sandbox configuration are not complete.
4. Generic campaign delivery and private media operations are not yet ported to
   the Worker. Customer/account, worker-selection, recurring-plan, invoice,
   quote, and booking code exists only as unexecuted migration source and still
   needs database, permission, and browser testing. See
   [`migration/FEATURE_PARITY.md`](migration/FEATURE_PARITY.md).
5. The generated Cloudflare deployment helper requires Node 24.22+ for its
   supported local/CI runtime. This workstation is on Node 24.18; the build and
   local workerd preview pass, but deployment should use a supported Node patch.

## Next three actions

1. Sign in to the intended free Cloudflare and Neon accounts. Immediately before
   creating persistent projects/keys or changing account state, complete the
   required confirmation and then provision an isolated preview only—never the
   live domain first.
2. Explicitly approve the temporary Railway **Free** activation. Then export
   MySQL and private uploads read-only, record source counts, import into the
   isolated Postgres branch, reset sequences, and reconcile every table and
   relationship before preview testing.
3. Configure only preview credentials and exact preview origins, link controlled
   owner/Christine identities to imported users, deploy both Workers to preview
   URLs, and execute the quote/task/email/replay, auth, portal, and Stripe-test
   verification matrix before showing any cutover option.

## Cutover rule

Do not change DNS until the Cloudflare frontend build, all critical parity gaps
are closed, production data counts reconcile, owner/Christine access is proven,
anonymous staff-data denial passes, a synthetic quote saves with one linked task
and one email, idempotent replay sends nothing twice, Stripe sandbox paid/failure
cases pass, desktop/mobile QA passes, and rollback has been tested. Keep Railway
resources intact until post-cutover acceptance.
