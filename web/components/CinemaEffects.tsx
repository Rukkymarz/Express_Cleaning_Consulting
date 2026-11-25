'use client';
import { useEffect } from 'react';

/** Page-level motion: header state, scroll reveals, lazy video playback, cursor ring and magnetic buttons. */
export default function CinemaEffects() {
  useEffect(() => {
    const root = document.querySelector('.cx');
    if (!root) return;
    requestAnimationFrame(() => root.classList.add('ready'));
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hover = matchMedia('(hover: hover)').matches;

    const header = root.querySelector('.cx-header');
    const onScroll = () => { header?.classList.toggle('solid', scrollY > 60); root.classList.toggle('past-hero', scrollY > innerHeight * 0.6); };
    addEventListener('scroll', onScroll, { passive: true }); onScroll();

    const reveal = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); reveal.unobserve(e.target); } }), { threshold: 0.15 });
    root.querySelectorAll('.cx-reveal').forEach(el => reveal.observe(el));

    const lazy = new IntersectionObserver(es => es.forEach(e => {
      const v = e.target as HTMLVideoElement;
      if (e.isIntersecting && getComputedStyle(v.parentElement!).display !== 'none') { v.preload = 'auto'; v.play().catch(() => {}); } else v.pause();
    }), { rootMargin: '200px' });
    root.querySelectorAll('video[data-lazy]').forEach(v => lazy.observe(v));

    const cleanups: (() => void)[] = [];
    if (hover && !reduce) {
      const dot = root.querySelector<HTMLElement>('.cx-cur'), ring = root.querySelector<HTMLElement>('.cx-ring');
      let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my, raf = 0;
      const move = (e: PointerEvent) => { mx = e.clientX; my = e.clientY; };
      const loop = () => { rx += (mx - rx) * 0.18; ry += (my - ry) * 0.18;
        if (dot) dot.style.transform = `translate(${mx}px,${my}px) translate(-50%,-50%)`;
        if (ring) ring.style.transform = `translate(${rx}px,${ry}px) translate(-50%,-50%)`;
        raf = requestAnimationFrame(loop); };
      addEventListener('pointermove', move, { passive: true }); raf = requestAnimationFrame(loop);
      const over = (e: Event) => { if ((e.target as Element).closest?.('a,button')) ring?.classList.add('big'); };
      const out = (e: Event) => { if ((e.target as Element).closest?.('a,button')) ring?.classList.remove('big'); };
      root.addEventListener('pointerover', over); root.addEventListener('pointerout', out);
      root.querySelectorAll<HTMLElement>('[data-mag]').forEach(b => {
        const m = (e: PointerEvent) => { const k = b.getBoundingClientRect(); b.style.transform = `translate(${(e.clientX - k.left - k.width / 2) * 0.25}px,${(e.clientY - k.top - k.height / 2) * 0.35}px)`; };
        const l = () => { b.style.transform = ''; };
        b.addEventListener('pointermove', m); b.addEventListener('pointerleave', l);
        cleanups.push(() => { b.removeEventListener('pointermove', m); b.removeEventListener('pointerleave', l); });
      });
      cleanups.push(() => { removeEventListener('pointermove', move); cancelAnimationFrame(raf); root.removeEventListener('pointerover', over); root.removeEventListener('pointerout', out); });
    }
    return () => { removeEventListener('scroll', onScroll); reveal.disconnect(); lazy.disconnect(); cleanups.forEach(f => f()); };
  }, []);
  return <><div className="cx-cur" aria-hidden="true" /><div className="cx-ring" aria-hidden="true" /></>;
}
