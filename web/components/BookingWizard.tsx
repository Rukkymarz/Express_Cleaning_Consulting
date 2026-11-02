'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { services } from '@/lib/catalog';
import { jsonRequest } from '@/lib/api';
import { trackQuoteLead } from '@/lib/tracking';
import { contact, offer } from '@/lib/launch';
import { US_STATE_CODES, US_STATES } from '@/lib/us-states';
import Guarantee from './Guarantee';

const schema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(150),
  phone: z.string().trim().max(32).refine(value => /^\+?[0-9().\s-]+$/.test(value) && /^(?:1)?[2-9]\d{2}[2-9]\d{6}$/.test(value.replace(/\D/g, '')), 'Enter a valid US phone number'),
  service_code: z.string().refine(value => services.some(service => service.code === value), 'Choose a service'),
  region: z.string().refine(value => US_STATE_CODES.has(value), 'Choose a state'),
  postal_code: z.string().trim().regex(/^\d{5}(-\d{4})?$/, 'Enter a valid ZIP code'),
  email: z.union([z.email('Enter a valid email'), z.literal('')]),
  notes: z.string().trim().max(3000, 'Keep notes under 3,000 characters'),
});
type FormValues = z.infer<typeof schema>;
const inputClass = 'mt-2 min-h-12 w-full rounded-xl border border-platinum-dark bg-white px-4 py-3 text-ink focus:border-ocean focus:ring-2 focus:ring-ocean/20 aria-invalid:border-red-700';
const labelClass = 'block text-sm font-semibold text-ink';

export default function BookingWizard() {
  const params = useSearchParams();
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [receipt, setReceipt] = useState('');
  const requestKey = useRef(crypto.randomUUID());
  const heading = useRef<HTMLHeadingElement>(null);
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema), mode: 'onBlur',
    defaultValues: { name: '', phone: '', service_code: '', region: '', postal_code: '', email: '', notes: '' },
  });
  useEffect(() => {
    const code = params.get('service');
    if (code && services.some(service => service.code === code)) setValue('service_code', code);
    const zip = params.get('zip');
    if (zip && /^\d{5}(-\d{4})?$/.test(zip)) setValue('postal_code', zip);
    const state = params.get('state')?.toUpperCase();
    if (state && US_STATE_CODES.has(state)) setValue('region', state);
    try { const email = sessionStorage.getItem('ecc_offer_email'); if (email) setValue('email', email); } catch {}
  }, [params, setValue]);
  useEffect(() => { if (receipt) heading.current?.focus(); }, [receipt]);
  function requestedOffer() {
    if (params.get('offer') === offer.code) return offer.code;
    try { return sessionStorage.getItem('ecc_offer') === offer.code ? offer.code : null; } catch { return null; }
  }
  async function submit(values: FormValues) {
    if (submitting) return;
    setSubmitting(true); setServerError('');
    try {
      const result = await jsonRequest<{ request_id: string }>('/requests', {
        method: 'POST', headers: { 'Idempotency-Key': requestKey.current },
        body: JSON.stringify({ request_kind: 'callback', service_code: values.service_code,
          address: { region: values.region, postal_code: values.postal_code },
          contact: { name: values.name, phone: values.phone, email: values.email || null },
          notes: values.notes, promotion_code: requestedOffer() }),
      }, { session: false, networkErrorMessage: `We couldn't confirm your request was received. Please retry, or call ${contact.displayPhone}. Retrying won't create a duplicate request.` });
      setReceipt(result.request_id);
      try { trackQuoteLead(result.request_id, values.service_code); } catch { /* Tracking must not interrupt a saved request. */ }
    } catch (error) { setServerError(error instanceof Error ? error.message : 'Please try again or call our team.'); }
    finally { setSubmitting(false); }
  }
  const errorFor = (field: keyof FormValues) => errors[field] ? <p id={`${field}-error`} role="alert" className="mt-1 text-sm text-red-700">{errors[field]?.message}</p> : null;
  const invalid = (field: keyof FormValues) => ({ 'aria-invalid': !!errors[field], 'aria-describedby': errors[field] ? `${field}-error` : undefined });

  return <div className="mx-auto max-w-2xl">
    <Link href="/" className="font-bold text-ocean underline underline-offset-4">← Express Cleaning Consult</Link>
    <section className="mt-7 overflow-hidden rounded-3xl border border-platinum bg-white shadow-[0_24px_70px_rgba(30,41,59,.07)]">
      <div className="bg-[#EAF5F2] px-6 py-7 sm:px-8">
        <p className="text-sm font-bold uppercase tracking-[.16em] text-ocean">Free quote · One simple step</p>
        <h1 ref={heading} tabIndex={-1} className="mt-2 text-3xl font-bold sm:text-4xl">{receipt ? 'Request received' : 'Let’s talk about your clean.'}</h1>
        <p className="mt-3 text-slate-600">{receipt ? 'Our team will call you to discuss your cleaning needs and help arrange your appointment.' : 'Leave your number and we’ll call to discuss the details, check availability and prepare your free quote.'}</p>
      </div>
      <div className="px-6 py-6 sm:px-8">
        <a href={`tel:${contact.phone}`} className="flex min-h-12 flex-wrap items-center justify-between gap-2 rounded-xl border border-ocean/30 bg-[#F5FAF8] px-4 py-3 font-bold text-ocean"><span>Prefer to call us?</span><span>{contact.displayPhone} ↗</span></a>
        {receipt ? <div role="status" className="mt-6 space-y-4">
          <p>Your reference number is <strong className="break-all">{receipt}</strong>.</p>
          <p className="text-slate-600">No payment has been taken and your appointment is not yet confirmed. We’ll agree on the scope, price and date with you by phone.</p>
          <Link href="/" className="inline-block rounded-xl bg-ocean px-6 py-3 font-bold text-white">Back to home</Link>
        </div> : <form onSubmit={handleSubmit(submit)} noValidate className="mt-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <div><label htmlFor="quote-name" className={labelClass}>Your name</label><input id="quote-name" autoComplete="name" required maxLength={150} className={inputClass} {...register('name')} {...invalid('name')} />{errorFor('name')}</div>
            <div><label htmlFor="quote-phone" className={labelClass}>Phone number</label><input id="quote-phone" type="tel" autoComplete="tel" required maxLength={32} className={inputClass} {...register('phone')} {...invalid('phone')} />{errorFor('phone')}</div>
            <div><label htmlFor="quote-service" className={labelClass}>Service needed</label><select id="quote-service" required className={inputClass} {...register('service_code')} {...invalid('service_code')}><option value="">Choose a service</option>{services.map(service => <option key={service.code} value={service.code}>{service.name}</option>)}</select>{errorFor('service_code')}</div>
            <div><label htmlFor="quote-state" className={labelClass}>State</label><select id="quote-state" autoComplete="address-level1" required className={inputClass} {...register('region')} {...invalid('region')}><option value="">Choose a state</option>{US_STATES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select>{errorFor('region')}</div>
            <div><label htmlFor="quote-zip" className={labelClass}>ZIP code</label><input id="quote-zip" inputMode="numeric" autoComplete="postal-code" required maxLength={10} className={inputClass} {...register('postal_code')} {...invalid('postal_code')} />{errorFor('postal_code')}</div>
            <div className="sm:col-span-2"><label htmlFor="quote-email" className={labelClass}>Email (optional)</label><input id="quote-email" type="email" autoComplete="email" maxLength={255} className={inputClass} {...register('email')} {...invalid('email')} />{errorFor('email')}</div>
            <div className="sm:col-span-2"><label htmlFor="quote-notes" className={labelClass}>Anything to add? (optional)</label><textarea id="quote-notes" rows={2} maxLength={3000} placeholder="For example, move-out cleaning or a preferred day to call." className={inputClass} {...register('notes')} {...invalid('notes')} /></div>
          </div>
          {serverError && <p role="alert" aria-live="assertive" className="mt-5 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-800">{serverError}</p>}
          <button type="submit" disabled={submitting} className="mt-6 min-h-12 w-full rounded-xl bg-ocean px-5 py-3 font-bold text-white hover:bg-[#05584C] disabled:opacity-50">{submitting ? 'Sending…' : 'Call me for a free quote'}</button>
          <div className="mt-3"><Guarantee /></div>
          <p className="mt-3 text-sm text-slate-600">No card required. No payment taken. We’ll collect your address and other details during the call.</p>
          <p className="mt-3 text-xs text-slate-500">By submitting, you ask Express Cleaning Consult to call you about this request under our <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy Policy</Link>. This does not sign you up for marketing calls or texts.</p>
        </form>}
      </div>
    </section>
  </div>;
}
