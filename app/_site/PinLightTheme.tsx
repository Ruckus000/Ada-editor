'use client';

import { useEffect } from 'react';

/** Runs before first paint, so a dark-scheme visitor never sees a dark flash. */
export const PIN_LIGHT = "document.documentElement.setAttribute('data-theme','light')";

/**
 * The public pages are designed light-only (their glass and gradients assume a
 * white page); the app itself keeps following prefers-color-scheme. The inline
 * script covers the first load, this covers client-side navigation in and
 * out of the site.
 */
export function PinLightTheme() {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', 'light');
    return () => root.removeAttribute('data-theme');
  }, []);
  return null;
}
