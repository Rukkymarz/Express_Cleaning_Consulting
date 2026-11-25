'use client';
import { useEffect, useRef, useState } from 'react';
import { services, clip } from '@/lib/reel';

export default function ServiceIndex() {
  const peek = useRef<HTMLDivElement>(null);
  const peekVideo = useRef<HTMLVideoElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!matchMedia('(hover: hover)').matches) return;
    let mx = 0, my = 0, px = 0, py = 0, raf = 0;
    const move = (e: PointerEvent) => { mx = e.clientX; my = e.clientY; };
    const loop = () => { px += (mx - px) * 0.1; py += (my - py) * 0.1; if (peek.current) { peek.current.style.left = `${px}px`; peek.current.style.top = `${py}px`; } raf = requestAnimationFrame(loop); };
    addEventListener('pointermove', move, { passive: true }); raf = requestAnimationFrame(loop);
    return () => { removeEventListener('pointermove', move); cancelAnimationFrame(raf); };
  }, []);

  function enter(id: number) {
    const v = peekVideo.current; if (!v) return;
    const { hd, sd } = clip(id);
    v.innerHTML = `<source src="${hd}" type="video/mp4"><source src="${sd}" type="video/mp4">`;
    v.load(); v.play().catch(() => {}); setShow(true);
  }

  return <>
    <ul className="cx-svc">
      {services.map((s, i) => {
        const { hd, sd } = clip(s.video);
        return <li key={s.slug}><a href={`/services/${s.slug}`} onPointerEnter={() => enter(s.video)} onPointerLeave={() => setShow(false)}>
          <span className="cx-n">0{i + 1}</span>
          <h3>{s.lead} <em>{s.accent}</em></h3>
          <span className="cx-d">{s.text}</span>
          <span className="cx-arr" aria-hidden="true">→</span>
          <span className="cx-thumb" aria-hidden="true"><video data-lazy muted loop playsInline preload="none"><source src={hd} type="video/mp4" /><source src={sd} type="video/mp4" /></video></span>
        </a></li>;
      })}
    </ul>
    <div ref={peek} className={`cx-peek${show ? ' show' : ''}`} aria-hidden="true"><video ref={peekVideo} muted loop playsInline /></div>
  </>;
}
