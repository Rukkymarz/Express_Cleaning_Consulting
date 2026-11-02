# DNS cutover: GoDaddy to Cloudflare

Updated 2026-11-02 (America/Chicago).

The public domain still delegates to GoDaddy. The Cloudflare zone is pending,
so none of the records below affect public traffic yet.

Read-only public DNS verification on 2026-11-02 confirmed:

- apex A records still point to GoDaddy parking at `15.197.225.128` and
  `3.33.251.168`;
- `www` has no public answer;
- no public MX or DS record exists;
- the DMARC TXT, Resend DKIM TXT, and `send`/`rsend` CNAMEs resolve; and
- GoDaddy nameservers remain authoritative.

## Current delegation

- Current authoritative nameservers: `ns23.domaincontrol.com`,
  `ns24.domaincontrol.com`
- Pending Cloudflare zone: `8b16cf010c6f69386a47aafa980cf396`
- Assigned Cloudflare nameservers: `liz.ns.cloudflare.com`,
  `pedro.ns.cloudflare.com`
- Plan: Cloudflare Free Website

Do not change the GoDaddy nameservers until the remaining launch gates pass.
Cloudflare Workers custom domains require an active Cloudflare zone; attaching
the custom domain is therefore a post-activation step, not a GoDaddy CNAME
step. See Cloudflare's official
[custom-domain](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
and [full-zone setup](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/)
documentation.

## Records preserved in the pending zone

All records are DNS-only and use a 3,600-second TTL.

| Type | Name | Target or purpose |
| --- | --- | --- |
| TXT | `_dmarc` | Existing DMARC quarantine policy and GoDaddy aggregate-report address |
| CNAME | `_domainconnect` | `_domainconnect.gd.domaincontrol.com` |
| CNAME | `pay` | `paylinks.commerce.godaddy.com` |
| TXT | `resend._domainkey` | Existing public Resend DKIM key |
| CNAME | `send` | `send.forge.rmta.net` |
| CNAME | `rsend` | `rsend.forge.rmta.net` |

The two old GoDaddy parking A records (`15.197.225.128` and `3.33.251.168`)
were intentionally not copied. The removed Railway `www` record and its
verification TXT record were also not recreated. As of 2026-11-02,
`www.expresscleaningconsult.com` does not resolve; that is an open launch gate,
not evidence that the preview Workers are attached to the domain.

## Mail gate

The current public zone has no MX record. That means the public address
`support@expresscleaningconsult.com` cannot receive inbound mail even though
the website displays it. The owner has authorized forwarding that public
address to `expressconsulting92@gmail.com`. A Cloudflare Email Routing
destination (`0b9feb0cd5c4475799b37728af523395`) has been created and its
verification email sent, but the destination is not yet verified. Routing and
MX activation also remain blocked until the Cloudflare zone is active. Verify
the destination and a real inbound reply before cutover.

The Resend records above cover sending authentication only. A restricted
server-side Resend API key is still required in the API Worker, and delivery to
`expressconsulting92@gmail.com` must pass before cutover.

## Ordered cutover and rollback

1. Finish Resend delivery/replay, staff auth, production data reconciliation,
   and rollback checks on the `workers.dev` preview.
2. Verify the existing Cloudflare Email Routing destination, then preserve its
   required MX/routing records when the zone becomes active.
3. At GoDaddy, verify DNSSEC/DS state, then replace only the authoritative
   nameservers with the two Cloudflare nameservers shown above.
4. Wait for the Cloudflare zone to become active and verify all preserved DNS
   records from public resolvers.
5. Attach `www.expresscleaningconsult.com` to the web Worker and configure the
   apex redirect. Update the API's staff-review URL to the canonical domain.
6. Test homepage, quote persistence, task, one email, mobile layout, TLS, and
   canonical redirects. Keep Stripe live mode disabled.
7. If activation or routing fails, restore the two GoDaddy nameservers and
   verify delegation before making any further changes.

## Acceptance checks before declaring launch

- `https://expresscleaningconsult.com` redirects permanently to
  `https://www.expresscleaningconsult.com/` without a redirect loop.
- `https://www.expresscleaningconsult.com` serves the web Worker with a valid
  publicly trusted TLS certificate; HTTP redirects to HTTPS.
- `/book`, privacy, terms, sitemap, robots, static assets, and client navigation
  work on both apex and `www` entry paths.
- A quote from the canonical origin passes CORS, returns one receipt, persists
  one request and review task, and creates one new notification only.
- The new notification is accepted and delivered by Resend; replaying its exact
  idempotency key produces no second task or email.
- `support@expresscleaningconsult.com` receives a real inbound test through the
  approved forwarding destination, while SPF/DKIM/DMARC remain valid.
- Anonymous users cannot read staff or customer data, and the owner/lead-manager
  account boundaries pass.
- Stripe remains test-only/disabled on the public quote path. No live key or
  live hosted invoice is present in the Worker.

## Rollback evidence to capture

Immediately before changing nameservers, capture the GoDaddy record list,
current nameservers, Cloudflare zone records, Worker versions, and the UTC
timestamp. If a critical acceptance check fails, restore
`ns23.domaincontrol.com` and `ns24.domaincontrol.com`, wait for public NS
delegation to return, verify the parked apex state and preserved mail records,
and keep the `workers.dev` preview available for diagnosis. Do not delete the
Cloudflare zone, Workers, Neon branch, Railway backup, or Railway volume during
rollback.
