'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { jsonRequest } from '@/lib/api';

export default function ForgotPasswordForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      await jsonRequest('/auth/request-password-reset', {
        method: 'POST',
        body: JSON.stringify({
          email: String(data.get('email') || '').trim(),
          redirectTo: `${window.location.origin}/reset-password`,
        }),
      });
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to request a password link.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="mx-auto max-w-md px-5 py-14">
    <Link href="/login" className="font-bold text-ocean underline">← Sign in</Link>
    <h1 className="mt-10 text-3xl font-bold">Set or reset your password</h1>
    <p className="mt-3 text-slate-600">Enter your approved account email. If it matches an account, we’ll send a secure, time-limited link.</p>
    {sent ? <div role="status" className="mt-8 rounded-xl border border-platinum bg-white p-5">
      <p className="font-semibold">Check your inbox.</p>
      <p className="mt-2 text-slate-600">If the address matches an account, a password link is on its way. Check spam or promotions if it does not appear.</p>
      <Link href="/login" className="mt-5 inline-block font-bold text-ocean underline">Return to sign in</Link>
    </div> : <form onSubmit={submit} className="mt-8 space-y-5">
      <div><label htmlFor="email" className="block font-semibold">Email</label><input id="email" name="email" type="email" required autoComplete="email" className="mt-2 w-full rounded-xl border border-platinum-dark p-3" /></div>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <button disabled={busy} className="w-full rounded-xl bg-ocean p-3 font-bold text-white disabled:opacity-50">{busy ? 'Sending…' : 'Send secure link'}</button>
    </form>}
  </main>;
}
