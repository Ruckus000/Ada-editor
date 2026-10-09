import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '../design-system/tokens.css';
import '../design-system/primitives/primitives.css';
import { Providers } from './Providers';
import { PREPAINT } from './_data/display';
import { SITE_URL } from './_site/pages';

// No default title: a server <title> outranks the one a client screen renders
// (document.title reads the first), so routes that only learn their title in
// the browser — the editor, not-found, the error boundary — own it via
// React's <title>. Server-known pages set metadata.title themselves.
// metadataBase makes the social card's URL and the public pages' canonical
// addresses (app/_site/pages.ts) absolute on the canonical domain. Only what
// every page shares lives here: never alternates or robots, which not-found
// and the app's screens would inherit. Pages set no openGraph object of their
// own (it would replace this one and drop the card's image); Next fills in
// og:title and og:description from each page's title and description.
// Icons and the card are generated: `npm run icons:build`.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: 'Ada Editor',
  description: 'Write documents that meet WCAG 2.1 AA and Section 508.',
  openGraph: { siteName: 'Ada Editor', type: 'website', locale: 'en_US' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The pre-paint script sets data-theme/data-text/data-session on <html>
    // from this browser's storage, so React must not treat them as a mismatch.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREPAINT }} />
      </head>
      <body>
        {/* One live region for the whole app; every screen announces through it. */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
