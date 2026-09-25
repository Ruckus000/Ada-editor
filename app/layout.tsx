import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '../design-system/tokens.css';
import '../design-system/primitives/primitives.css';
import { Providers } from './Providers';

// No default title: a server <title> outranks the one a client screen renders
// (document.title reads the first), so routes that only learn their title in
// the browser — the editor, not-found, the error boundary — own it via
// React's <title>. Server-known pages set metadata.title themselves.
export const metadata: Metadata = {
  description: 'Write documents that meet WCAG 2.1 AA, Section 508 and PDF/UA.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* One live region for the whole app; every screen announces through it. */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
