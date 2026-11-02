# Launch readiness

## Current verdict: not ready

The isolated replacement preview is deployed and healthy at
`https://express-cleaning-consult-web.rukkymarz.workers.dev` and
`https://express-cleaning-edge-api.rukkymarz.workers.dev`. Migration 010 is
applied to the isolated Neon branch, the API reports service/database health,
the edge package passes 27 unit tests, and both frontend builds pass. Mobile
browser QA confirmed the complete 50-state-plus-DC selector, approved contact
details, and a payment-free quote form. Two earlier synthetic receipts still
show one open review task and one queued notification each.

Resend webhook/lifecycle handling, reversible quarantine of the four known
synthetic outbox rows, permission-aware staff controls, stable same-mount quote
retry idempotency, and an hourly recovery cron are source complete. Migration
011 is not yet applied and its API source is not yet deployed, so mail dispatch
must remain disabled. The frontend portion is deployed as Worker version
`a5e6df95-637f-479e-ae3e-8d32bcd37378`.

This does **not** make the public site launch-ready. The `www` domain currently
does not resolve and no DNS cutover has occurred. Production Railway rows and
private uploads have not been exported. Managed Auth and owner/Christine account
links are absent; Resend delivery and inbound support-mail routing are not
verified; no Stripe sandbox is connected; and no new synthetic browser request
was submitted in this work session. Railway's UI requires a paid Hobby upgrade
to resume its paused database despite public Free-plan documentation, and the
preserved volume is scheduled for deletion on 2026-11-28. Generic campaigns and
private media also remain explicit parity gaps. Keep live payments disabled.

The authoritative status, blockers, next actions, and no-cutover rule are in
[STATE.md](STATE.md). Route-by-route readiness is in
[migration/FEATURE_PARITY.md](migration/FEATURE_PARITY.md). Keep Railway
resources intact and keep DNS unchanged until every critical gate passes.
