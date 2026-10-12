import type { Breadcrumb, ErrorEvent } from '@sentry/nextjs';

/**
 * What an error report may carry to Sentry (./sentry.ts): what
 * broke, where in the code, the page and the browser. Never what a document
 * says, and nothing that ties the report to an account. The privacy page
 * promises exactly this; the analytics gate (scripts/verify-analytics.mjs)
 * holds it to that. Why: docs/audit/error-reporting-2026-10.md.
 */

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const RELATIVE = 'https://relative.invalid';

/** A document's address is its id, and Supabase paths and queries carry the
 *  account's: the path keeps its shape, the ids and the query go. */
export function scrubUrl(href: string): string {
  let url: URL;
  try { url = new URL(href, RELATIVE); } catch { return '[url]'; }
  const path = url.pathname.replace(/^\/editor\/[^/]+/, '/editor/[docId]').replace(UUID, '[id]');
  return url.origin === RELATIVE ? path : url.origin + path;
}

/** ProseMirror and JSON.parse double-quote the content they choke on (JSON
 *  escapes and all), e.g. Invalid content for node paragraph: <"a sentence">.
 *  Single quotes stay: engines use them for names, as in (reading 'title').
 *  shortcut: quoting is the only way we know an engine puts input in a
 *  message; widen this if a report ever shows otherwise. */
const unquote = (message: string) => message.replace(/"(?:[^"\\]|\\.)*"|“[^”]*”|`[^`]*`/g, '"…"').replace(UUID, '[id]').slice(0, 300);

/** beforeSend: everything that leaves passes here last. */
export function scrubReport(event: ErrorEvent): ErrorEvent {
  for (const value of event.exception?.values ?? []) if (value.value) value.value = unquote(value.value);
  if (event.message) event.message = unquote(event.message);
  // A captured plain object (every Supabase error is one) is serialised into
  // extra, Postgres's "Failing row contains (…)" with it: the document itself.
  delete event.extra;
  delete event.user;
  // Timezone and locale: more about the person than a bug needs.
  delete event.contexts?.culture;
  // Only the page and the browser; the Referer can name another document.
  const { url, headers } = event.request ?? {};
  event.request = { ...(url && { url: scrubUrl(url) }), ...(headers?.['User-Agent'] && { headers: { 'User-Agent': headers['User-Agent'] } }) };
  return event;
}

/** beforeBreadcrumb: the trail before an error, minus anything that can carry
 *  content or an id. Clicks describe elements by their labels (a document
 *  card's is its title); console lines carry ids and error objects. */
export function keepBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  if (crumb.category === 'navigation') {
    const data = crumb.data ?? {};
    return { ...crumb, data: { from: scrubUrl(String(data.from ?? '/')), to: scrubUrl(String(data.to ?? '/')) } };
  }
  if (crumb.category === 'fetch' || crumb.category === 'xhr') {
    const data = crumb.data ?? {};
    return { ...crumb, data: { method: data.method, status_code: data.status_code, url: scrubUrl(String(data.url ?? '/')) } };
  }
  return null;
}
