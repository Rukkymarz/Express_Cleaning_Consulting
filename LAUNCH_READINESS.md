# Launch readiness

## Current verdict: not ready

The isolated replacement preview is deployed and healthy at
`https://express-cleaning-consult-web.rukkymarz.workers.dev` and
`https://express-cleaning-edge-api.rukkymarz.workers.dev`. Migration 010 is
applied to the isolated Neon branch, the API reports service/database health,
the edge package passes 23 unit tests, and both frontend builds pass. Mobile
browser QA confirmed the complete 50-state-plus-DC selector, approved contact
details, and a payment-free quote form. Two earlier synthetic receipts still
show one open review task and one queued notification each.

This does **not** make the public site launch-ready. The `www` domain currently
does not resolve and no DNS cutover has occurred. Production Railway rows and
private uploads have not been exported. Managed Auth and owner/Christine account
links are absent; Resend delivery and inbound support-mail routing are not
verified; no Stripe sandbox is connected; and the freshly prepared synthetic
browser submission has not yet been sent. Generic campaigns and private media
also remain explicit parity gaps. Keep live payments disabled.

The authoritative status, blockers, next actions, and no-cutover rule are in
[STATE.md](STATE.md). Route-by-route readiness is in
[migration/FEATURE_PARITY.md](migration/FEATURE_PARITY.md). Keep Railway
resources intact and keep DNS unchanged until every critical gate passes.
