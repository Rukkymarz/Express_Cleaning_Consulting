# Express Cleaning Consult — current state

Updated 2026-11-03 02:50 CST (America/Chicago).

## Launch status

- Source branch: `codex/cloudflare-neon-migration`; current pushed baseline:
  `980bd91`.
- Runtime target: Cloudflare Workers for the web/API and Neon Postgres for
  application data. Railway is no longer in the live request path.
- Web Worker: `express-cleaning-consult-web`, version
  `57e6e74b-965c-4c25-90ec-cbd47eab5572`.
- API Worker: `express-cleaning-edge-api`, version
  `3a8092e1-a944-4ae2-bff4-66e31c79ac30`.
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
- `https://www.expresscleaningconsult.com/` returns `200` with valid TLS. At the
  Cloudflare edge, the apex returns a permanent `308` to the same path and query
  on `www`. Google Public DNS already returns Cloudflare addresses; one local/
  1.1.1.1 cache still retained GoDaddy's former apex A record at the last check.

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
- Neon migrations through `012_lead_manager_and_exports.sql` are represented by
  the deployed API workflow. The Resend delivery-event schema, signed webhook
  handling, retry-safe outbox, and quarantine of the two earlier synthetic
  notification sets are part of the current migration source.
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
- Managed staff login is not launch-verified because the deployed environment
  still lacks a confirmed `NEON_AUTH_URL`/provider identity mapping.
- Stripe payment code is test-mode gated and only applies after an approved
  quote and prepared booking. It includes signature-verified webhooks,
  duplicate-event handling, ownership checks, server-derived amounts, and
  duplicate-invoice protection.
- Stripe sandbox secrets/webhook are not configured in the deployed Worker, so
  provider-level success/failure/replay testing is still blocked. Live collection
  remains disabled. No real invoice or charge has been issued.
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

- Frontend typecheck passed after adding both custom domains to
  `web/cloudflare.config.ts`.
- The vinext production build and deployment completed; Cloudflare reported both
  custom-domain triggers attached.
- Live TLS, `www` home/contact, `robots.txt`, `sitemap.xml`, public catalog, and
  the existing quote-status endpoint pass. The authoritative apex redirect
  preserves paths and query strings.
- API `/up` and the existing quote status endpoint pass against the deployed
  Neon-backed API.
- Previous repository checks include strict TypeScript, Vitest, Next.js/vinext
  production builds, route smoke tests, and Worker bundle checks.

## Remaining actions

1. Allow the former GoDaddy apex A record to expire from remaining recursive
   caches, then repeat a normal (non-forced) apex redirect check.
2. Verify Zoho mailbox delivery and publish the account-specific DKIM record if
   Zoho shows it as pending.
3. Configure and verify Managed Auth for the confirmed owner/Christine identity.
4. Configure Stripe sandbox credentials/webhook and run the accepted-quote test
   matrix after the payment policy is confirmed. Do not enable live collection.
5. Preserve/export Railway data through a no-cost support path before the
   reported deletion deadline.
