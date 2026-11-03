'use client';
import { useState } from 'react';
import Link from 'next/link';
import { jsonRequest } from '@/lib/api';
export default function LoginForm() {
  const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
  async function login(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError('');
    const data=new FormData(e.currentTarget);
    try {
      await jsonRequest('/auth/sign-in/email',{method:'POST',body:JSON.stringify({email:String(data.get('email')||''),password:String(data.get('password')||''),rememberMe:true})});
      const session = await jsonRequest<{redirect_to:'/admin'|'/account'}>('/session');
      window.location.replace(session.redirect_to);
    }
    catch(e) { setError(e instanceof Error?e.message:'Unable to sign in'); }
    finally {setBusy(false);}
  }
  return <main className="mx-auto max-w-md px-5 py-14"><Link href="/" className="font-bold text-ocean underline">← Home</Link><h1 className="mt-10 text-3xl font-bold">Sign in</h1><p className="mt-2 text-slate-600">Access your bookings or staff workspace.</p><form onSubmit={login} className="mt-8 space-y-5"><div><label htmlFor="email" className="block font-semibold">Email</label><input id="email" name="email" type="email" required autoComplete="email" className="mt-2 w-full rounded-xl border border-platinum-dark p-3" /></div><div><div className="flex items-center justify-between gap-4"><label htmlFor="password" className="font-semibold">Password</label><Link href="/forgot-password" className="text-sm font-semibold text-ocean underline">Set or reset password</Link></div><input id="password" name="password" type="password" required autoComplete="current-password" className="mt-2 w-full rounded-xl border border-platinum-dark p-3" /></div>{error&&<p role="alert" className="text-red-700">{error}</p>}<button disabled={busy} className="w-full rounded-xl bg-ocean p-3 font-bold text-white disabled:opacity-50">{busy?'Signing in…':'Sign in'}</button></form></main>;
}
