import type * as SentryModule from '@sentry/nextjs';
import { keepBreadcrumb, scrubReport } from './reports';

/**
 * Error reports to Sentry, on production only (like the counting in the root
 * layout): local runs, CI and preview deployments send nothing. What a report
 * may carry is decided in ./reports.ts. The SDK is about 35 kB, so it loads
 * after the page rather than with it (instrumentation-client.ts starts it).
 * shortcut: an error thrown before it has loaded, in the first moments of a
 * page, goes unreported unless a boundary or report() catches it; load it
 * eagerly if reports show crashes on load.
 * shortcut: browser only; the server does next to nothing and Vercel keeps
 * its logs. Add sentry.server.config.ts once server routes do real work.
 */
const on = typeof window !== 'undefined' && process.env.NEXT_PUBLIC_VERCEL_ENV === 'production' && Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

const sentry: Promise<typeof SentryModule> | null = on
  ? import('@sentry/nextjs').then((Sentry) => {
      Sentry.init({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        sendDefaultPii: false,
        beforeSend: scrubReport,
        beforeBreadcrumb: keepBreadcrumb,
        // Session pings count visits per release: counting the privacy page doesn't list.
        integrations: (defaults) => defaults.filter((i) => i.name !== 'BrowserSession'),
      });
      return Sentry;
    })
  : null;

/** Something broke that the visitor was told about, or that a boundary caught. */
export function report(error: unknown): void {
  void sentry?.then((Sentry) => Sentry.captureException(error));
}

/** A failure with no error worth sending (a Supabase error's details hold the
 *  row), named by a sentence and its SQLSTATE. */
export function reportFailure(what: string, sqlstate?: string): void {
  void sentry?.then((Sentry) => Sentry.captureMessage(what, { level: 'error', ...(sqlstate && { tags: { sqlstate } }) }));
}
