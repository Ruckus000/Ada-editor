'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const PAGES = [
  { href: '/accessibility', label: 'Accessibility' },
  { href: '/privacy', label: 'Privacy' },
];

/**
 * The brand isn't a link here, and the section links live only in the header:
 * the app gate fails any two controls that share an accessible name.
 */
export function SiteFooter() {
  const pathname = usePathname();
  return (
    <footer className="site-footer">
      <div className="site-footer__mark" aria-hidden="true">Ada</div>
      <div className="site-footer__top">
        <div className="site-footer__brand">
          <p className="site-brand"><span className="site-brand__mark" aria-hidden="true">A</span>Ada Editor</p>
          <p className="site-footer__tagline">Write documents that meet WCAG 2.1 AA and Section 508, and know exactly what a checker can’t tell you.</p>
        </div>
        <nav className="site-footer__col" aria-labelledby="site-footer-company">
          <h2 id="site-footer-company">Company</h2>
          <ul>
            {PAGES.map((p) => (
              <li key={p.href}><Link href={p.href} aria-current={pathname === p.href ? 'page' : undefined}>{p.label}</Link></li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="site-footer__legal">
        <span>“Ada” is the Americans with Disabilities Act, not the programming language.</span>
        <span className="site-footer__pill">Automated checks cannot confirm compliance</span>
      </div>
    </footer>
  );
}
