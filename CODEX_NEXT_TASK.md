# Next task

The Railway deployment is offline. Read [STATE.md](STATE.md) and
[migration/FEATURE_PARITY.md](migration/FEATURE_PARITY.md) before making changes.

1. Use Node 24.22+ and provision isolated free Cloudflare/Neon preview resources.
   Configure exact preview origins and server-only secrets; do not attach the
   custom domain. Apply and execute the migrations—source code and dry-run builds
   are not evidence that database/provider flows run.
2. With explicit approval immediately before activation, start Railway's free
   plan long enough to make a read-only logical MySQL/private-upload export.
   Preserve the volume and backup, then reconcile imported table counts.
3. Create controlled owner/Christine provider identities, link imported database
   users, and execute customer/staff permission tests. Provider public signup
   must also be disabled.
4. Run quote/task/email/replay, staff authorization, Stripe sandbox webhook,
   desktop/mobile, image, SEO, and anonymous-access tests before any DNS change.
5. Close or explicitly retire generic campaign and private-media gaps. If the
   prepared archive is recovered, compare it for approved assets/refinements;
   do not replace missing content with invented photos or reviews.

Keep live Stripe disabled, keep Twilio removed, and do not claim the indexed
website copy is live while fresh browser checks return Railway's 404 fallback.
