import { facebookUrl } from '@/lib/social';

export default function ReviewsSection() {
  return <section aria-labelledby="reviews-title" className="bg-[#EAF5F2] px-5 py-16 md:px-8">
    <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-7 md:flex-row md:items-center">
      <div className="max-w-2xl"><p className="font-bold uppercase tracking-[.15em] text-ocean">Customer feedback</p><h2 id="reviews-title" className="mt-3 text-3xl font-bold text-ink md:text-4xl">Hear from our community</h2><p className="mt-4 leading-7 text-slate-600">Visit our Facebook page for updates and customer conversations.</p></div>
      <a href={facebookUrl} target="_blank" rel="noopener noreferrer" className="rounded-full bg-ocean-bright px-6 py-4 font-bold text-white hover:bg-ocean">Visit our Facebook page <span aria-hidden="true">↗</span></a>
    </div>
  </section>;
}
