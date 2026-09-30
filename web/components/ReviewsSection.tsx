import { facebookUrl } from '@/lib/social';
import { publishedReviews } from '@/lib/reviews';

export default function ReviewsSection() {
  const reviews = publishedReviews();
  return <section aria-labelledby="reviews-title" className="bg-[#EAF5F2] px-5 py-16 md:px-8 md:py-20">
    <div className="mx-auto max-w-7xl">
      <div className="max-w-2xl"><p className="font-bold uppercase tracking-[.15em] text-ocean">Customer feedback</p><h2 id="reviews-title" className="mt-3 text-3xl font-bold text-ink md:text-4xl">Reviews, with their sources</h2><p className="mt-4 leading-7 text-slate-600">We publish customer feedback only after the review source and permission to share it are verified.</p></div>
      {reviews.length > 0 ? <ul className="mt-9 grid gap-5 md:grid-cols-3">{reviews.map(review => <li key={review.id} className="rounded-2xl border border-white bg-white p-7 shadow-[0_12px_32px_rgba(30,41,59,.05)]"><blockquote className="text-lg leading-8 text-ink">“{review.quote}”</blockquote><p className="mt-5 font-bold">{review.customerDisplayName}</p><a href={review.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm font-semibold text-ocean underline underline-offset-4">View source: {review.sourceLabel}</a></li>)}</ul> : <div className="mt-8 flex flex-col items-start justify-between gap-5 rounded-[2rem] border border-white bg-white p-7 sm:flex-row sm:items-center sm:p-9"><p className="max-w-2xl leading-7 text-slate-700">Verified reviews will appear here as customers approve them. In the meantime, visit our Facebook page for current business updates.</p><a href={facebookUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-full bg-ocean px-6 py-4 font-bold text-white hover:bg-[#05584C]">Visit our Facebook page <span aria-hidden="true">↗</span></a></div>}
    </div>
  </section>;
}
