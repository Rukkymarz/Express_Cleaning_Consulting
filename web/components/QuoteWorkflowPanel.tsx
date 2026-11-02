'use client';

import { FormEvent, useMemo, useRef, useState } from 'react';
import { jsonRequest } from '@/lib/api';

type Worker = { id: number; name: string; email: string };
type LeadWorkflow = {
  id: number;
  email: string | null;
  service_name: string | null;
  service_request_id: number | null;
  customer_linked: boolean;
  customer_email: string | null;
  quote_id: string | null;
  quote_status: string | null;
  quote_total_cents: number | null;
  quote_deposit_cents: number | null;
  quote_expires_at: string | null;
  booking_id: string | null;
  booking_status: string | null;
};

type QuoteResult = {
  quote_id: string;
  status: string;
  revision: number;
  total_cents: number;
  deposit_cents: number;
};

type BookingResult = { booking_id: string; status: string };
type InvoiceResult = {
  payment_id: number;
  status: string;
  amount_cents: number;
  currency: string;
  hosted_invoice_url: string | null;
  test_mode: true;
};

type EditableItem = { description: string; quantity: string; unitDollars: string };
type PendingMutation = { payload: string; key: string };
const paymentsMode = process.env.NEXT_PUBLIC_PAYMENTS_MODE === 'test' ? 'test' : 'disabled';

function idempotencyKey(prefix: string): string {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function cents(value: string, label: string): number {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error(`${label} must be a dollar amount with no more than two decimals.`);
  const parsed = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} is too large.`);
  return parsed;
}

function money(value: number | null | undefined, currency = 'USD'): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format((value ?? 0) / 100);
}

export default function QuoteWorkflowPanel({ lead, workers, canIssue, canDispatch, onChanged }: { lead: LeadWorkflow; workers: Worker[]; canIssue: boolean; canDispatch: boolean; onChanged: () => Promise<void> }) {
  const [email, setEmail] = useState(lead.customer_email || lead.email || '');
  const [items, setItems] = useState<EditableItem[]>([{ description: lead.service_name || '', quantity: '1', unitDollars: '' }]);
  const [taxDollars, setTaxDollars] = useState('');
  const [depositDollars, setDepositDollars] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [quote, setQuote] = useState<QuoteResult | null>(lead.quote_id ? {
    quote_id: lead.quote_id,
    status: lead.quote_status || 'sent',
    revision: 0,
    total_cents: lead.quote_total_cents ?? 0,
    deposit_cents: lead.quote_deposit_cents ?? 0,
  } : null);
  const [workerId, setWorkerId] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [timeZone, setTimeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago');
  const [booking, setBooking] = useState<BookingResult | null>(lead.booking_id ? { booking_id: lead.booking_id, status: lead.booking_status || 'scheduled' } : null);
  const [invoiceMode, setInvoiceMode] = useState('');
  const [daysUntilDue, setDaysUntilDue] = useState('');
  const [invoice, setInvoice] = useState<InvoiceResult | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const quoteAttempt = useRef<PendingMutation | null>(null);
  const invoiceAttempt = useRef<PendingMutation | null>(null);

  const activeQuoteId = lead.quote_id || quote?.quote_id;
  const activeQuoteStatus = lead.quote_status || quote?.status;
  const activeBookingId = lead.booking_id || booking?.booking_id;
  const activeBookingStatus = lead.booking_status || booking?.status;
  const quotedTotal = lead.quote_total_cents ?? quote?.total_cents;
  const quotedDeposit = lead.quote_deposit_cents ?? quote?.deposit_cents;
  const calculatedSubtotal = useMemo(() => {
    try {
      return items.reduce((sum, item) => sum + Number(item.quantity || 0) * cents(item.unitDollars || '0', 'Line item'), 0);
    } catch { return null; }
  }, [items]);

  async function linkCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy('customer'); setError(''); setNotice('');
    try {
      await jsonRequest(`/admin/leads/${lead.id}/customer-link`, { method: 'POST', body: JSON.stringify({ email: email.trim() }) });
      setNotice('Customer account linked. The customer can now review an issued quote after signing in.');
      await onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to link the customer account.'); }
    finally { setBusy(''); }
  }

  function updateItem(index: number, field: keyof EditableItem, value: string) {
    setItems(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  }

  async function issueQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy('quote'); setError(''); setNotice('');
    try {
      if (!lead.service_request_id) throw new Error('This lead does not have a service request to quote.');
      if (!expiresAt) throw new Error('Choose when this quote expires.');
      const expires = new Date(expiresAt);
      if (Number.isNaN(expires.valueOf()) || expires.valueOf() <= Date.now()) throw new Error('Quote expiration must be in the future.');
      const preparedItems = items.map((item, index) => {
        const quantity = Number(item.quantity);
        if (!item.description.trim()) throw new Error(`Enter a description for line ${index + 1}.`);
        if (!Number.isInteger(quantity) || quantity < 1) throw new Error(`Line ${index + 1} quantity must be a whole number of at least 1.`);
        return { description: item.description.trim(), quantity, unit_cents: cents(item.unitDollars, `Line ${index + 1} price`) };
      });
      const body = JSON.stringify({
        items: preparedItems,
        tax_cents: cents(taxDollars || '0', 'Tax'),
        deposit_cents: cents(depositDollars || '0', 'Deposit'),
        expires_at: expires.toISOString(),
      });
      const payload = `${lead.service_request_id}:${body}`;
      if (!quoteAttempt.current || quoteAttempt.current.payload !== payload) quoteAttempt.current = { payload, key: idempotencyKey('quote') };
      const result = await jsonRequest<QuoteResult>(`/admin/requests/${lead.service_request_id}/quotes`, {
        method: 'POST',
        headers: { 'Idempotency-Key': quoteAttempt.current.key },
        body,
      });
      quoteAttempt.current = null;
      setQuote(result);
      setNotice(`Quote ${result.quote_id} issued for ${money(result.total_cents)}. It must be accepted before scheduling.`);
      await onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to issue the quote.'); }
    finally { setBusy(''); }
  }

  async function prepareBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy('booking'); setError(''); setNotice('');
    try {
      if (!activeQuoteId) throw new Error('Issue a quote first.');
      if (!workerId) throw new Error('Choose an approved cleaner.');
      if (!startAt || !endAt) throw new Error('Choose the service start and end.');
      const start = new Date(startAt), end = new Date(endAt);
      if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || start.valueOf() <= Date.now() || end.valueOf() <= start.valueOf()) {
        throw new Error('Choose a future service window with an end after the start.');
      }
      const result = await jsonRequest<BookingResult>(`/admin/quotes/${activeQuoteId}/booking`, {
        method: 'POST',
        body: JSON.stringify({ worker_id: Number(workerId), start_at: start.toISOString(), end_at: end.toISOString(), time_zone: timeZone.trim() }),
      });
      setBooking(result);
      setNotice(`Booking ${result.booking_id} prepared. Payment remains separate from the free quote request.`);
      await onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to prepare the booking.'); }
    finally { setBusy(''); }
  }

  async function issueTestInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy('invoice'); setError(''); setNotice('');
    try {
      if (paymentsMode !== 'test') throw new Error('Stripe test invoicing is not enabled.');
      if (!activeBookingId) throw new Error('Prepare an approved booking first.');
      if (!['deposit', 'full', 'balance'].includes(invoiceMode)) throw new Error('Choose the approved amount to invoice.');
      const due = Number(daysUntilDue);
      if (!Number.isInteger(due) || due < 1 || due > 90) throw new Error('Invoice due days must be a whole number from 1 to 90.');
      const body = JSON.stringify({ mode: invoiceMode, days_until_due: due });
      const payload = `${activeBookingId}:${body}`;
      if (!invoiceAttempt.current || invoiceAttempt.current.payload !== payload) invoiceAttempt.current = { payload, key: idempotencyKey('test-invoice') };
      const result = await jsonRequest<InvoiceResult>(`/admin/bookings/${activeBookingId}/payment-invoices`, {
        method: 'POST',
        headers: { 'Idempotency-Key': invoiceAttempt.current.key },
        body,
      });
      invoiceAttempt.current = null;
      setInvoice(result);
      setNotice(`Stripe test invoice created for ${money(result.amount_cents, result.currency)}. No live charge was created.`);
      await onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to create the test invoice.'); }
    finally { setBusy(''); }
  }

  return <details className="mt-5 rounded-xl border border-platinum-dark bg-white p-4">
    <summary className="cursor-pointer font-bold text-ocean">Quote, customer, and booking workflow</summary>
    <div className="mt-5 grid gap-6">
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-[#EAF5F2] p-3 text-sm text-ocean">{notice}</p>}

      <section aria-labelledby={`customer-title-${lead.id}`}>
        <h3 id={`customer-title-${lead.id}`} className="font-bold">1. Link the customer account</h3>
        {lead.customer_linked
          ? <p className="mt-2 text-sm text-slate-600">Linked to {lead.customer_email || lead.email || 'a verified customer account'}.</p>
          : !canIssue
            ? <p className="mt-2 text-sm text-slate-600">A staff member with quote permission must link a verified customer account.</p>
          : <form onSubmit={linkCustomer} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div><label htmlFor={`customer-email-${lead.id}`} className="block text-sm font-semibold">Existing customer sign-in email</label><input id={`customer-email-${lead.id}`} type="email" required value={email} onChange={event => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-platinum-dark p-3" /></div>
              <button disabled={busy !== ''} className="rounded-xl border border-ocean px-4 py-3 font-bold text-ocean disabled:opacity-50">{busy === 'customer' ? 'Linking…' : 'Link account'}</button>
            </form>}
        <p className="mt-2 text-xs text-slate-500">Only an existing, verified customer identity can be linked. This does not send or create a public signup.</p>
      </section>

      <section aria-labelledby={`quote-title-${lead.id}`} className="border-t border-platinum pt-5">
        <h3 id={`quote-title-${lead.id}`} className="font-bold">2. Issue the written quote</h3>
        {activeQuoteId && <div className="mt-3 rounded-lg bg-canvas p-3 text-sm"><p><strong>Quote:</strong> {activeQuoteId}</p><p className="mt-1"><strong>Status:</strong> {(activeQuoteStatus || 'sent').replaceAll('_', ' ')}</p><p className="mt-1"><strong>Total:</strong> {money(quotedTotal)} · <strong>Deposit:</strong> {money(quotedDeposit)}</p>{lead.quote_expires_at && <p className="mt-1"><strong>Expires:</strong> {new Date(lead.quote_expires_at).toLocaleString()}</p>}</div>}
        {!canIssue && !activeQuoteId && <p className="mt-3 text-sm text-slate-600">A staff member with quote permission must issue the written quote.</p>}
        {canIssue && activeQuoteStatus !== 'accepted' && <form onSubmit={issueQuote} className="mt-4 grid gap-4">
          <fieldset><legend className="text-sm font-semibold">Line items</legend><div className="mt-2 grid gap-3">{items.map((item, index) => <div key={index} className="grid gap-2 rounded-lg border border-platinum p-3">
            <div><label htmlFor={`item-description-${lead.id}-${index}`} className="block text-xs font-semibold">Description</label><input id={`item-description-${lead.id}-${index}`} required value={item.description} onChange={event => updateItem(index, 'description', event.target.value)} className="mt-1 w-full rounded-lg border border-platinum-dark p-2" /></div>
            <div><label htmlFor={`item-quantity-${lead.id}-${index}`} className="block text-xs font-semibold">Quantity</label><input id={`item-quantity-${lead.id}-${index}`} type="number" min="1" step="1" required value={item.quantity} onChange={event => updateItem(index, 'quantity', event.target.value)} className="mt-1 w-full rounded-lg border border-platinum-dark p-2" /></div>
            <div><label htmlFor={`item-price-${lead.id}-${index}`} className="block text-xs font-semibold">Unit price ($)</label><input id={`item-price-${lead.id}-${index}`} inputMode="decimal" placeholder="0.00" required value={item.unitDollars} onChange={event => updateItem(index, 'unitDollars', event.target.value)} className="mt-1 w-full rounded-lg border border-platinum-dark p-2" /></div>
            {items.length > 1 && <button type="button" onClick={() => setItems(current => current.filter((_, itemIndex) => itemIndex !== index))} className="text-sm font-bold text-red-700 underline">Remove</button>}
          </div>)}</div><button type="button" onClick={() => setItems(current => [...current, { description: '', quantity: '1', unitDollars: '' }])} className="mt-3 text-sm font-bold text-ocean underline">Add line item</button></fieldset>
          <div className="grid gap-3"><div><label htmlFor={`tax-${lead.id}`} className="block text-sm font-semibold">Tax ($)</label><input id={`tax-${lead.id}`} inputMode="decimal" placeholder="0.00" value={taxDollars} onChange={event => setTaxDollars(event.target.value)} className="mt-2 w-full rounded-xl border border-platinum-dark p-3" /></div><div><label htmlFor={`deposit-${lead.id}`} className="block text-sm font-semibold">Approved deposit ($)</label><input id={`deposit-${lead.id}`} inputMode="decimal" placeholder="0.00" value={depositDollars} onChange={event => setDepositDollars(event.target.value)} className="mt-2 w-full rounded-xl border border-platinum-dark p-3" /></div><div><label htmlFor={`expires-${lead.id}`} className="block text-sm font-semibold">Expires</label><input id={`expires-${lead.id}`} type="datetime-local" required value={expiresAt} onChange={event => setExpiresAt(event.target.value)} className="mt-2 w-full rounded-xl border border-platinum-dark p-3" /></div></div>
          {calculatedSubtotal !== null && <p className="text-sm text-slate-600">Line subtotal: {money(calculatedSubtotal)}. The server verifies the final total, tax, and deposit.</p>}
          <button disabled={busy !== ''} className="w-fit rounded-xl bg-ocean px-5 py-3 font-bold text-white disabled:opacity-50">{busy === 'quote' ? 'Issuing…' : activeQuoteId ? 'Issue revised quote' : 'Issue quote'}</button>
        </form>}
        {activeQuoteStatus === 'sent' && <p className="mt-3 text-sm text-slate-600">Waiting for the linked customer to review and accept this quote in their account.</p>}
      </section>

      <section aria-labelledby={`booking-title-${lead.id}`} className="border-t border-platinum pt-5">
        <h3 id={`booking-title-${lead.id}`} className="font-bold">3. Schedule the accepted quote</h3>
        {activeBookingId && <p className="mt-2 text-sm text-slate-600">Booking {activeBookingId} · {(activeBookingStatus || 'prepared').replaceAll('_', ' ')}</p>}
        {!canDispatch ? <p className="mt-2 text-sm text-slate-600">A staff member with booking-dispatch permission must schedule this service.</p> : activeQuoteStatus !== 'accepted' && !activeBookingId ? <p className="mt-2 text-sm text-slate-600">Available after customer acceptance.</p> : !activeBookingId && <form onSubmit={prepareBooking} className="mt-4 grid gap-3">
          <div><label htmlFor={`worker-${lead.id}`} className="block text-sm font-semibold">Approved cleaner</label><select id={`worker-${lead.id}`} required value={workerId} onChange={event => setWorkerId(event.target.value)} className="mt-2 w-full rounded-xl border border-platinum-dark p-3"><option value="">Choose a cleaner</option>{workers.map(worker => <option key={worker.id} value={worker.id}>{worker.name}</option>)}</select></div>
          <div><label htmlFor={`timezone-${lead.id}`} className="block text-sm font-semibold">Time zone</label><input id={`timezone-${lead.id}`} required value={timeZone} onChange={event => setTimeZone(event.target.value)} className="mt-2 w-full rounded-xl border border-platinum-dark p-3" /></div>
          <div><label htmlFor={`start-${lead.id}`} className="block text-sm font-semibold">Start</label><input id={`start-${lead.id}`} type="datetime-local" required value={startAt} onChange={event => setStartAt(event.target.value)} className="mt-2 w-full rounded-xl border border-platinum-dark p-3" /></div>
          <div><label htmlFor={`end-${lead.id}`} className="block text-sm font-semibold">End</label><input id={`end-${lead.id}`} type="datetime-local" required value={endAt} onChange={event => setEndAt(event.target.value)} className="mt-2 w-full rounded-xl border border-platinum-dark p-3" /></div>
          <button disabled={busy !== '' || workers.length === 0} className="w-fit rounded-xl bg-ocean px-5 py-3 font-bold text-white disabled:opacity-50">{busy === 'booking' ? 'Preparing…' : 'Prepare booking'}</button>
          {workers.length === 0 && <p className="text-sm text-red-700">No approved cleaner is available for scheduling.</p>}
        </form>}
      </section>

      <section aria-labelledby={`invoice-title-${lead.id}`} className="border-t border-platinum pt-5">
        <h3 id={`invoice-title-${lead.id}`} className="font-bold">4. Optional Stripe test invoice</h3>
        <p className="mt-2 text-sm text-slate-600">The free quote form never charges the customer. This step is only for a separately approved quote and remains test-only.</p>
        {!canIssue ? <p className="mt-3 text-sm text-slate-600">A staff member with quote permission must create any approved test invoice.</p>
          : paymentsMode !== 'test' ? <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Stripe invoicing is disabled. No payment option can be created.</p>
          : !activeBookingId ? <p className="mt-3 text-sm text-slate-600">Prepare a booking before creating a test invoice.</p>
          : <form onSubmit={issueTestInvoice} className="mt-4 grid gap-3">
            <div><label htmlFor={`invoice-mode-${lead.id}`} className="block text-sm font-semibold">Approved amount</label><select id={`invoice-mode-${lead.id}`} required value={invoiceMode} onChange={event => setInvoiceMode(event.target.value)} className="mt-2 w-full rounded-xl border border-platinum-dark p-3"><option value="">Choose amount</option><option value="deposit">Approved deposit</option><option value="full">Full approved quote</option><option value="balance">Remaining balance after completion</option></select></div>
            <div><label htmlFor={`invoice-due-${lead.id}`} className="block text-sm font-semibold">Due in days (1–90)</label><input id={`invoice-due-${lead.id}`} type="number" min="1" max="90" step="1" required value={daysUntilDue} onChange={event => setDaysUntilDue(event.target.value)} className="mt-2 w-full rounded-xl border border-platinum-dark p-3" /></div>
            <button disabled={busy !== ''} className="rounded-xl border border-ocean px-4 py-3 font-bold text-ocean disabled:opacity-50">{busy === 'invoice' ? 'Creating…' : 'Create test invoice'}</button>
          </form>}
        {invoice && <div className="mt-4 rounded-lg bg-[#EAF5F2] p-3 text-sm text-ocean"><p>Test invoice {invoice.status.replaceAll('_', ' ')} · {money(invoice.amount_cents, invoice.currency)}</p>{invoice.hosted_invoice_url && <a href={invoice.hosted_invoice_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-bold underline">Open Stripe test invoice</a>}</div>}
      </section>
    </div>
  </details>;
}
