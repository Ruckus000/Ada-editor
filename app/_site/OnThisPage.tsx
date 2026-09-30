'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * "On this page" for the statement pages: a sticky sidebar on wide screens, a
 * swipeable chip row pinned under the header on narrow ones. The section in
 * view is marked aria-current="location", and on the chip row it is scrolled
 * into view.
 */
export function OnThisPage({ items }: { items: { id: string; label: string }[] }) {
  const [current, setCurrent] = useState(items[0]?.id);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const spy = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setCurrent(e.target.id);
    }, { rootMargin: '-30% 0px -60% 0px' });
    for (const { id } of items) {
      const el = document.getElementById(id);
      if (el) spy.observe(el);
    }
    return () => spy.disconnect();
  }, [items]);

  useEffect(() => {
    const row = bar.current;
    const a = row?.querySelector<HTMLElement>('[aria-current]');
    if (!row || !a || row.scrollWidth <= row.clientWidth) return;
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    row.scrollTo({ left: a.offsetLeft - row.offsetLeft - 24, behavior: smooth ? 'smooth' : 'auto' });
  }, [current]);

  return (
    <nav className="page-toc" aria-labelledby="page-toc-label">
      <p id="page-toc-label" className="page-toc__label site-mono">On this page</p>
      <div className="page-toc__links" ref={bar}>
        {items.map((it) => (
          <a key={it.id} href={`#${it.id}`} aria-current={it.id === current ? 'location' : undefined}>{it.label}</a>
        ))}
      </div>
    </nav>
  );
}
