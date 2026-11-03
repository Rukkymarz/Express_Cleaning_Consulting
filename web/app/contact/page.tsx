import type { Metadata } from 'next';
import Link from 'next/link';
import PublicShell from '@/components/PublicShell';
import { contact } from '@/lib/launch';

export const metadata: Metadata = {
  title: 'Contact Express Cleaning Consult',
  description: 'Call or email Express Cleaning Consult for quote support, service questions, property-manager requests and existing booking help.',
  alternates: { canonical: '/contact' },
  openGraph: { title: 'Contact Express Cleaning Consult', description: 'Call, email or request a free cleaning quote.', url: '/contact' },
};

const schema = {
  '@context': 'https://schema.org',
  '@type': 'ContactPage',
  name: 'Contact Express Cleaning Consult',
  url: 'https://www.expresscleaningconsult.com/contact',
  mainEntity: {
    '@type': 'Organization',
    '@id': 'https://www.expresscleaningconsult.com/#organization',
    name: 'Express Cleaning Consult',
    telephone: contact.phone,
    email: contact.email,
  },
};

export default function ContactPage() {
  return <PublicShell>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }} />
    <span className="ecc-eyebrow">CONTACT & SUPPORT</span>
    <h1>A real conversation,<br/><em>before anything is booked.</em></h1>
    <p className="ecc-page-lead">Ask about a new quote, an existing request, vendor setup or partner opportunities. The public quote form is free and never takes payment.</p>
    <div className="ecc-feature-grid">
      <article><h2>Call our team</h2><p>Talk through your cleaning request or ask about an existing quote.</p><a className="ecc-text-link" href={`tel:${contact.phone}`}>{contact.displayPhone} →</a></article>
      <article><h2>Email support</h2><p>Send service questions or include your request receipt when following up.</p><a className="ecc-text-link" href={`mailto:${contact.email}`}>{contact.email} →</a></article>
      <article><h2>Request a free quote</h2><p>Share your service, state and ZIP code. We confirm local availability and price first.</p><Link className="ecc-text-link" href="/book">Start my quote →</Link></article>
    </div>
    <section className="ecc-panel"><h2>Business and property inquiries</h2><p>Property teams can request vendor setup for turnovers, recurring needs and overflow coverage. Cleaning professionals can apply to the partner network.</p><p><Link href="/property-managers">Property managers and hosts →</Link></p><p><Link href="/partner-cleaners">Partner cleaner application →</Link></p></section>
  </PublicShell>;
}
