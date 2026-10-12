'use client';

import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { scrub } from './analytics';

/** Vercel Web Analytics and Speed Insights, everything they send scrubbed
 *  first. The root layout renders this on production deployments only. */
export function Counting() {
  return (
    <>
      <Analytics beforeSend={scrub} />
      <SpeedInsights beforeSend={scrub} />
    </>
  );
}
