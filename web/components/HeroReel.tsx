'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { heroClips } from '@/lib/reel';

const DURATION = 6500;

export default function HeroReel() {
  const [active, setActive] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const [zip, setZip] = useState('');
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
  const router = useRouter();
  const reduce = useRef(false);

  useEffect(() => { reduce.current = matchMedia('(prefers-reduced-motion: reduce)').matches; }, []);

  useEffect(() => {
    const v = videos.current[active];
    if (v) { v.preload = 'auto'; v.currentTime = 0; v.play().catch(() => {}); }
    const cleanup = setTimeout(() => { if (prev !== null && prev !== active) videos.current[prev]?.pause(); }, 1500);
    const next = reduce.current ? undefined : setTimeout(() => go((active + 1) % heroClips.length), DURATION);
    return () => { clearTimeout(cleanup); if (next) clearTimeout(next); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    const t = setTimeout(() => videos.current.forEach(v => { if (v) v.preload = 'auto'; }), 2500);
    return () => clearTimeout(t);
  }, []);

  function go(n: number) { if (n === active) return; setPrev(active); setActive(n); }

  return <section className="cx-hero" aria-label="Professional cleaners at work">
    <div className="cx-reel">
      {heroClips.map((c, i) => <div key={c.key} className={`cx-slide${i === active ? ' on' : ''}${i === prev ? ' off' : ''}`}>
        <video ref={el => { videos.current[i] = el; }} muted loop playsInline autoPlay={i === 0} preload={i === 0 ? 'auto' : 'none'} poster={c.wide.poster} aria-label={c.alt}>
          <source src={c.tall.src} type="video/mp4" media="(max-aspect-ratio: 4/5)" /><source src={c.wide.src} type="video/mp4" />
        </video>
      </div>)}
    </div>
    <div className="cx-hero-copy"><div className="cx-wrap">
      <h1><span className="cx-line"><span>Spotless,</span></span><span className="cx-line"><span><em>in motion.</em></span></span></h1>
      <div className="cx-hero-row">
        <div>
          <p className="cx-lede">Professional cleaning for homes, offices and rentals nationwide. Tell us your ZIP code; we confirm a vetted local crew, the scope and the price before anything is booked.</p>
          <form className="cx-zip" onSubmit={e => { e.preventDefault(); router.push(/^\d{5}$/.test(zip) ? `/book?zip=${zip}` : '/book'); }}>
            <label htmlFor="hero-zip" className="cx-sr">ZIP code</label>
            <input id="hero-zip" inputMode="numeric" autoComplete="postal-code" pattern="[0-9]{5}" maxLength={5} placeholder="Enter your ZIP code" value={zip} onChange={e => setZip(e.target.value.replace(/\D/g, ''))} />
            <button className="cx-btn" data-mag type="submit">Get my free quote <span aria-hidden="true">→</span></button>
          </form>
          <small className="cx-fine">No card required. No payment taken.</small>
        </div>
        <div className="cx-reel-meta">
          <span className="cx-idx">{String(active + 1).padStart(2, '0')}</span>
          <span aria-live="polite">{heroClips[active].caption}</span>
          <div className="cx-bars" style={{ ['--dur' as string]: `${DURATION}ms` }}>
            {heroClips.map((c, i) => <button key={`${c.key}-${i === active ? active : 'x'}`} type="button" aria-label={`Show clip ${i + 1}: ${c.caption}`} className={i === active ? 'on' : i < active ? 'done' : ''} onClick={() => go(i)} />)}
          </div>
        </div>
      </div>
    </div></div>
  </section>;
}
