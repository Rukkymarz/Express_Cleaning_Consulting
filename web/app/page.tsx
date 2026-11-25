import './cinema.css';
import type { Metadata } from 'next';
import WebsiteTools from '@/components/WebsiteTools';
import WelcomeOffer from '@/components/WelcomeOffer';
import BeforeAfterGallery from '@/components/BeforeAfterGallery';
import HeroReel from '@/components/HeroReel';
import ServiceIndex from '@/components/ServiceIndex';
import CinemaEffects from '@/components/CinemaEffects';
import { publishedProjectPairs } from '@/lib/gallery';
import { serviceGuides } from '@/lib/services';
import { faqs, guarantee, contact } from '@/lib/launch';
import { instagramUrl, facebookUrl } from '@/lib/social';
import { media } from '@/lib/reel';

const site = 'https://www.expresscleaningconsult.com';
const description = 'Free online quotes for house, deep, office, move-out, Airbnb turnover and post-construction cleaning nationwide, done by vetted local partner crews.';

export const metadata: Metadata = {
  title: { absolute: 'Cleaning Services Nationwide | Express Cleaning Consult' },
  description,
  keywords: ['free cleaning quote', 'house cleaning services', 'deep cleaning', 'office janitorial cleaning', 'Airbnb turnover cleaning', 'move-in move-out cleaning', 'post construction cleaning', 'pressure washing services', 'junk removal services', 'nationwide cleaning services', 'apartment turnover cleaning', 'local cleaning company'],
  alternates: { canonical: '/' },
  openGraph: { type: 'website', url: '/', title: 'Spotless, in motion | Express Cleaning Consult', description, images: [{ url: '/og-cinematic.jpg', width: 1200, height: 630, alt: 'Express Cleaning Consult: Spotless, in motion' }], siteName: 'Express Cleaning Consult' },
};

const structuredData = { '@context': 'https://schema.org', '@graph': [
  { '@type': 'Organization', '@id': `${site}/#organization`, name: 'Express Cleaning Consult', url: `${site}/`, logo: `${site}/icon`, telephone: contact.phone, email: contact.email, areaServed: { '@type': 'Country', name: 'United States' },
    contactPoint: [{ '@type': 'ContactPoint', telephone: contact.phone, email: contact.email, contactType: 'customer support', areaServed: 'US', availableLanguage: 'English' }],
    sameAs: [instagramUrl, facebookUrl],
    hasOfferCatalog: { '@type': 'OfferCatalog', name: 'Cleaning and property services', itemListElement: serviceGuides.map(s => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: s.name, url: `${site}/services/${s.slug}`, provider: { '@id': `${site}/#organization` }, areaServed: 'US' } })) } },
  { '@type': 'WebSite', '@id': `${site}/#website`, name: 'Express Cleaning Consult', url: `${site}/`, publisher: { '@id': `${site}/#organization` } },
  { '@type': 'FAQPage', '@id': `${site}/#faq`, mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
] };

const marquee = ['House cleaning', 'Deep cleaning', 'Office & janitorial', 'Move-in / move-out', 'Airbnb turnover', 'Post-construction', 'Pressure washing', 'Junk removal'];
const steps = [
  ['Tell us what you need', 'Choose a service and enter your ZIP code, then leave your name and number. It takes about a minute.'],
  ['Get a clear quote', 'We call to walk through the details, confirm local crew availability and prepare your free quote.'],
  ['Book with confidence', 'Approve the scope and price first. Only then do we schedule your clean with a vetted local partner.'],
];
const promises = [
  ['Free quote', 'Every job is priced for your exact space. No card required.'],
  ['Scope agreed first', 'You approve what gets cleaned and the price before booking.'],
  ['Make-it-right promise', guarantee],
];

function Brand() {
  return <a href="/" className="cx-brand" aria-label="Express Cleaning Consult home"><b>EXPRESS</b><small>CLEANING CONSULT</small><i /><i /></a>;
}
function bg(m: { src: string; poster: string }) {
  return <video data-lazy muted loop playsInline preload="none" aria-hidden="true" poster={m.poster} src={m.src} />;
}

export default function Home() {
  return <div className="cx">
    <CinemaEffects />
    <header className="cx-header"><div className="cx-wrap cx-nav">
      <Brand />
      <nav aria-label="Main navigation">
        <a href="#services">Services</a><a href="#process">How it works</a><a href="#teams">Property teams</a><a href="#faq">FAQ</a>
        <a href={`tel:${contact.phone}`} className="cx-tel">{contact.displayPhone}</a>
        <a href="/book" className="cx-btn" data-mag>Free quote <span aria-hidden="true">↗</span></a>
      </nav>
    </div></header>

    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />
      <HeroReel />

      <div className="cx-marquee" aria-hidden="true"><div>{[...marquee, ...marquee].map((w, i) => <span key={i}>{w}</span>)}</div></div>

      <section id="services" className="cx-section"><div className="cx-wrap">
        <div className="cx-svc-head cx-reveal">
          <div><p className="cx-kicker">What we clean</p><h2>Every space,<br /><em>handled.</em></h2></div>
          <p>From weekly home care to post-construction dust, each job is quoted for your exact space, then matched to a trusted local crew.</p>
        </div>
        <ServiceIndex />
        <p className="cx-more"><a href="/services">Explore all cleaning services →</a></p>
      </div></section>

      <section id="process" className="cx-section cx-process"><div className="cx-wrap cx-proc">
        <div className="cx-sticky cx-reveal">
          <p className="cx-kicker">How it works</p><h2>Three steps.<br /><em>No surprises.</em></h2>
          <p>Good cleaning starts with a clear conversation. You tell us what matters, we confirm the plan, then the crew shows up ready.</p>
          <a href="/book" className="cx-btn" data-mag>Start my quote</a>
        </div>
        <ol className="cx-steps">{steps.map(([h, p], i) => <li key={h} className="cx-reveal"><span className="cx-k">{['i', 'ii', 'iii'][i]}</span><div><h3>{h}</h3><p>{p}</p></div></li>)}</ol>
      </div></section>

      <section className="cx-section cx-tight"><div className="cx-wrap cx-trust cx-reveal">
        {promises.map(([b, p]) => <div key={b}><b>{b}</b><p>{p}</p></div>)}
      </div></section>

      {publishedProjectPairs().length > 0 && <BeforeAfterGallery theme="cinema" />}

      <section id="teams" className="cx-section"><div className="cx-wrap">
        <div className="cx-reveal cx-gap"><p className="cx-kicker">Built for scale</p><h2>One contact.<br /><em>Every turnover.</em></h2></div>
        <div className="cx-aud">
          <article className="cx-card cx-reveal">{bg(media.property)}
            <h3>Property managers &amp; hosts</h3><p>Unit resets, Airbnb turnovers, rush requests and overflow coverage under one vendor relationship.</p>
            <div className="cx-links"><a className="cx-btn" href="/property-managers">Request vendor setup</a></div></article>
          <article className="cx-card cx-reveal">{bg(media.partner)}
            <h3>Partner cleaners</h3><p>Independent cleaners and crews: join our network and receive quoted, scoped jobs in your area.</p>
            <div className="cx-links"><a className="cx-btn" href="/partner-cleaners">Become a partner</a><a className="cx-btn ghost" href="/refer-a-client">Refer a client</a></div></article>
        </div>
      </div></section>

      <section id="faq" className="cx-section cx-top0"><div className="cx-wrap cx-faq">
        <div className="cx-reveal"><p className="cx-kicker">Before you book</p><h2>Questions,<br /><em>answered.</em></h2>
          <p className="cx-muted"><a href={`mailto:${contact.email}`}>Have another question? →</a></p></div>
        <div>{faqs.map(([q, a]) => <details key={q} className="cx-reveal"><summary>{q}<span aria-hidden="true">+</span></summary><p>{a}</p></details>)}</div>
      </div></section>

      <section id="contact" className="cx-contact">{bg(media.contact)}<div className="cx-wrap cx-reveal">
        <p className="cx-kicker cx-center">Make room for a fresh start</p>
        <h2>Let’s make it<br /><em>spotless.</em></h2>
        <div className="cx-row"><a className="cx-btn" data-mag href="/book">Get a free quote</a><a className="cx-btn ghost" href={`tel:${contact.phone}`}>Call {contact.displayPhone}</a></div>
        <p className="cx-muted">{contact.email} · {contact.displayPhone}</p>
      </div></section>
    </main>

    <footer className="cx-footer"><div className="cx-wrap">
      <div className="cx-fgrid">
        <div><Brand /><p className="cx-muted">Thoughtful cleaning for the places that matter to you. Nationwide requests, local crews.</p></div>
        <div className="cx-col"><h4>Explore</h4><a href="/services">Services</a><a href="#process">How it works</a><a href="/book">Request a quote</a><a href="/property-managers">Property managers &amp; hosts</a><a href="/partner-cleaners">Partner cleaners</a><a href="/refer-a-client">Refer a client</a></div>
        <div className="cx-col"><h4>Stay connected</h4><a href={`tel:${contact.phone}`}>{contact.displayPhone}</a><a href={`mailto:${contact.email}`}>{contact.email}</a><a href={instagramUrl} target="_blank" rel="noopener noreferrer">Instagram ↗</a><a href={facebookUrl} target="_blank" rel="noopener noreferrer">Facebook ↗</a><a href="/login">Admin sign in</a></div>
      </div>
      <div className="cx-giant" aria-hidden="true">Express Cleaning</div>
      <div className="cx-fbot"><span>© {new Date().getFullYear()} Express Cleaning Consult</span><span>Service is confirmed based on local crew availability · <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms</a></span></div>
      <p className="cx-credit">Background footage: free stock clips (Pexels, Mixkit), color-graded and shown for illustration. Project photos supplied by Express Cleaning Consult.</p>
    </div></footer>
    <div className="ecc-home cx-legacy-tools"><WebsiteTools /><WelcomeOffer /></div>
  </div>;
}
