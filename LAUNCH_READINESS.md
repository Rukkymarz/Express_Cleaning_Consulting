# Launch readiness

## Current verdict: not ready

Fresh browser checks on 2026-11-01 show Railway's 404 fallback at the homepage,
`/book`, and the old API `/up` endpoint. The earlier October launch evidence is
historical and does not establish present availability.

No replacement preview has been deployed. The intact frontend now passes the
normal Next.js build, Cloudflare's 100% vinext compatibility check, a vinext
Worker build, and local workerd route smoke tests. The hydrated quote form shows
the complete 50-state-plus-DC selector. The edge API passes strict TypeScript,
22 unit tests, and a Wrangler dry-run bundle. Production rows/private
uploads have not been exported, provider accounts and staff identities are not
configured, database migrations have not executed, and email/Stripe/browser
workflows have not run against a provider preview. The prepared frontend archive
is still missing for comparison, while generic campaigns and private media
remain explicit parity gaps.

The authoritative status, blockers, next actions, and no-cutover rule are in
[STATE.md](STATE.md). Route-by-route readiness is in
[migration/FEATURE_PARITY.md](migration/FEATURE_PARITY.md). Keep Railway
resources intact and keep DNS unchanged until every critical gate passes.
