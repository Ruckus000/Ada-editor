'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const EASE = 'cubic-bezier(0.2,0,0,1)';
const KF = {
  rise: [{ opacity: 0, transform: 'translateY(28px)' }, { opacity: 1, transform: 'none' }],
  pop: [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1)' }],
  slide: [{ opacity: 0, transform: 'translateX(-12px)' }, { opacity: 1, transform: 'none' }],
  line: [{ opacity: 0, transform: 'translateX(-8px)' }, { opacity: 1, transform: 'none' }],
} satisfies Record<string, Keyframe[]>;
type Kf = keyof typeof KF;
const isKf = (k: string | undefined): k is Kf => !!k && k in KF;

type Item = { els: HTMLElement[]; kf: Kf; step: number; delay: number; dur: number; ease: string };

/**
 * Scroll reveals for the public pages. `data-rv` rises one element (optional
 * `data-rv-delay` in ms); `data-stagger` staggers its children, or the
 * elements its value selects, with the keyframe named by `data-kf`.
 *
 * Only elements below the fold are hidden, and only once this has run, so the
 * page reads complete without JavaScript and nothing on screen blinks out.
 * Reduced motion skips all of it.
 */
export function Reveal() {
  const pathname = usePathname();

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const $ = (s: string, r: ParentNode = document) => Array.from(r.querySelectorAll<HTMLElement>(s));
    const items = new Map<Element, Item>();
    for (const el of $('[data-rv]')) items.set(el, { els: [el], kf: 'rise', step: 0, delay: Number(el.dataset.rvDelay) || 0, dur: 900, ease: EASE });
    for (const el of $('[data-stagger]')) {
      const k = el.dataset.kf;
      items.set(el, {
        els: el.dataset.stagger ? $(el.dataset.stagger, el) : (Array.from(el.children) as HTMLElement[]),
        kf: isKf(k) ? k : 'rise',
        step: k ? 90 : 80,
        delay: k ? 350 : 0,
        dur: k === 'pop' ? 520 : 800,
        ease: k === 'pop' ? 'cubic-bezier(.34,1.56,.64,1)' : EASE,
      });
    }
    for (const [t, it] of items) {
      if (t.getBoundingClientRect().top > window.innerHeight * 0.9) it.els.forEach((e) => e.setAttribute('data-rv-hidden', ''));
      else items.delete(t);
    }
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        const it = en.isIntersecting && items.get(en.target);
        if (!it) continue;
        items.delete(en.target);
        io.unobserve(en.target);
        it.els.forEach((e, i) => {
          e.removeAttribute('data-rv-hidden');
          e.animate(KF[it.kf], { duration: it.dur, delay: it.delay + i * it.step, easing: it.ease, fill: 'backwards' });
        });
      }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.1 });
    for (const t of items.keys()) io.observe(t);
    return () => {
      io.disconnect();
      for (const it of items.values()) it.els.forEach((e) => e.removeAttribute('data-rv-hidden'));
    };
  }, [pathname]);

  return null;
}
