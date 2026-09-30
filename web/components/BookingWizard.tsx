'use client';

import { cloneElement, isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { extras, services } from '@/lib/catalog';
import { jsonRequest } from '@/lib/api';

const US_STATES = [
  ['AL','Alabama'], ['AK','Alaska'], ['AZ','Arizona'], ['AR','Arkansas'], ['CA','California'], ['CO','Colorado'],
  ['CT','Connecticut'], ['DE','Delaware'], ['DC','District of Columbia'], ['FL','Florida'], ['GA','Georgia'],
  ['HI','Hawaii'], ['ID','Idaho'], ['IL','Illinois'], ['IN','Indiana'], ['IA','Iowa'], ['KS','Kansas'],
  ['KY','Kentucky'], ['LA','Louisiana'], ['ME','Maine'], ['MD','Maryland'], ['MA','Massachusetts'],
  ['MI','Michigan'], ['MN','Minnesota'], ['MS','Mississippi'], ['MO','Missouri'], ['MT','Montana'],
  ['NE','Nebraska'], ['NV','Nevada'], ['NH','New Hampshire'], ['NJ','New Jersey'], ['NM','New Mexico'],
  ['NY','New York'], ['NC','North Carolina'], ['ND','North Dakota'], ['OH','Ohio'], ['OK','Oklahoma'],
  ['OR','Oregon'], ['PA','Pennsylvania'], ['RI','Rhode Island'], ['SC','South Carolina'], ['SD','South Dakota'],
  ['TN','Tennessee'], ['TX','Texas'], ['UT','Utah'], ['VT','Vermont'], ['VA','Virginia'], ['WA','Washington'],
  ['WV','West Virginia'], ['WI','Wisconsin'], ['WY','Wyoming'],
] as const;

const schema = z.object({
  service_code: z.string().min(1, 'Choose a service'), square_feet: z.coerce.number<number>().int().min(0).max(1000000),
  property_type: z.enum(['residential','commercial','property_management','short_term_rental','construction','medical_office','retail','vehicle','other']),
  bedrooms: z.coerce.number<number>().int().min(0).max(99), bathrooms: z.coerce.number<number>().int().min(0).max(99),
  condition: z.enum(['light','moderate','heavy','unsure']), frequency: z.enum(['one_time','weekly','biweekly','monthly','recurring_commercial','as_needed']),
  street: z.string().min(2, 'Enter a street address'), unit: z.string(), city: z.string().min(2, 'Enter a city'),
  region: z.string().refine(value => US_STATES.some(([code]) => code === value), 'Choose a state'), postal_code: z.string().min(5, 'Enter a ZIP code'),
  preferred_start: z.string(), time_zone: z.string().min(1, 'Choose a time zone'),
  add_on_codes: z.array(z.string()), notes: z.string().max(3000),
  pets_on_site: z.boolean(), supplies_available: z.enum(['yes','no','some','unsure']), access_notes: z.string().max(2000),
  name: z.string().min(2, 'Enter your name'), email: z.email('Enter a valid email'), phone: z.string().min(10, 'Enter a phone number'),
  transactional_sms: z.boolean(), marketing_email: z.boolean(), marketing_sms: z.boolean(), review_email: z.boolean(),
});
type FormValues = z.infer<typeof schema>;
const stepFields: (keyof FormValues)[][] = [
  ['service_code','property_type','square_feet','bedrooms','bathrooms','condition','frequency'],
  ['street','city','region','postal_code','time_zone'], ['add_on_codes','notes','pets_on_site','supplies_available','access_notes'],
  ['name','email','phone','transactional_sms','marketing_email','marketing_sms','review_email'],
];
const labels = ['Your space', 'Where and when', 'Extra details', 'Review and send'];
const fieldClass = 'mt-2 min-h-12 w-full rounded-xl border border-platinum-dark bg-white px-4 py-3 text-ink focus:border-ocean focus:ring-2 focus:ring-ocean/20 aria-invalid:border-red-700';
const labelClass = 'block text-sm font-semibold text-ink';

function payload(v: FormValues) {
  return {
    service_code: v.service_code,
    address: { street: v.street, unit: v.unit || null, city: v.city.trim(), region: v.region.toUpperCase(), postal_code: v.postal_code, country: 'US' },
    property: { type:v.property_type, square_feet: v.square_feet || null, bedrooms: v.bedrooms, bathrooms: v.bathrooms, condition: v.condition, pets_on_site:v.pets_on_site, supplies_available:v.supplies_available },
    preferred_start: v.preferred_start || null,
    time_zone: v.time_zone, frequency: v.frequency, add_on_codes: v.add_on_codes,
    notes: v.notes, access_notes:v.access_notes, contact: { name: v.name, email: v.email, phone: v.phone },
    consent: { transactional_sms: v.transactional_sms, marketing_email: v.marketing_email, marketing_sms: v.marketing_sms, review_email: v.review_email },
  };
}

export default function BookingWizard() {
  const params = useSearchParams();
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [receipt, setReceipt] = useState('');
  const [estimate, setEstimate] = useState<number | null>(null);
  const requestKey = useRef(crypto.randomUUID());
  const heading = useRef<HTMLHeadingElement>(null);
  const { register, handleSubmit, trigger, watch, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema), mode: 'onBlur',
    defaultValues: { service_code: '', property_type:'residential', square_feet: 0, bedrooms: 0, bathrooms: 0, condition: 'unsure', frequency: 'one_time', street: '', unit: '', city: '', region: '', postal_code: '', preferred_start: '', time_zone: 'America/New_York', add_on_codes: [], notes: '', pets_on_site:false, supplies_available:'unsure', access_notes:'', name: '', email: '', phone: '', transactional_sms: false, marketing_email: false, marketing_sms: false, review_email: false },
  });
  useEffect(() => { const code = params.get('service'); if (code && services.some(s => s.code === code)) setValue('service_code', code); }, [params, setValue]);
  useEffect(() => { heading.current?.focus(); }, [step, receipt]);
  const addOns = watch('add_on_codes');
  async function next() {
    const valid = await trigger(stepFields[step], { shouldFocus: true }); if (!valid) return;
    if (step === 2) {
      try { const v = watch(); const result = await jsonRequest<{ eligible: boolean; estimate_cents?: number }>('/quotes/preview', { method: 'POST', body: JSON.stringify(payload(v)) }, { csrf: false }); setEstimate(result.eligible ? result.estimate_cents ?? null : null); }
      catch { setEstimate(null); }
    }
    setServerError(''); setStep(s => Math.min(s + 1, 3));
  }
  async function submit(v: FormValues) {
    setSubmitting(true); setServerError('');
    try {
      const result = await jsonRequest<{ request_id: string }>('/requests', { method: 'POST', headers: { 'Idempotency-Key': requestKey.current }, body: JSON.stringify(payload(v)) }, { csrf: false, networkErrorMessage: "We couldn't confirm that your request was received. Check your connection and try again—retries are safe and won't create a duplicate request." });
      setReceipt(result.request_id);
    } catch (error) { setServerError(error instanceof Error ? error.message : 'Please try again.'); }
    finally { setSubmitting(false); }
  }

  return <div className="mx-auto max-w-3xl"><Link href="/" className="font-bold text-ocean underline underline-offset-4">← Express Cleaning Consult</Link><div className="mt-7 overflow-hidden rounded-3xl border border-platinum bg-white shadow-[0_24px_70px_rgba(30,41,59,.07)]"><div className="bg-[#EAF5F2] px-6 py-7 md:px-10"><p className="text-sm font-bold uppercase tracking-[.16em] text-ocean">Free quote request</p><h1 ref={heading} tabIndex={-1} className="mt-2 text-3xl font-bold md:text-4xl">{receipt ? 'Request received' : labels[step]}</h1><p className="mt-3 text-slate-600">{receipt ? 'We’ll review your details and contact you about scope, pricing and availability.' : 'We confirm the price and appointment with you before scheduling. No payment is taken when you submit.'}</p></div>
    {receipt ? <div className="px-6 py-12 md:px-10"><p className="text-lg">Your reference number is <strong>{receipt}</strong>.</p><p className="mt-4 text-slate-600">Keep this number for your records. No payment has been taken.</p><Link href="/" className="mt-8 inline-block rounded-xl bg-ocean px-6 py-3 font-bold text-white">Back to home</Link></div> : <form onSubmit={handleSubmit(submit)} noValidate className="px-6 py-8 md:px-10">
      <p className="mb-3 text-sm font-semibold text-ocean sm:hidden">Step {step+1} of 4 — {labels[step]}</p><ol aria-label="Request progress" className="mb-8 grid grid-cols-4 gap-2">{labels.map((label,i)=><li key={label} className={`rounded-lg border px-2 py-2 text-center text-xs font-semibold md:text-sm ${i === step ? 'border-ocean bg-[#EAF5F2] text-ocean' : 'border-platinum text-slate-500'}`} aria-current={i===step?'step':undefined}>{i+1}. <span className="hidden sm:inline">{label}</span></li>)}</ol>
      <motion.div key={step} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .2 }}>
        {step===0 && <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2"><label htmlFor="service" className={labelClass}>What needs cleaning?</label><select id="service" className={fieldClass} aria-invalid={!!errors.service_code} aria-describedby={errors.service_code?'service-error':undefined} {...register('service_code')}><option value="">Choose a service</option>{services.map(s=><option key={s.code} value={s.code}>{s.name}</option>)}</select>{errors.service_code && <p id="service-error" className="mt-1 text-sm text-red-700">{errors.service_code.message}</p>}</div>
          <Field label="Property type" id="property-type"><select id="property-type" className={fieldClass} {...register('property_type')}><option value="residential">Home</option><option value="commercial">Commercial</option><option value="property_management">Apartment or property management</option><option value="short_term_rental">Airbnb or short-term rental</option><option value="construction">Construction or renovation</option><option value="medical_office">Medical or professional office</option><option value="retail">Retail or venue</option><option value="vehicle">Vehicle</option><option value="other">Other</option></select></Field>
          <Field label="Approximate square feet (if applicable)" id="size" error={errors.square_feet?.message}><input id="size" type="number" min="0" className={fieldClass} {...register('square_feet')} /></Field>
          <Field label="Bedrooms" id="beds" error={errors.bedrooms?.message}><input id="beds" type="number" min="0" className={fieldClass} {...register('bedrooms')} /></Field>
          <Field label="Bathrooms" id="baths" error={errors.bathrooms?.message}><input id="baths" type="number" min="0" className={fieldClass} {...register('bathrooms')} /></Field>
          <Field label="Current condition" id="condition"><select id="condition" className={fieldClass} {...register('condition')}><option value="unsure">Not sure</option><option value="light">Light</option><option value="moderate">Moderate</option><option value="heavy">Heavy</option></select></Field>
          <Field label="How often?" id="frequency"><select id="frequency" className={fieldClass} {...register('frequency')}><option value="one_time">One time</option><option value="weekly">Weekly</option><option value="biweekly">Every two weeks</option><option value="monthly">Monthly</option><option value="recurring_commercial">Recurring commercial</option><option value="as_needed">As needed</option></select></Field>
        </div>}
        {step===1 && <div className="grid gap-5 sm:grid-cols-2"><Field label="Street address" id="street" error={errors.street?.message}><input id="street" autoComplete="street-address" className={fieldClass} {...register('street')} /></Field><Field label="Unit (optional)" id="unit"><input id="unit" className={fieldClass} {...register('unit')} /></Field><Field label="City" id="city" error={errors.city?.message}><input id="city" autoComplete="address-level2" className={fieldClass} {...register('city')} /></Field><Field label="State" id="region" error={errors.region?.message}><select id="region" autoComplete="address-level1" className={fieldClass} aria-invalid={!!errors.region} aria-describedby={errors.region?'region-error':undefined} {...register('region')}><option value="">Choose a state</option>{US_STATES.map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></Field><Field label="ZIP code" id="zip" error={errors.postal_code?.message}><input id="zip" autoComplete="postal-code" className={fieldClass} {...register('postal_code')} /></Field><Field label="Preferred date and time (optional)" id="date"><input id="date" type="datetime-local" className={fieldClass} {...register('preferred_start')} /></Field><Field label="Property time zone" id="zone"><select id="zone" className={fieldClass} {...register('time_zone')}><option value="America/New_York">Eastern</option><option value="America/Chicago">Central</option><option value="America/Denver">Mountain</option><option value="America/Phoenix">Arizona</option><option value="America/Los_Angeles">Pacific</option><option value="America/Anchorage">Alaska</option><option value="Pacific/Honolulu">Hawaii</option></select></Field><p className="self-end text-sm text-slate-600">The date is a preference until our team confirms it.</p></div>}
        {step===2 && <div className="space-y-6"><fieldset><legend className={labelClass}>Would you like any extras?</legend><div className="mt-4 grid gap-3 sm:grid-cols-2">{extras.map(extra=><label key={extra.code} className="flex gap-3 rounded-xl border border-platinum p-4 text-sm font-medium"><input type="checkbox" className="accent-ocean" checked={addOns.includes(extra.code)} onChange={e=>setValue('add_on_codes',e.target.checked?[...addOns,extra.code]:addOns.filter(c=>c!==extra.code))} />{extra.name}</label>)}</div></fieldset><label className="flex gap-3 text-sm font-semibold"><input type="checkbox" className="accent-ocean" {...register('pets_on_site')} />Pets will be on site</label><Field label="Are cleaning supplies available?" id="supplies"><select id="supplies" className={fieldClass} {...register('supplies_available')}><option value="unsure">Not sure</option><option value="yes">Yes</option><option value="no">No</option><option value="some">Some</option></select></Field><Field label="Parking or access instructions (optional)" id="access" error={errors.access_notes?.message}><textarea id="access" rows={3} className={fieldClass} {...register('access_notes')} /></Field><Field label="Anything else we should know? (optional)" id="notes" error={errors.notes?.message}><textarea id="notes" rows={5} className={fieldClass} placeholder="Special surfaces, condition or the scope you need" {...register('notes')} /></Field></div>}
        {step===3 && <div className="space-y-5"><div className="rounded-xl border border-platinum bg-canvas p-5"><h2 className="font-bold">Your request</h2><p className="mt-2 text-sm text-slate-600">{services.find(s=>s.code===watch('service_code'))?.name} · {watch('city')}, {watch('region').toUpperCase()} · {watch('frequency').replaceAll('_',' ')}</p>{estimate!==null && <p className="mt-3 font-semibold text-ocean">Preliminary estimate: ${(estimate/100).toFixed(2)}. Final price is confirmed after review.</p>}<p className="mt-3 text-sm text-slate-600">No appointment or payment is confirmed with this request.</p></div><div className="grid gap-5 sm:grid-cols-2"><Field label="Name" id="name" error={errors.name?.message}><input id="name" autoComplete="name" className={fieldClass} {...register('name')} /></Field><Field label="Email" id="email" error={errors.email?.message}><input id="email" type="email" autoComplete="email" className={fieldClass} {...register('email')} /></Field><Field label="Phone" id="phone" error={errors.phone?.message}><input id="phone" type="tel" autoComplete="tel" className={fieldClass} {...register('phone')} /></Field></div><fieldset className="space-y-3"><legend className={labelClass}>Contact preferences</legend><label className="flex gap-3 text-sm"><input type="checkbox" className="accent-ocean" {...register('transactional_sms')} />Text me updates about this request</label><label className="flex gap-3 text-sm"><input type="checkbox" className="accent-ocean" {...register('marketing_email')} />Email me occasional offers</label><label className="flex gap-3 text-sm"><input type="checkbox" className="accent-ocean" {...register('marketing_sms')} />Text me occasional offers</label><label className="flex gap-3 text-sm"><input type="checkbox" className="accent-ocean" {...register('review_email')} />Email me once after service to ask for feedback or a review</label></fieldset></div>}
      </motion.div>
      {serverError && <p role="alert" aria-live="assertive" className="mt-6 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-800">{serverError}</p>}
      <div className="mt-9 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between"><button type="button" onClick={()=>setStep(s=>Math.max(0,s-1))} disabled={step===0 || submitting} className="min-h-12 w-full rounded-xl border border-platinum-dark px-5 py-3 font-bold disabled:opacity-40 sm:w-auto">Back</button>{step<3?<button type="button" onClick={next} className="min-h-12 w-full rounded-xl bg-ocean px-7 py-3 font-bold text-white hover:bg-[#05584C] sm:w-auto">Continue</button>:<button type="submit" disabled={submitting} className="min-h-12 w-full rounded-xl bg-ocean px-7 py-3 font-bold text-white disabled:opacity-50 sm:w-auto">{submitting?'Sending…':'Request my free quote'}</button>}</div>
    </form>}
  </div></div>;
}

function Field({label,id,error,children}:{label:string;id:string;error?:string;children:ReactNode}) {
  const control=isValidElement<Record<string, unknown>>(children)
    ? cloneElement(children, {'aria-invalid':error?true:undefined,'aria-describedby':error?`${id}-error`:undefined})
    : children;
  return <div><label className={labelClass} htmlFor={id}>{label}</label>{control}{error&&<p id={`${id}-error`} role="alert" className="mt-1 text-sm text-red-700">{error}</p>}</div>;
}
