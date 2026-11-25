# Express Cleaning Consult — current state

Updated 2026-11-03 (America/Chicago).

## Launch status

- Source branch: `codex/cloudflare-neon-migration`; deployed API source
  baseline: `d10a0c7`.
- Runtime target: Cloudflare Workers for the web/API and Neon Postgres for
  application data. Railway is no longer in the live request path.
- Web Worker: `express-cleaning-consult-web`, version
  `51c25508-e2f3-4eee-b9a2-44b3ab681fed`.
- API Worker: `express-cleaning-edge-api`, version
  `f62136c8-19ce-432a-bcaf-173c638959b3`.
- API health: `https://express-cleaning-edge-api.rukkymarz.workers.dev/up`
  returns service and database `ok`.
- GoDaddy now delegates `expresscleaningconsult.com` to
  `liz.ns.cloudflare.com` and `pedro.ns.cloudflare.com`; the `.com` registry and
  public recursive DNS both show that delegation.
- Cloudflare custom domains are attached to the web Worker for both the apex and
  `www`. A manual activation recheck cleared the cached GoDaddy delegation and
  Cloudflare changed the zone to `active` at 2026-11-03 08:46:04 UTC.
- Authoritative DNS now returns Cloudflare edge addresses for both hostnames.
  Universal SSL is enabled with Let's Encrypt and the certificate is active.
- `https://www.expresscleaningconsult.com/` returns `200` with valid TLS. A
  normal, non-forced request to the apex follows the permanent redirect and
  returns the canonical `www` site. Google and Quad9 return Cloudflare edge
  addresses; a stale 1.1.1.1 answer observed during cutover is non-authoritative
  and does not block the working public route.

## Verified application behavior

- The public quote remains free and does not create an invoice, PaymentIntent,
  or charge.
- The public form submits a full-name US-state selector as a validated two-letter
  code and does not request a Sanctum CSRF cookie.
- Public support details are `support@expresscleaningconsult.com` and clickable
  phone `(281) 972-7712`.
- Internal quote notifications are addressed to
  `expressconsulting92@gmail.com` from server-side configuration.
- Production synthetic receipt `01M6DPCHGFSTT7RF748AAV0J7C` currently reports:
  request `received`, linked staff task `open`, notification `sent`.
- Idempotency is enforced in the database workflow so a replay returns the same
  receipt and does not create a second task or notification.
- Neon SQL history confirms `011_resend_delivery_events.sql` and
  `012_lead_manager_and_exports.sql` were executed on 2026-11-02. The current
  `008_validate.sql` query was rerun on 2026-11-03 and all four statements
  completed successfully without a validation exception.
- The website includes the responsive design/contact/SEO work from `980bd91`.
  Unverified customer photos and testimonial claims are not presented as
  completed company work.

## DNS and mail

- Cloudflare authoritative DNS preserves the Zoho MX records at priorities
  10/20/50 and the Zoho SPF record.
- The existing DMARC record and Resend DKIM/return-path records are preserved.
- Zoho inbox service and account-specific DKIM verification still require a
  signed-in Zoho check; DNS presence alone is not recorded as successful mailbox
  delivery.
- The site and mail records are live on Cloudflare. Do not replace the
  Worker-managed read-only DNS records manually while old recursive caches age
  out.

## Security and payments

- Owner and Christine permissions are implemented with the restricted
  `lead_manager` role. Christine's role excludes billing, secrets, user
  administration, payment issuance, and deletion.
- The API has the confirmed Neon `NEON_AUTH_URL`. Neon Auth trusts only the apex
  and `www` production domains; localhost authentication is disabled.
- Provider identities were created and linked to application users:
  `expressconsulting92@gmail.com` has the `owner` role and
  `christinewealth789@gmail.com` has the exact `lead_manager` role. A direct
  permission query confirms Christine has only `calls.place`, `leads.edit`,
  `leads.export`, and `leads.view`.
- The managed-auth proxy no longer sends synthetic `x-forwarded-host` headers,
  which Neon rejected with `INVALID_HOSTNAME`. Anonymous admin access now fails
  closed with `401 Please sign in` rather than a provider-configuration `503`.
  Public `/forgot-password` and `/reset-password` pages are now deployed, and
  the login page links to the secure setup/reset flow. Account completion and
  an authenticated browser session still require each mailbox owner to use the
  time-limited link sent to their own inbox.
- Resend now has provider-level proof: `expresscleaningconsult.com` is verified,
  the production webhook is enabled with seven delivery lifecycle event types,
  and its signed delivery event returned `200 {"received":true}`. The exact
  synthetic receipt `01M6DPCHGFSTT7RF748AAV0J7C` appears once in the delivered
  event payload addressed to `expressconsulting92@gmail.com`, from
  `support@expresscleaningconsult.com`. The active server key is restricted to
  sending access. One unused duplicate sending-only key remains untouched and
  should be revoked only with explicit approval.
- Stripe payment code is test-mode gated and only applies after an approved
  quote and prepared booking. It includes signature-verified webhooks,
  duplicate-event handling, ownership checks, server-derived amounts, and
  duplicate-invoice protection.
- The signed-in Stripe dashboard exposes the Express Clean Consult sandbox, and
  the code's exact least-privilege server permissions are Customer write plus
  Invoice write. No restricted sandbox key or webhook exists yet; their creation
  is waiting at the action-time confirmation boundary. Provider-level
  success/failure/replay testing therefore remains blocked. Live collection
  remains disabled and no real invoice or charge has been issued.
- Payment policy still needs an explicit business decision: deposit versus full
  payment, deposit amount/percentage, balance timing, taxes, cancellation/
  refund/rescheduling/no-show terms, and whether partial payments are allowed.

## Railway preservation

- Railway resources, the MySQL volume, and the recorded 186 MB pre-security-patch
  backup have not been deleted, upgraded, or overwritten.
- Do not purchase Hobby or delete Railway data. Obtain a no-cost export/grace
  path before the reported 2026-11-28 deletion date; the prepared message is in
  `migration/RAILWAY_SUPPORT_REQUEST.md`.

## Checks completed

- Frontend typecheck and tracking tests pass with both custom domains in
  `web/cloudflare.config.ts`.
- The vinext production build and deployment completed with the password setup
  routes included; Cloudflare reported both custom-domain triggers attached.
- Live `/`, `/login`, `/forgot-password`, and `/reset-password` return `200`;
  the apex password-reset route redirects to canonical `www` and returns `200`.
- Live TLS, `www` home/contact, `robots.txt`, `sitemap.xml`, public catalog, and
  the existing quote-status endpoint pass. The authoritative apex redirect
  preserves paths and query strings.
- API `/up` and the existing quote status endpoint pass against the deployed
  Neon-backed API after version `f62136c8-19ce-432a-bcaf-173c638959b3`.
- Current API checks pass: strict TypeScript plus 36 Vitest tests across nine
  files. The Worker dry-run bundle completes. Previous checks include the
  Next.js/vinext production build, route smoke tests, and frontend tracking test.

## Remaining actions

1. Verify Zoho mailbox delivery and publish the account-specific DKIM record if
   Zoho shows it as pending.
2. Send the Neon Auth password links, then have each mailbox owner choose their
   own password and browser-test owner/Christine role-specific access.
3. Create the prepared Stripe sandbox restricted key and signed webhook after
   action-time confirmation, then run the accepted-quote test matrix after the
   payment policy is confirmed. Do not enable live collection.
4. Preserve/export Railway data through a no-cost support path before the
   reported deletion deadline.

## Redesign branch `redesign/cinematic-reel` (2026-11-25)

- New cinematic home page: full-screen video reel of cleaners at work, service index with hover video, sticky process, property-team/partner cards, FAQ, video contact band. Files: `web/app/page.tsx`, `web/app/cinema.css`, `web/components/{HeroReel,ServiceIndex,CinemaEffects}.tsx`, `web/lib/reel.ts`.
- SEO kept and extended: absolute title, keyword set, Organization/WebSite/FAQPage JSON-LD with per-service Offer provider/areaServed. No loader screen on production (protects LCP).
- Footage: Mixkit free stock clips hotlinked from assets.mixkit.co with `/gallery` posters; labeled as stock in the footer. Self-host under `/public/video` before launch.
- Not yet run in this branch: `npm run typecheck`, `build:vinext`, deploy. Owner approval required before merge/deploy.
- Mail: Zoho MX records still published while Zoho is dropped; planned fix is Cloudflare Email Routing to the business Gmail plus Gmail "Send mail as" over smtp.resend.com (needs owner approval).
