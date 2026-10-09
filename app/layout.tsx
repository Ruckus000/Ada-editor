import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '../design-system/tokens.css';
import '../design-system/primitives/primitives.css';
import { Providers } from './Providers';
import { PREPAINT } from './_data/display';

// No default title: a server <title> outranks the one a client screen renders
// (document.title reads the first), so routes that only learn their title in
// the browser — the editor, not-found, the error boundary — own it via
// React's <title>. Server-known pages set metadata.title themselves.
// metadataBase makes the generated social card URLs absolute on the canonical
// domain. Icons and the card are generated: `npm run icons:build`.
export const metadata: Metadata = {
  metadataBase: new URL('https://www.adaedit.com'),
  applicationName: 'Ada Editor',
  description: 'Write documents that meet WCAG 2.1 AA and Section 508.',
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
