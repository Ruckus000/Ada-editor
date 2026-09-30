'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * Counts a view of a public page (app/api/collect): no cookies, nothing
 * stored in the browser. Skipped when the browser asks not to be tracked
 * (Do Not Track or Global Privacy Control). The referring site is sent only
 * for the first page of a visit; after that it's just this site.
 */
export function CountVisit() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.doNotTrack === '1' || nav.globalPrivacyControl) return;
    const body = JSON.stringify({ p: pathname, r: first.current ? document.referrer : '' });
    first.current = false;
    if (!nav.sendBeacon?.('/api/collect', body)) void fetch('/api/collect', { method: 'POST', body, keepalive: true }).catch(() => {});
  }, [pathname]);

  return null;
}
