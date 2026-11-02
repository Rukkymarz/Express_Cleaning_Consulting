# Next task

Read [STATE.md](STATE.md) first. Continue from the existing Cloudflare/Neon
preview and latest migration branch; do not recreate resources or repeat passed
checks without cause.

1. With signed-in provider access and action-time confirmation, apply migrations
   011 and 012, run 008 validation, verify synthetic-mail quarantine, and deploy
   the updated API/UI.
2. Configure Resend and an isolated Stripe sandbox through write-only Cloudflare
   secrets. Execute the quote/task/email/replay and hosted-invoice webhook matrix.
3. Enable branch-scoped Managed Auth only after the exact owner and Christine
   login emails are supplied. Assign Christine only the `lead_manager` role.
4. Send the prepared Railway no-cost export/grace request after owner review;
   preserve the volume and backup and do not purchase Hobby.
5. Change DNS only after every critical acceptance gate in
   [migration/DNS_CUTOVER.md](migration/DNS_CUTOVER.md) passes.

Keep live Stripe disabled, keep Twilio removed, and never claim delivery,
provider setup, production-data recovery, or domain launch without direct evidence.
