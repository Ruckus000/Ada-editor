'use client';

import type { ReactNode } from 'react';
import { LiveAnnouncer } from '../design-system/primitives';

/** Client boundary for the design system's context providers. */
export function Providers({ children }: { children: ReactNode }) {
  return <LiveAnnouncer>{children}</LiveAnnouncer>;
}
