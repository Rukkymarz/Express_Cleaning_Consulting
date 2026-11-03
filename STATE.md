# Express Cleaning Consult — current state

Updated 2026-11-03 03:27 CST (America/Chicago).

## Launch status

- Source branch: `codex/cloudflare-neon-migration`; deployed API configuration
  baseline: `aa2a08f`.
- Runtime target: Cloudflare Workers for the web/API and Neon Postgres for
  application data. Railway is no longer in the live request path.
- Web Worker: `express-cleaning-consult-web`, version
  `57e6e74b-965c-4c25-90ec-cbd47eab5572`.
- API Worker: `express-cleaning-edge-api`, version
  `67a149f7-304c-43f4-b939-cf0068ac9271`.
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
- The production request, linked task, and notification status prove the
  deployed Neon workflow needed by the public quote path. Migrations
  `011_resend_delivery_events.sql` and `012_lead_manager_and_exports.sql`, plus
  `008_validate.sql`, remain source-complete but are not marked applied here
  without a direct migration-ledger/validation result. Do not infer that result
  from application behavior alone.
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
- The API now has the confirmed Neon `NEON_AUTH_URL`. Neon Auth is enabled for
  the production branch, but its console currently has no users, no trusted
  production domain, and still allows localhost. Until those provider settings
  and the database identity/role mappings are completed, staff endpoints fail
  closed and the owner/Christine login is not launch-ready.
- Stripe payment code is test-mode gated and only applies after an approved
  quote and prepared booking. It includes signature-verified webhooks,
  duplicate-event handling, ownership checks, server-derived amounts, and
  duplicate-invoice protection.
- Stripe sandbox secrets/webhook are not configured in the deployed Worker. The
  connected Stripe session exposes only the live Express Clean Consult account,
  so it was deliberately not used for sandbox writes or invoices. Provider-level
  success/failure/replay testing remains blocked. Live collection remains
  disabled and no real invoice or charge has been issued.
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
- The vinext production build and deployment completed; Cloudflare reported both
  custom-domain triggers attached.
- Live TLS, `www` home/contact, `robots.txt`, `sitemap.xml`, public catalog, and
  the existing quote-status endpoint pass. The authoritative apex redirect
  preserves paths and query strings.
- API `/up` and the existing quote status endpoint pass against the deployed
  Neon-backed API after version `67a149f7-304c-43f4-b939-cf0068ac9271`.
- Current API checks pass: strict TypeScript plus 36 Vitest tests across nine
  files. The Worker dry-run bundle completes. Previous checks include the
  Next.js/vinext production build, route smoke tests, and frontend tracking test.

## Remaining actions

1. Verify Zoho mailbox delivery and publish the account-specific DKIM record if
   Zoho shows it as pending.
2. In Neon Auth, add `https://www.expresscleaningconsult.com` (and the apex if
   redirects are used during auth), disable localhost, create the approved
   identities, and link their provider IDs to the database `owner` and
   `lead_manager` memberships. This requires the owner's distinct email or an
   explicit decision that one identity will hold only one of those roles.
3. Verify the production migration ledger for `011`/`012`, run
   `008_validate.sql`, and record the result without reapplying completed work.
4. Connect or create a Stripe sandbox, configure its restricted key and signed
   webhook, then run the accepted-quote test matrix after the payment policy is
   confirmed. Do not enable live collection.
5. Verify Resend's domain/webhook delivery event in its signed-in dashboard;
   the deployed secret bindings and application notification status are present,
   but provider delivery is not claimed without the provider event.
6. Preserve/export Railway data through a no-cost support path before the
   reported deletion deadline.
