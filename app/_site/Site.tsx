import Link from 'next/link';
import type { ReactNode } from 'react';
import { isCloud } from '../_data/supabase';
import { SiteAccount } from './SiteAccount';
import './site.css';

/** Where the landing page's calls to action go: creating an account when there
 *  are accounts (a signed-in visitor is sent on to the desk), the desk in local mode. */
export const START = isCloud ? '/sign-up' : '/';

/**
 * Chrome for the public pages (/welcome, /accessibility, /privacy): skip link,
 * header, main, footer. Server-rendered apart from the account links, which
 * need the session in this browser (SiteAccount). Every link here has a
 * name no other control on the page shares (the a11y gate checks it).
 */
export function Site({ current, children }: { current?: 'accessibility' | 'privacy'; children: ReactNode }) {
  const here = (page: typeof current) => (page === current ? 'page' : undefined);
  return (
    <div className="site">
      <a href="#main" className="site-skip">Skip to content</a>
      <header className="site-header">
        <div className="site-header__row">
          <Link href="/welcome" className="site-brand"><span className="site-brand__mark" aria-hidden="true">A</span>Ada Editor</Link>
          <SiteAccount />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="site-main">{children}</main>
      <footer className="site-footer">
        <span className="site-footer__word" aria-hidden="true">Ada</span>
        <div className="site-footer__cols">
          <div className="site-footer__about">
            <p className="site-brand"><span className="site-brand__mark" aria-hidden="true">A</span>Ada Editor</p>
            <p>Write documents that meet WCAG 2.1 AA and Section 508, and know exactly what a checker can’t tell you.</p>
          </div>
          <nav aria-labelledby="site-foot-product">
            <h2 id="site-foot-product">Product</h2>
            <Link href="/welcome#product">Features</Link>
            <Link href="/welcome#engine">Engine</Link>
            <Link href="/welcome#promise">Promise</Link>
          </nav>
          <nav aria-labelledby="site-foot-company">
            <h2 id="site-foot-company">Company</h2>
            <Link href="/accessibility" aria-current={here('accessibility')}>Accessibility</Link>
            <Link href="/privacy" aria-current={here('privacy')}>Privacy</Link>
            <Link href="/privacy#contact">Contact</Link>
          </nav>
        </div>
        <div className="site-footer__base">
          <span>“Ada” is the Americans with Disabilities Act, not the programming language.</span>
          <span className="site-footer__pill">Automated checks cannot confirm compliance</span>
        </div>
      </footer>
    </div>
  );
}

/** "On this page" for the statement pages. */
export function Toc({ items }: { items: [id: string, label: string][] }) {
  return (
    <nav className="site-toc" aria-labelledby="site-toc-label">
      <p id="site-toc-label" className="site-toc__label">On this page</p>
      {items.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
    </nav>
  );
}
