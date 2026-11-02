'use client';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { jsonRequest } from '@/lib/api';

const paymentsMode=process.env.NEXT_PUBLIC_PAYMENTS_MODE==='test'?'test':'disabled';

export default function PayBookingPage() {
  const params=useParams<{bookingId:string}>();
  const [error,setError]=useState('');
  const [booking,setBooking]=useState<{status:string;deposit_cents:number;balance_due_cents:number;hosted_invoice_url:string|null;payment_status:string|null;test_hosted_invoice_url:string|null;test_payment_status:string|null}|null>(null);
  useEffect(()=>{jsonRequest<{status:string;deposit_cents:number;balance_due_cents:number;hosted_invoice_url:string|null;payment_status:string|null;test_hosted_invoice_url:string|null;test_payment_status:string|null}>(`/account/bookings/${params.bookingId}`).then(setBooking).catch(e=>setError(e instanceof Error?e.message:'Booking unavailable'));},[params.bookingId]);
  return <main className="mx-auto max-w-xl px-5 py-12"><Link href="/account" className="font-bold text-ocean underline">← Your bookings</Link><h1 className="mt-10 text-3xl font-bold">Payment for your confirmed booking</h1><p className="mt-3 text-slate-600">Submitting a free quote never charges you. A payment option is created only after your quote, date, and cleaner are approved.</p>{paymentsMode==='disabled'&&<p role="status" className="mt-6 rounded-xl border border-platinum bg-white p-4 text-slate-700">Online payments are not enabled. No card will be charged from this website.</p>}{paymentsMode==='test'&&<p role="status" className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">Test mode only—no real payment will be processed or counted toward your live balance.</p>}{error&&<p role="alert" className="mt-6 text-red-700">{error}</p>}{paymentsMode==='test'&&booking?.test_hosted_invoice_url&&<a href={booking.test_hosted_invoice_url} rel="noreferrer" className="mt-6 inline-block rounded-xl bg-ocean px-5 py-3 font-bold text-white">Open Stripe test invoice</a>}{paymentsMode==='test'&&booking&&!booking.test_hosted_invoice_url&&<p className="mt-6 rounded-xl border border-platinum bg-white p-4 text-slate-700">No test invoice has been issued for this approved booking.</p>}</main>;
}
