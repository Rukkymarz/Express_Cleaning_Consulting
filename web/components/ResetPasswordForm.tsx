'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { jsonRequest } from '@/lib/api';

export default function ResetPasswordForm() {
  const [token, setToken] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const nextToken = query.get('token') || '';
    setToken(nextToken);
    setInvalid(!nextToken || query.get('error') === 'INVALID_TOKEN');
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    const password = String(data.get('password') || '');
    const confirmation = String(data.get('confirmation') || '');
    if (password.length < 12) {
      setError('Use at least 12 characters.');
      setBusy(false);
      return;
    }
    if (password !== confirmation) {
      setError('The passwords do not match.');
      setBusy(false);
      return;
    }
    try {
      await jsonRequest('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ newPassword: password, token }),
      });
      setComplete(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to reset the password.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="mx-auto max-w-md px-5 py-14">
    <Link href="/login" className="font-bold text-ocean underline">← Sign in</Link>
    <h1 className="mt-10 text-3xl font-bold">Choose a new password</h1>
    {complete ? <div role="status" className="mt-8 rounded-xl border border-platinum bg-white p-5"><p className="font-semibold">Your password is ready.</p><Link href="/login" className="mt-5 inline-block font-bold text-ocean underline">Sign in</Link></div>
      : invalid ? <div role="alert" className="mt-8 rounded-xl border border-platinum bg-white p-5"><p>This password link is missing or expired.</p><Link href="/forgot-password" className="mt-5 inline-block font-bold text-ocean underline">Request another link</Link></div>
      : <form onSubmit={submit} className="mt-8 space-y-5">
        <div><label htmlFor="password" className="block font-semibold">New password</label><input id="password" name="password" type="password" minLength={12} required autoComplete="new-password" className="mt-2 w-full rounded-xl border border-platinum-dark p-3" /><p className="mt-2 text-sm text-slate-600">Use at least 12 characters.</p></div>
        <div><label htmlFor="confirmation" className="block font-semibold">Confirm new password</label><input id="confirmation" name="confirmation" type="password" minLength={12} required autoComplete="new-password" className="mt-2 w-full rounded-xl border border-platinum-dark p-3" /></div>
        {error && <p role="alert" className="text-red-700">{error}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-ocean p-3 font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save password'}</button>
      </form>}
  </main>;
}
