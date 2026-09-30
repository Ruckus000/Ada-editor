import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { PortalGate } from '../_portal/PortalGate';
import '../_portal/portal.css';
import '../_auth/signin.css';

export const metadata: Metadata = { title: 'Operator portal · Ada Editor', robots: { index: false, follow: false } };

/** Served at portal.adaedit.com (middleware.ts); operators only. */
export default function PortalLayout({ children }: { children: ReactNode }) {
  return <PortalGate>{children}</PortalGate>;
}
