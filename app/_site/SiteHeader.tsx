'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button, VisuallyHidden } from '../../design-system/primitives';

const SECTIONS = [
  { id: 'product', label: 'Product' },
  { id: 'engine', label: 'Engine' },
  { id: 'promise', label: 'Promise' },
];

/**
 * Floating, blurred header shared by the public pages. On the landing page it
 * overlaps the hero so the gradient runs to the top edge, and the section
 * links are in-page anchors. Below 761px the links fold into a menu that
 * closes on Escape (focus returns to the toggle) and on choosing a link.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const landing = pathname === '/';
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const at = (id: string) => (landing ? `#${id}` : `/#${id}`);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      toggle.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="site-header" data-overlay={landing || undefined} data-scrolled={scrolled || undefined}>
      <nav className="site-nav" aria-label="Primary">
        <Link href="/" className="site-brand">
          <span className="site-brand__mark" aria-hidden="true">A</span>Ada Editor
        </Link>
        <div className="site-navlinks">
          {SECTIONS.map((s) => <Link key={s.id} href={at(s.id)} className="site-navlink">{s.label}</Link>)}
        </div>
        <div className="site-actions">
          <Link href="/sign-in" className="site-navlink">Sign in</Link>
          <Link href="/desk" className="site-cta ada-button ada-button--primary">Get started<span aria-hidden="true">→</span></Link>
          <Button
            ref={toggle}
            variant="ghost"
            iconOnly
            className="site-burger-btn"
            aria-expanded={open}
            aria-controls="site-mnav"
            onClick={() => setOpen((o) => !o)}
          >
            <VisuallyHidden>Menu</VisuallyHidden>
            <span className="site-burger" aria-hidden="true"><span /><span /></span>
          </Button>
        </div>
      </nav>
      {open ? (
        <div id="site-mnav" className="site-mnav">
          <ul>
            {SECTIONS.map((s) => (
              <li key={s.id}><Link href={at(s.id)} onClick={() => setOpen(false)}>{s.label}<span aria-hidden="true">→</span></Link></li>
            ))}
            <li><Link href="/sign-in" onClick={() => setOpen(false)}>Sign in</Link></li>
          </ul>
        </div>
      ) : null}
    </header>
  );
}
