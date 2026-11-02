'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { jsonRequest } from '@/lib/api';
import CustomerQuotes from '@/components/CustomerQuotes';

type Booking = { public_id:string; status:string; start_at:string; time_zone:string; balance_due_cents:number };
type Plan = { id:number; public_id:string; frequency:string; status:string; next_service_on:string|null; booking_id:string };
type Pending = { service_plan_id:number; action:string };
type Page<T> = { data:T[]; next_cursor:string|null };

export default function CustomerPortal() {
  const [bookings,setBookings]=useState<Booking[]>([]), [plans,setPlans]=useState<Plan[]>([]), [pending,setPending]=useState<Pending[]>([]);
  const [cursor,setCursor]=useState<string|null>(null), [loading,setLoading]=useState(true), [busy,setBusy]=useState(''), [error,setError]=useState(''), [message,setMessage]=useState('');
  async function load(initial=false, nextCursor?:string) {
    const [jobs,recurring]=await Promise.all([
      jsonRequest<Page<Booking>>(`/account/bookings${nextCursor?`?cursor=${encodeURIComponent(nextCursor)}`:''}`),
      jsonRequest<{plans:Plan[];pending_requests:Pending[]}>('/account/plans')
    ]);
    setBookings(old=>initial?jobs.data:[...old,...jobs.data]);
    setCursor(jobs.next_cursor);setPlans(recurring.plans);setPending(recurring.pending_requests);
  }
  useEffect(()=>{load(true).catch(e=>setError(e instanceof Error?e.message:'Unable to load account')).finally(()=>setLoading(false));},[]);
  async function requestChange(plan:Plan, action:'pause'|'resume'|'cancel') {
    setBusy(plan.public_id);setError('');setMessage('');
    try {
      await jsonRequest(`/account/plans/${plan.public_id}/change-requests`,{method:'POST',body:JSON.stringify({action})});
      await load(true);setMessage('Your request was sent for review. We will confirm the change.');
    } catch(e) {setError(e instanceof Error?e.message:'Unable to submit change');}
    finally {setBusy('');}
  }
  async function signOut() {
    await jsonRequest('/auth/sign-out',{method:'POST'}).catch(()=>{});
    window.location.href='/login';
  }
  return <main className="mx-auto max-w-6xl px-5 py-10">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <Link href="/" className="font-bold text-ocean underline">Express Cleaning Consult</Link>
      <div className="flex gap-3"><Link href="/book" className="rounded-xl bg-ocean px-4 py-3 font-bold text-white">Request cleaning</Link><button onClick={signOut} className="rounded-xl border border-platinum-dark px-4 py-3 font-semibold">Sign out</button></div>
    </header>
    <h1 className="mt-12 text-4xl font-bold">Your cleaning account</h1>
    <p className="mt-3 text-slate-600">Manage confirmed services and request changes to a recurring plan.</p>
    {loading&&<p role="status" className="mt-8">Loading account…</p>}
    {error&&<p role="alert" className="mt-7 rounded-lg bg-red-50 p-4 text-red-700">{error} <Link href="/login" className="underline">Sign in</Link></p>}
    {message&&<p role="status" className="mt-7 rounded-lg bg-[#EAF5F2] p-4 text-ocean">{message}</p>}
    {!loading&&!error&&<><div className="mt-10"><CustomerQuotes /></div><div className="mt-10 grid gap-9 lg:grid-cols-[1.3fr_.7fr]">
      <section aria-labelledby="bookings-title"><h2 id="bookings-title" className="text-2xl font-bold">Bookings and invoices</h2>
        {bookings.length===0?<p className="mt-5 rounded-2xl border border-platinum bg-white p-6">No confirmed bookings yet. A new quote request appears here after the team approves and schedules it.</p>:
          <ul className="mt-5 grid gap-4">{bookings.map(b=><li key={b.public_id} className="rounded-2xl border border-platinum bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-3"><strong>Booking {b.public_id}</strong><span className="rounded-full bg-[#EAF5F2] px-3 py-1 text-sm font-bold text-ocean">{b.status.replaceAll('_',' ')}</span></div>
            <p className="mt-3 text-slate-600">{new Date(b.start_at).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short',timeZone:b.time_zone})} · {b.time_zone}</p>
            <p className="mt-2 text-sm">Balance: ${(Math.max(0,b.balance_due_cents)/100).toFixed(2)}</p>
            <div className="mt-4 flex flex-wrap gap-5 text-sm font-bold text-ocean">
              <a href={`/api/v1/account/bookings/${encodeURIComponent(b.public_id)}/invoice.pdf`} className="underline underline-offset-4">Download invoice PDF</a>
              {(b.status==='ready_for_payment'||(b.status==='completed'&&b.balance_due_cents>0))&&<Link href={`/account/pay/${b.public_id}`} className="underline underline-offset-4">Pay balance</Link>}
            </div>
          </li>)}</ul>}
        {cursor&&<button onClick={()=>load(false,cursor).catch(e=>setError(e.message))} className="mt-5 rounded-xl border border-ocean px-5 py-3 font-bold text-ocean">Load more</button>}
      </section>
      <section aria-labelledby="plans-title"><h2 id="plans-title" className="text-2xl font-bold">Recurring service plans</h2>
        {plans.length===0?<p className="mt-5 rounded-2xl border border-platinum bg-white p-6 text-slate-600">No recurring plan has been confirmed yet.</p>:
          <ul className="mt-5 grid gap-4">{plans.map(p=>{const open=pending.find(x=>x.service_plan_id===p.id);return <li key={p.public_id} className="rounded-2xl border border-platinum bg-white p-6">
            <h3 className="font-bold capitalize">{p.frequency.replaceAll('_',' ')} cleaning</h3><p className="mt-2 text-sm text-slate-600">Status: {p.status}{p.next_service_on?` · Next: ${p.next_service_on}`:''}</p>
            {open?<p className="mt-3 text-sm font-semibold text-ocean">{open.action} request awaiting review</p>:
              <div className="mt-4 flex flex-wrap gap-3">{p.status==='active'&&<button disabled={busy===p.public_id} onClick={()=>requestChange(p,'pause')} className="font-bold text-ocean underline">Request pause</button>}{p.status==='paused'&&<button disabled={busy===p.public_id} onClick={()=>requestChange(p,'resume')} className="font-bold text-ocean underline">Request resume</button>}{p.status!=='cancelled'&&<button disabled={busy===p.public_id} onClick={()=>requestChange(p,'cancel')} className="font-bold text-ocean underline">Request cancellation</button>}</div>}
          </li>})}</ul>}
        <p className="mt-4 text-sm text-slate-600">Changes take effect after our team confirms them. This plan does not authorize automatic card charges.</p>
      </section>
    </div></>}
  </main>;
}
