'use client';

import Image from 'next/image';
import { useState } from 'react';
import { instagramUrl } from '@/lib/social';

export type CleaningResult = {
  id: string;
  title: string;
  serviceCode: string;
  beforeImage: string;
  afterImage: string;
  description: string;
};

// Add only matching original before and after photos from a completed job.
export const cleaningResults: CleaningResult[] = [];

export default function BeforeAfterGallery({ serviceCode }: { serviceCode?: string }) {
  const matches = cleaningResults.filter(result => !serviceCode || result.serviceCode === serviceCode);
  const [selected, setSelected] = useState(0);
  const active = matches[Math.min(selected, matches.length - 1)];

  return <section id="results" aria-labelledby="results-title" className="bg-white px-5 py-16 md:px-8">
    <div className="mx-auto max-w-7xl">
      <div className="max-w-3xl"><p className="font-bold uppercase tracking-[.15em] text-ocean">Our work</p><h2 id="results-title" className="mt-3 text-3xl font-bold text-ink md:text-4xl">See cleaning results</h2><p className="mt-4 leading-7 text-slate-600">Follow our latest projects and cleaning updates.</p></div>
      {active ? <div className="mt-8 rounded-[2rem] border border-platinum bg-canvas p-4 shadow-[0_16px_45px_rgba(30,41,59,.07)] sm:p-6">
        {matches.length > 1 && <div aria-label="Cleaning projects" className="mb-6 flex flex-wrap gap-3">{matches.map((result, index) => <button key={result.id} type="button" aria-pressed={selected === index} onClick={() => setSelected(index)} className={`rounded-full border px-5 py-3 text-sm font-bold ${selected === index ? 'border-ocean-bright bg-ocean-bright text-white' : 'border-platinum-dark bg-white text-ink hover:border-ocean'}`}>{result.title}</button>)}</div>}
        <h3 className="mb-5 text-xl font-bold text-ink">{active.title}</h3>
        <div className="grid gap-4 sm:grid-cols-2">{(['before', 'after'] as const).map(stage => <figure key={`${active.id}-${stage}`} className="overflow-hidden rounded-2xl border border-platinum-dark bg-platinum"><div className="relative aspect-[4/3]"><Image src={stage === 'before' ? active.beforeImage : active.afterImage} alt={`${active.title} ${stage} cleaning`} fill sizes="(min-width: 640px) 45vw, 90vw" className="object-cover" /><figcaption className={`absolute left-4 top-4 rounded-full px-4 py-2 text-sm font-bold shadow-sm ${stage === 'after' ? 'bg-ocean-bright text-white' : 'border border-platinum-dark bg-platinum text-ink'}`}>{stage === 'after' ? 'After' : 'Before'}</figcaption></div></figure>)}</div>
        <p className="mt-5 text-sm leading-6 text-slate-600">{active.description}</p>
      </div> : <div className="mt-8 flex flex-col items-start gap-5 rounded-[2rem] border border-platinum bg-canvas p-7 sm:p-10"><p className="max-w-xl text-lg leading-8 text-ink">Visit our Instagram to explore our cleaning work and updates.</p><a href={instagramUrl} target="_blank" rel="noopener noreferrer" className="rounded-full bg-ocean-bright px-6 py-3 font-bold text-white hover:bg-ocean">Explore our Instagram <span aria-hidden="true">↗</span></a></div>}
    </div>
  </section>;
}
