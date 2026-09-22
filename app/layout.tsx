import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '../design-system/tokens.css';
import '../design-system/primitives/primitives.css';
import { Providers } from './Providers';

export const metadata: Metadata = {
  title: 'Ada Editor',
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
