# Express Cleaning Consult: Railway MySQL to Neon Postgres

This directory is the database side of the free-hosting migration. It keeps
legacy numeric primary keys and public receipt IDs, while adding transaction-safe
functions for the one-step quote form, staff follow-up tasks, email outboxes,
rate limits, and verified Stripe webhook state.

Nothing in these files deletes or modifies the Railway database. Do not point
the public site at Neon until the source and target counts, relationships, staff
access, preview quote flow, and rollback plan have all been verified.

## Authoritative migration order

1. Keep the Railway volume and its `Pre-Security-Patch Backup` untouched.
2. Start Railway MySQL only long enough to make a logical export and capture
   source row counts. Store the export outside Git and encrypt it at rest.
3. Create an isolated Neon branch. Apply `001_schema.sql` to the empty branch.
4. Import **data rows only** with an explicit table/column mapping. MySQL and
   Postgres boolean, JSON, timestamp, and identity representations differ, so a
   raw schema-creating `pgloader` run is not an approved production procedure.
5. Apply, in order:
   - `002_seed_reference.sql`
   - `003_quote_workflow.sql`
   - `004_stripe_webhook.sql`
   - `005_staff_workflow.sql`
6. In Neon's secure role UI, create a generated-password LOGIN role named
   `ecc_edge_runtime`. Apply `006_runtime_security.sql`. Put that role's pooled
   connection URL only in the Cloudflare `DATABASE_URL` secret.
7. Apply `007_reset_sequences.sql`, `009_fix_idempotent_replay.sql`, and
   `010_quote_portal_workflow.sql`, then run `008_validate.sql` and compare its
   counts with the recorded MySQL counts.
8. Run preview-only quote, replay, staff authorization, email, and Stripe test
   webhook tests before any DNS change.

The application-level parity gates are tracked in
[`../FEATURE_PARITY.md`](../FEATURE_PARITY.md). A passing schema validation alone
does not authorize cutover.

The import mapping cannot be finalized until the Railway logical export is
available. Do not use the source ZIP as a substitute for customer records.

## Identity and staff access

Existing Laravel users retain their numeric IDs and password hashes for audit
and relationship preservation. The edge runtime must not expose or directly
authenticate against `users.password`. Link approved owner/staff accounts to
the replacement auth provider through `users.auth_user_id`, and use controlled
invites or password resets. Never derive authorization from editable profile
metadata or allow public registration to grant a staff role.

`006_runtime_security.sql` removes public function execution and gives the edge
runtime only the specific hardened functions it needs; even catalog reads are
filtered through security-definer functions, so the runtime has no direct table
access. Admin calls additionally require a provider-verified session and an
imported database permission mapping.

## Secrets and email

The Cloudflare Worker receives server-only secrets for the pooled Neon URL,
Resend key, rate-limit salt, and Stripe webhook secret. None belongs in a
`NEXT_PUBLIC_*` variable, source archive, commit, build log, or browser bundle.

Resend must verify the sender domain before email is enabled. The public support
address is `support@expresscleaningconsult.com`; internal new-quote notifications
go only to `expressconsulting92@gmail.com`. Provider idempotency keys and
database claim tokens prevent automatic retries from sending duplicates. A
result that remains ambiguous beyond the 23-hour safety window is held for
manual reconciliation.

## Stripe safety

Submitting a quote creates no Stripe object and takes no payment. The Worker
defaults `STRIPE_PAYMENTS_MODE` to `disabled`. Test-mode payment records may be
updated only after raw-body signature verification and the transactional,
duplicate-safe `app.process_stripe_event` function. Live events remain blocked
until a separate explicit live-payments decision and configuration change.
