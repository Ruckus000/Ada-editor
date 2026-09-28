'use client';

import type { ReactNode } from 'react';
import { LiveAnnouncer } from '../design-system/primitives';
import { AuthGate } from './_auth/AuthGate';

/** Client boundary for the design system's context providers, and the
 *  account gate (inside the announcer, so sign-in can announce). */
export function Providers({ children }: { children: ReactNode }) {
  return <LiveAnnouncer><AuthGate>{children}</AuthGate></LiveAnnouncer>;
}
