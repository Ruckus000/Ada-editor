import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import type { ReactNode } from 'react';
import { PIN_LIGHT, PinLightTheme } from '../_site/PinLightTheme';
import { Reveal } from '../_site/Reveal';
import { SiteFooter } from '../_site/SiteFooter';
import { SiteHeader } from '../_site/SiteHeader';
import '../_site/site.css';

/**
 * The public site: landing, accessibility statement and privacy notice. Geist
 * is self-hosted from the `geist` package (next/font/local), so no visitor's
 * browser talks to a font CDN — the privacy notice lists every third party.
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`site ${GeistSans.variable} ${GeistMono.variable}`}>
      <script dangerouslySetInnerHTML={{ __html: PIN_LIGHT }} />
      <PinLightTheme />
      <a href="#main" className="site-skip">Skip to content</a>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="site-main">{children}</main>
      <SiteFooter />
      <Reveal />
    </div>
  );
}
