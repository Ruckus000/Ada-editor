import { track } from '@vercel/analytics';

/**
 * What Ada Editor counts: page views and speed measurements (Vercel Web
 * Analytics and Speed Insights, no cookies), and these steps from visitor to
 * exported document. Nothing else, and never with properties: nothing about a
 * document or a person goes with them. The privacy page says exactly this.
 * Why: docs/audit/search-and-ai-2026-10.md (decision 7).
 */
export type Counted = 'Sign up' | 'Document created' | 'Word imported' | 'PDF exported' | 'HTML exported';

/** Counts one step. A no-op wherever the scripts aren't loaded: local runs,
 *  CI and preview deployments (app/_site/Counting.tsx). */
export function count(name: Counted) {
  track(name);
}

/**
 * Everything the analytics scripts send passes here first (their beforeSend).
 * A document's address is its id, so editor URLs go as /editor/[docId];
 * fragments never go; with Global Privacy Control on, nothing goes.
 * The analytics gate (scripts/verify-analytics.mjs) holds it to that.
 */
export function scrub<E extends { url: string }>(event: E): E | null {
  if ((navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true) return null;
  const url = new URL(event.url);
  url.pathname = url.pathname.replace(/^\/editor\/[^/]+/, '/editor/[docId]');
  url.hash = '';
  return { ...event, url: url.href };
}
