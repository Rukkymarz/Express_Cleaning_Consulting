'use client';

import { useCallback, useEffect, useState } from 'react';
import { jsonRequest } from '@/lib/api';

type QuoteItem = { description: string; quantity: number; unit_cents: number; total_cents: number };
type Quote = {
  public_id: string;
  status: string;
  revision: number;
  currency: string;
  total_cents: number;
  deposit_cents: number;
  tax_cents: number;
  expires_at: string;
  request_receipt: string;
  service_name: string;
  location: string;
  items: QuoteItem[];
};

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}

export default function CustomerQuotes() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const result = await jsonRequest<{ data: Quote[] }>('/account/quotes');
    setQuotes(result.data);
  }, []);

  useEffect(() => { load().catch(reason => setError(reason instanceof Error ? reason.message : 'Unable to load quotes.')).finally(() => setLoading(false)); }, [load]);

  async function accept(quote: Quote) {
    setBusy(quote.public_id); setError(''); setNotice('');
    try {
      await jsonRequest(`/quotes/${quote.public_id}/accept`, { method: 'POST', body: '{}' });
      setNotice(`Quote ${quote.public_id} accepted. Our team can now confirm the cleaner and service time.`);
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to accept the quote.'); }
    finally { setBusy(''); }
  }

  return <section aria-labelledby="quotes-title">
    <h2 id="quotes-title" className="text-2xl font-bold">Quotes awaiting your review</h2>
    <p className="mt-2 text-sm text-slate-600">A quote request is free. Review the written scope and price here before accepting; no payment is taken by accepting.</p>
    {loading && <p role="status" className="mt-5">Loading quotes…</p>}
    {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-red-700">{error}</p>}
    {notice && <p role="status" className="mt-5 rounded-lg bg-[#EAF5F2] p-4 text-ocean">{notice}</p>}
    {!loading && !error && quotes.length === 0 && <p className="mt-5 rounded-2xl border border-platinum bg-white p-6">No quotes are ready for review. Your free request will appear here after our team prepares the written scope and price.</p>}
    {quotes.length > 0 && <ul className="mt-5 grid gap-4">{quotes.map(quote => {
      const expired = Date.parse(quote.expires_at) <= Date.now();
      const canAccept = quote.status === 'sent' && !expired;
      return <li key={quote.public_id} className="rounded-2xl border border-platinum bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-bold">{quote.service_name}</h3><p className="mt-1 break-all text-xs text-slate-500">Quote {quote.public_id} · Request {quote.request_receipt}</p>{quote.location && <p className="mt-2 text-sm text-slate-600">{quote.location}</p>}</div><span className="rounded-full bg-[#EAF5F2] px-3 py-1 text-sm font-bold text-ocean">{quote.status.replaceAll('_', ' ')}</span></div>
        <ul className="mt-4 divide-y divide-platinum border-y border-platinum">{quote.items.map((item, index) => <li key={`${quote.public_id}-${index}`} className="grid grid-cols-[1fr_auto] gap-3 py-3 text-sm"><span>{item.description}<small className="ml-2 text-slate-500">× {item.quantity}</small></span><span>{money(item.total_cents, quote.currency)}</span></li>)}</ul>
        <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-sm"><dt>Tax</dt><dd>{money(quote.tax_cents, quote.currency)}</dd><dt className="font-bold">Approved total</dt><dd className="font-bold">{money(quote.total_cents, quote.currency)}</dd><dt>Deposit in quote</dt><dd>{money(quote.deposit_cents, quote.currency)}</dd><dt>Expires</dt><dd>{new Date(quote.expires_at).toLocaleString()}</dd></dl>
        {canAccept && <button disabled={busy !== ''} onClick={() => accept(quote)} className="mt-5 rounded-xl bg-ocean px-5 py-3 font-bold text-white disabled:opacity-50">{busy === quote.public_id ? 'Accepting…' : 'Accept scope and price'}</button>}
        {expired && quote.status === 'sent' && <p className="mt-4 text-sm font-semibold text-red-700">This quote has expired. Contact support for an updated quote.</p>}
        {quote.status === 'accepted' && <p className="mt-4 text-sm font-semibold text-ocean">Accepted. The team will confirm scheduling separately. No payment was taken.</p>}
      </li>;
    })}</ul>}
  </section>;
}
