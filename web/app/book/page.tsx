import type { Metadata } from 'next';
import BookingWizard from '@/components/BookingWizard';
import { Suspense } from 'react';
export const metadata: Metadata = { title: 'Request a Free Cleaning Quote', description: 'Request a free residential or commercial cleaning quote. No card is required and no payment is taken. We confirm scope, local availability and price before booking.', alternates: { canonical: '/book' }, openGraph: { title: 'Request a Free Cleaning Quote | Express Cleaning Consult', description: 'Tell us what you need. We confirm scope, availability and price before booking.', url: '/book' } };
export default function BookPage() { return <main className="min-h-screen bg-canvas px-4 py-8 md:py-12"><Suspense fallback={<div className="mx-auto max-w-3xl rounded-3xl bg-white p-10">Loading form…</div>}><BookingWizard /></Suspense></main>; }
