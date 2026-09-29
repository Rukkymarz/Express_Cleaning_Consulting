import type { Metadata } from 'next';
import BookingWizard from '@/components/BookingWizard';
import { Suspense } from 'react';
export const metadata: Metadata = { title: 'Request a free cleaning quote' };
export default function BookPage() { return <main className="min-h-screen bg-canvas px-4 py-8 md:py-12"><Suspense fallback={<div className="mx-auto max-w-3xl rounded-3xl bg-white p-10">Loading form…</div>}><BookingWizard /></Suspense></main>; }
