# Express Cleaning Consult — launch state

Updated 2026-10-16 UTC.

## Deployed
- Responsive petrol/copper homepage, approved project photo gallery, first-clean offer (10%, up to $30, FIRSTCLEAN10), cookie choices, nationwide ZIP inquiry, FAQ and policies.
- Property manager/vendor, partner cleaner and referral forms; persisted public intakes, private staff inquiry inbox, bounded Resend outbox and quote confirmation mail.
- PR #1 merged to main as 21489d5152465f5ff8de96e31850f9a3f22a469c; subsequent main commits polish popup/mobile contact layout and publish the public desktop/mobile review.
- Live website: https://www.expresscleaningconsult.com/
- Public review: https://www.expresscleaningconsult.com/design-preview.html (disabled submissions, noindex).

## Verified
- GitHub Actions frontend typecheck, tracking consent/dedup checks, production build and full Laravel suite passed before merge; main checks also passed.
- Committed release files and all eleven WebP assets were downloaded and hash-compared with the prepared release.
- Live browser quote succeeded with receipt 01M52G8GMPM4H5SZEVYQRD2AD8. Synthetic name/address and owner-approved staff inbox; no payment or service booking.
- Live discount intake displayed FIRSTCLEAN10 and queued its offer email. Ongoing marketing consent remained unchecked.
- ZIP prefill, state selector, new public pages, real gallery image loading and desktop overflow checked. Unauthenticated admin inquiries returned a sign-in message and no records.
- The labeled quote test and owner-email discount test were retained. No deletion was attempted.

## Still needs external input or verification
- Real GA4 measurement and Meta Pixel IDs; tracking remains inert without valid IDs and optional consent.
- Confirmed partner cities/ZIP coverage before activating city pages.
- Inbox delivery of queued quote/offer mail has not been independently verified; connected Gmail is not the notification inbox. Do not claim delivered.
- Authenticated staff inbox review needs an authorized staff session; guest protection passed.
- No live Stripe charges enabled; payment rules and sandbox completion remain separate.
- Old Railway project loving-love continues to report a failing unrelated deployment; inspect intended Express Cleaning Consult web/API statuses separately.
