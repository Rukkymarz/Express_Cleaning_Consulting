# Express Cleaning Consult — October 16 launch update

## Implemented in source
- Petrol/copper desktop and mobile layout, one public phone number and support address.
- 10% first-clean email offer, capped at $30, code FIRSTCLEAN10; no card or automatic charge. Terms are shown before signup and must be confirmed in the written quote.
- Nationwide ZIP inquiry section. The ZIP routes into the quote form; availability is reviewed by staff, not asserted automatically.
- Owner-approved 24-hour make-it-right guarantee, FAQ, Privacy Policy and Terms.
- Property managers/Airbnb hosts, partner cleaner application and permission-based client referral pages.
- Validated public intake endpoint, transactional persistence/idempotent receipts, private staff inquiry inbox, bounded provider-idempotent email outbox and recovery on the existing quote-notifications worker.
- Customer quote confirmation is queued only for a newly persisted request. The original staff notification remains separate.
- Quote form service/city/state/ZIP prefill, existing preferred date/time retained, and requested discount recorded for staff review.
- Meta Lead and GA4 generate_lead fire only after a successful receipt and applicable tracking consent, once per receipt per browser session/provider. No contact/address fields are passed as event parameters. Admin/account/login pages exclude loaders. Meta automatic configuration is disabled; audit account-side enhanced measurement before launch.
- Eleven project images converted to WebP under 300,000 bytes, descriptive paths and alt text. Owner confirmed ownership/partner work and customer approval on October 16.
- Confirmed-market gate and city/service template, with no active city entries. Seeded API markets are no longer enough to publish SEO pages. Sitemap includes public launch pages only.

## Verification performed here
- Frontend TypeScript and production Next build using webpack passed.
- Executable tracking checks passed for no-consent script exclusion, receipt deduplication, withdrawal and private-page exclusion.
- Changed PHP source parsed successfully with php-parser; this is a syntax check, not PHPUnit execution.
- All eleven published project WebP files decoded successfully and are below 300 KB.
- Seven-page self-contained desktop/mobile review generated from the production HTML. Forms in that review are deliberately disabled; production source forms call the saved backend workflow.

## Required deployment sequence
1. Apply this package to `design/petrol-copper-cookies` in `Rukkymarz/Express_Cleaning_Consulting`, preserving any newer repository work. Run `npm ci`, `npm run typecheck`, `npm run test:tracking`, `npm run build` in web. Run `composer install` and `php artisan test` in api. The included read-only GitHub Actions workflow runs both suites after push.
2. Resolve any Laravel test failure before deploying. PHP/Composer are unavailable in this workspace; syntax checks do not establish runtime correctness. Deploy API with its existing `php artisan migrate --force` pre-deploy command and verify the new tables/endpoints before web rollout. Keep the supervised database worker on `quote-notifications`; the existing recovery loop now also recovers queued launch mail. Keep live Stripe payments disabled.
3. Configure runtime mail settings in API: RESEND_API_KEY, verified MAIL_FROM_ADDRESS, QUOTE_NOTIFICATION_TO=expressconsulting92@gmail.com. Existing credentials must remain private. Check blocked/needs_reconciliation rows; do not resend an ambiguous provider result without reconciliation.
4. Deploy web with the existing correct NEXT_PUBLIC_API_URL. Set runtime GA4_MEASUREMENT_ID and META_PIXEL_ID to the real account IDs; blank/invalid values leave tracking disabled. Use GA4 DebugView and Meta Test Events to verify a consented saved quote. Mark generate_lead as a GA4 key event. Do not count failed form attempts as leads.
5. Use one synthetic quote, discount signup, partner application, vendor request and consented referral. Verify one saved record per receipt and safe idempotent replay; confirm staff notices reach expressconsulting92@gmail.com and customer confirmation/offer reach an approved test inbox. Verify limited staff can view/update /admin/inquiries, while guests cannot. No production submissions have been made during this update.
6. Review live pages at 1440px, 768px and 390px, keyboard navigation, dialog close/focus, form errors, tap-to-call, consent withdrawal and email links. This environment did not provide the required local browser QA capability, so live visual/interaction QA remains outstanding.
7. Verify the Search Console property and submit https://www.expresscleaningconsult.com/sitemap.xml. A Google verification meta tag already exists in layout; its presence does not establish property ownership or sitemap submission.

## Awaiting owner/account information
- Real GA4 measurement ID and Meta Pixel ID; account access for Search Console verification/submission.
- Confirmed partner cities and which services each partner actually covers. `web/lib/launch.ts` intentionally has an empty confirmedMarkets list.
- A customer-approved clean kitchen/living-room hero at least 1920px wide. The current approved bedroom image is 1131px wide; it was not artificially upscaled.
- Actual matching Airbnb, office and post-construction before/after pairs if those categories should be shown. Existing pairs keep their true job labels.
- An approved photo of an actual partner cleaner at work. No stock model is represented as a company employee.

## Not needed for this release
- A new toll-free number: optional and would introduce cost; retain (281) 972-7712.
- Autoplay video: the supplied video is held until source/permission and relevance are confirmed; it would add mobile payload.
- City pages for unconfirmed markets, fabricated reviews, an invented street address, or unsupported insured/background-checked claims.
- Pexels photographs on public project sections: the seven supplied files are retained as third-party candidates, respecting the latest job-only photo instruction.

No paid subscriptions, number purchases, live invoices, charges, customer outreach or new production test leads were created.
