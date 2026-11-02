# DNS cutover: GoDaddy to Cloudflare

Updated 2026-11-02 (America/Chicago).

The public domain still delegates to GoDaddy. The Cloudflare zone is pending,
so none of the records below affect public traffic yet.

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
