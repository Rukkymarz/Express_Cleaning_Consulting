'use client';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { jsonRequest } from '@/lib/api';

const publishableKey=process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const paymentsMode=process.env.NEXT_PUBLIC_PAYMENTS_MODE||'disabled';
const stripePromise=paymentsMode==='live'&&publishableKey ? loadStripe(publishableKey) : null;

export default function PayBookingPage() {
  const params=useParams<{bookingId:string}>();
  const [secret,setSecret]=useState(''); const [amount,setAmount]=useState<number|null>(null); const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
  const [booking,setBooking]=useState<{status:string;deposit_cents:number;balance_due_cents:number;hosted_invoice_url:string|null;payment_status:string|null;test_hosted_invoice_url:string|null;test_payment_status:string|null}|null>(null);
  useEffect(()=>{jsonRequest<{status:string;deposit_cents:number;balance_due_cents:number;hosted_invoice_url:string|null;payment_status:string|null;test_hosted_invoice_url:string|null;test_payment_status:string|null}>(`/account/bookings/${params.bookingId}`).then(setBooking).catch(e=>setError(e instanceof Error?e.message:'Booking unavailable'));},[params.bookingId]);
  async function begin(mode:'deposit'|'full'|'balance') {
    setBusy(true);setError('');
    try {const r=await jsonRequest<{client_secret:string;amount_cents:number}>('/payments/intents',{method:'POST',headers:{'Idempotency-Key':`booking-${params.bookingId}-${mode}`},body:JSON.stringify({booking_id:params.bookingId,mode})});setSecret(r.client_secret);setAmount(r.amount_cents);}
    catch(e){setError(e instanceof Error?e.message:'Payment is unavailable');}
    finally{setBusy(false);}
  }
  return <main className="mx-auto max-w-xl px-5 py-12"><Link href="/account" className="font-bold text-ocean underline">← Your bookings</Link><h1 className="mt-10 text-3xl font-bold">Pay for your confirmed booking</h1><p className="mt-3 text-slate-600">Submitting a free quote never charges you. Payment is offered only after your quote, date, and cleaner are approved.</p>{paymentsMode==='disabled'&&<p role="status" className="mt-6 rounded-xl border border-platinum bg-white p-4 text-slate-700">Online payments are not enabled yet.</p>}{paymentsMode==='test'&&<p role="status" className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">Test mode only—no real payment will be processed or counted toward your live balance.</p>}{error&&<p role="alert" className="mt-6 text-red-700">{error}</p>}{paymentsMode==='test'&&booking?.test_hosted_invoice_url&&<a href={booking.test_hosted_invoice_url} className="mt-6 inline-block rounded-xl bg-ocean px-5 py-3 font-bold text-white">Open Stripe test invoice</a>}{!secret&&paymentsMode==='live'&&publishableKey&&booking&&<div className="mt-8 flex flex-wrap gap-3">{booking.status==='ready_for_payment'&&<><button disabled={busy||!booking.deposit_cents} onClick={()=>begin('deposit')} className="rounded-xl bg-ocean px-5 py-3 font-bold text-white disabled:opacity-50">Pay approved deposit</button><button disabled={busy} onClick={()=>begin('full')} className="rounded-xl border border-ocean px-5 py-3 font-bold text-ocean disabled:opacity-50">Pay in full</button></>}{booking.status==='completed'&&booking.balance_due_cents>0&&<button disabled={busy} onClick={()=>begin('balance')} className="rounded-xl bg-ocean px-5 py-3 font-bold text-white disabled:opacity-50">Pay balance</button>}</div>}{secret&&paymentsMode==='live'&&stripePromise&&<div className="mt-8 rounded-2xl border border-platinum bg-white p-6"><p className="mb-6 text-xl font-bold">Amount due: ${((amount||0)/100).toFixed(2)}</p><Elements stripe={stripePromise} options={{clientSecret:secret}}><Checkout /></Elements></div>}</main>;
}
function Checkout() {
  const stripe=useStripe();const elements=useElements();const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  async function confirm(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();if(!stripe||!elements)return;setBusy(true);setError('');
    const result=await stripe.confirmPayment({elements,confirmParams:{return_url:`${window.location.origin}/account`}});
    if(result.error){setError(result.error.message||'Payment could not be completed');setBusy(false);}
  }
  return <form onSubmit={confirm}><PaymentElement />{error&&<p role="alert" className="mt-5 text-red-700">{error}</p>}<button disabled={!stripe||busy} className="mt-6 w-full rounded-xl bg-ocean p-3 font-bold text-white disabled:opacity-50">{busy?'Processing…':'Confirm payment'}</button><p className="mt-3 text-sm text-slate-600">Your booking status updates after secure payment confirmation.</p></form>;
}
