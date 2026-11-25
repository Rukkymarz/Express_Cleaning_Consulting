'use client';

import Image from 'next/image';
import { useState } from 'react';
import { instagramUrl } from '@/lib/social';
import { publishedProjectPairs } from '@/lib/gallery';

export default function BeforeAfterGallery({ serviceCode, theme }: { serviceCode?: string; theme?: 'cinema' }) {
  const matches = publishedProjectPairs(serviceCode);
  const [selected, setSelected] = useState(0);
  const active = matches[Math.min(selected, matches.length - 1)];

  if (theme === 'cinema') {
    if (!active) return null;
    return <section id="results" aria-labelledby="results-title" className="cx-section cx-ba"><div className="cx-wrap">
      <div className="cx-ba-head cx-reveal"><div><p className="cx-kicker">Our work</p><h2 id="results-title">Before &amp; after,<br /><em>side by side.</em></h2></div>
        <p>Real project photos supplied by Express Cleaning Consult. Results vary with the condition and scope of each space.</p></div>
      {matches.length > 1 && <div aria-label="Cleaning projects" className="cx-ba-tabs">{matches.map((result, index) => <button key={result.id} type="button" aria-pressed={selected === index} onClick={() => setSelected(index)}>{result.title}</button>)}</div>}
      <div className="cx-ba-grid">{(['before', 'after'] as const).map(stage => { const image = active[stage]; return <figure key={`${active.id}-${stage}`}>
        <div className="cx-ba-img"><Image src={image.src} alt={image.alt} fill sizes="(min-width: 760px) 46vw, 92vw" className="cx-ba-photo" /><span className={stage === 'after' ? 'after' : ''}>{stage === 'after' ? 'After' : 'Before'}</span></div>
        <figcaption>{image.caption}</figcaption></figure>; })}</div>
      <p className="cx-ba-sum">{active.summary}</p>
    </div></section>;
  }

  return <section id="results" aria-labelledby="results-title" className="bg-white px-5 py-16 md:px-8">
    <div className="mx-auto max-w-7xl">
      <div className="max-w-3xl"><p className="font-bold uppercase tracking-[.15em] text-ocean">Our work</p><h2 id="results-title" className="mt-3 text-3xl font-bold text-ink md:text-4xl">Before and after, side by side</h2><p className="mt-4 leading-7 text-slate-600">Explore real project photos supplied by Express Cleaning Consult. Results vary with the condition and scope of each space.</p></div>
      {active ? <div className="mt-8 rounded-[2rem] border border-platinum bg-canvas p-4 shadow-[0_16px_45px_rgba(30,41,59,.07)] sm:p-6">
        {matches.length > 1 && <div aria-label="Cleaning projects" className="mb-6 flex flex-wrap gap-3">{matches.map((result, index) => <button key={result.id} type="button" aria-pressed={selected === index} onClick={() => setSelected(index)} className={`rounded-full border px-5 py-3 text-sm font-bold ${selected === index ? 'border-ocean bg-ocean text-white' : 'border-platinum-dark bg-white text-ink hover:border-ocean'}`}>{result.title}</button>)}</div>}
        <h3 className="mb-5 text-xl font-bold text-ink">{active.title}</h3>
        <div className="grid gap-4 sm:grid-cols-2">{(['before', 'after'] as const).map(stage => { const image=active[stage]; return <figure key={`${active.id}-${stage}`} className="overflow-hidden rounded-2xl border border-platinum-dark bg-white"><div className="relative aspect-[4/3]"><Image src={image.src} alt={image.alt} fill sizes="(min-width: 640px) 45vw, 90vw" className="object-cover" /><span className={`absolute left-4 top-4 rounded-full px-4 py-2 text-sm font-bold shadow-sm ${stage === 'after' ? 'bg-ocean text-white' : 'border border-platinum-dark bg-white text-ink'}`}>{stage === 'after' ? 'After' : 'Before'}</span></div><figcaption className="p-4 text-sm leading-6 text-slate-700">{image.caption}</figcaption></figure>; })}</div>
        <p className="mt-5 text-sm leading-6 text-slate-600">{active.summary}</p>
      </div> : <div className="mt-8 flex flex-col items-start gap-5 rounded-[2rem] border border-platinum bg-canvas p-7 sm:p-10"><p className="max-w-2xl text-lg leading-8 text-ink">This gallery is ready for real before-and-after project pairs. We will publish only customer-approved photos—never stock or AI images presented as completed work.</p><a href={instagramUrl} target="_blank" rel="noopener noreferrer" className="rounded-full border border-ocean px-6 py-3 font-bold text-ocean hover:bg-[#EAF5F2]">Follow project updates on Instagram <span aria-hidden="true">↗</span></a></div>}
    </div>
  </section>;
}
