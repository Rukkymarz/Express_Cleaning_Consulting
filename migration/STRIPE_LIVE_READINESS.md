# Stripe sandbox and live-readiness boundary

Updated 2026-11-02. Live collection is not enabled by this document.

## Current invariant

The public quote endpoint never calls Stripe. A payment option can be prepared
only after a stored quote is accepted, a customer-owned booking exists, and a
staff identity has the distinct `payments.issue` permission. The `lead_manager`
role does not have that permission.

The deployed configuration remains:

```text
STRIPE_PAYMENTS_MODE=disabled
STRIPE_LIVE_PAYMENTS_ENABLED=false
NEXT_PUBLIC_PAYMENTS_MODE=disabled
```

No Stripe key or webhook secret belongs in source, Git, frontend variables,
chat, logs, or an exported environment file.

## Required sandbox configuration

Create a separate Stripe sandbox, not a live object. In that sandbox:

1. Create one restricted server key with only the Customer, Invoice, and Invoice
   Item permissions required to create and send a hosted invoice. Store it as the
   write-only Cloudflare Worker secret `STRIPE_API_KEY`.
2. Create an HTTPS webhook endpoint at
   `https://express-cleaning-edge-api.rukkymarz.workers.dev/api/v1/webhooks/stripe`
   and subscribe only to:
   `invoice.paid`, `invoice.payment_failed`, `invoice.voided`,
   `invoice.marked_uncollectible`, `payment_intent.succeeded`,
   `payment_intent.payment_failed`, `payment_intent.canceled`, and
   `charge.refunded`.
3. Store that sandbox endpoint's signing secret as the write-only Worker secret
   `STRIPE_WEBHOOK_SECRET`. Sandbox and live endpoints have different secrets.
4. Set `STRIPE_PAYMENTS_MODE=test` and `NEXT_PUBLIC_PAYMENTS_MODE=test` only on
   the isolated preview while executing the approved synthetic workflow. Leave
   `STRIPE_LIVE_PAYMENTS_ENABLED=false`.
5. Return both frontend and API payment modes to `disabled` after the recorded
   test unless the owner explicitly asks to keep the sandbox UI visible.

The integration uses Stripe API version `2026-09-30.endive`, provider and
database idempotency keys, signature verification over the untouched raw body,
environment/amount/currency/external-ID matching, and terminal-success guards
against out-of-order failure events.

## Sandbox acceptance record

Use only synthetic customer data and Stripe test payment methods. Record:

- the accepted quote, prepared booking, saved payment ID, hosted test invoice,
  and sandbox invoice ID;
- no Stripe object after a public quote-only submission;
- one invoice for repeated same-key issuance and a conflict for a changed
  payload/key reuse;
- `invoice.paid` success from a verified signed event;
- `invoice.payment_failed`, voided/uncollectible, duplicate-event replay, later
  failure after success, success after an earlier failure, and deliberately
  wrong amount/currency/external ID;
- unchanged real booking state for every sandbox event; and
- customer ownership denial plus denial for `lead_manager` payment issuance.

Stripe documents that sandbox invoice emails are not sent by default. Payment
status evidence must come from the stored sandbox objects and signed webhook
events, not from a success-page redirect.

## Exact future live configuration — prepared, not activated

After account readiness and written business policies are approved, create a
separate live restricted key and a separate live webhook endpoint with the same
minimal event list. Put them only in the production Worker's secret store. A
controlled live release would require all of these values together:

```text
STRIPE_PAYMENTS_MODE=live
STRIPE_LIVE_PAYMENTS_ENABLED=true
STRIPE_API_KEY=<separate restricted rk_live key in Worker secret storage>
STRIPE_WEBHOOK_SECRET=<separate live whsec value in Worker secret storage>
NEXT_PUBLIC_PAYMENTS_MODE=live
```

The current frontend intentionally recognizes only `disabled` and `test`, and
the invoice-creation endpoint intentionally accepts only test keys. Therefore,
setting the text above today does **not** activate a usable live flow. A future
reviewed code release must add the live-only customer link/issuance display,
retain the distinct permission and two-server-switch gate, and pass the full
live-readiness checklist before those values are set.

Do not enable Stripe Tax merely by setting `automatic_tax`. First document the
business's tax registrations and jurisdictions. Do not activate live mode until
the owner decides deposit versus full payment, percentage/fixed amount, balance
timing, due dates, taxes, cancellations, refunds, rescheduling/no-show terms,
partial payments, and who may issue or void an invoice.
