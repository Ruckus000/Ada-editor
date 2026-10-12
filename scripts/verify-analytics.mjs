#!/usr/bin/env node
/**
 * Analytics gate: what leaves the browser when Ada Editor counts a visit.
 * Every page view, event and speed measurement passes through scrub()
 * (app/_site/analytics.ts) before Vercel's scripts send it. A document's
 * address is its id, so editor URLs must go as /editor/[docId]; fragments
 * never go; and with Global Privacy Control on, nothing goes at all. The
 * privacy page promises exactly this. Why: docs/audit/search-and-ai-2026-10.md.
 * Error reports to Sentry pass through scrubReport() and keepBreadcrumb()
 * (app/_site/reports.ts): what broke and where, never what a document says,
 * never an id that ties a report to an account. Why:
 * docs/audit/error-reporting-2026-10.md.
 *
 *   node scripts/verify-analytics.mjs
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODULE = join(ROOT, 'app/_site/analytics.ts');
const REPORTS = join(ROOT, 'app/_site/reports.ts');

const failures = [];
let passed = 0;
const check = (name, actual, expected) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { passed++; console.log(`  ok   ${name}`); return; }
  failures.push(name);
  console.log(`  FAIL ${name}\n         expected ${JSON.stringify(expected)}\n         got      ${JSON.stringify(actual)}`);
};

for (const file of [MODULE, REPORTS]) {
  if (!existsSync(file)) {
    console.error(`FAIL ${file.slice(ROOT.length + 1)} is missing: nothing scrubs what leaves the browser.`);
    process.exit(1);
  }
}
const load = async (file) => {
  const out = await build({ entryPoints: [file], bundle: true, format: 'esm', platform: 'browser', write: false, logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
};
const { scrub } = await load(MODULE);
const { scrubReport, keepBreadcrumb } = await load(REPORTS);

const SITE = 'https://www.adaedit.com';
const view = (path) => ({ type: 'pageview', url: SITE + path });
const gpc = (on) => Object.defineProperty(globalThis.navigator, 'globalPrivacyControl', { value: on, configurable: true });

console.log('What analytics may send');
gpc(undefined);
check('a document’s address goes as /editor/[docId]', scrub(view('/editor/2b7c9e14-hearing')), view('/editor/[docId]'));
check('…with a trailing slash too', scrub(view('/editor/hearing-notice/')), view('/editor/[docId]/'));
check('…and keeps the query (campaign tags)', scrub(view('/editor/x?utm_source=league')), view('/editor/[docId]?utm_source=league'));
check('a fragment never goes', scrub(view('/#engine')), view('/'));
check('a public page goes as it is', scrub(view('/help?utm_source=league')), view('/help?utm_source=league'));
check('the desk goes as it is', scrub(view('/desk')), view('/desk'));
check('an event is scrubbed the same way', scrub({ type: 'event', url: `${SITE}/editor/abc#x` }), { type: 'event', url: `${SITE}/editor/[docId]` });
check('a speed measurement keeps its route', scrub({ type: 'vital', url: `${SITE}/editor/abc`, route: '/editor/[docId]' }), { type: 'vital', url: `${SITE}/editor/[docId]`, route: '/editor/[docId]' });
gpc(false);
check('Global Privacy Control off: counted', scrub(view('/')), view('/'));
gpc(true);
check('Global Privacy Control on: no page view', scrub(view('/')), null);
check('Global Privacy Control on: no event', scrub({ type: 'event', url: `${SITE}/desk` }), null);
check('Global Privacy Control on: no speed measurement', scrub({ type: 'vital', url: `${SITE}/`, route: '/' }), null);

// Error reports (Sentry): what broke and where, never what a document says,
// never an id that ties the report to an account. Why:
// docs/audit/error-reporting-2026-10.md.
console.log('\nWhat an error report may send');
const UID = '9f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const SUPABASE = 'https://ntpdjeotlogjuphpcwyk.supabase.co';
const report = (fields) => scrubReport({ exception: { values: [{ type: 'Error', value: 'boom' }] }, ...fields });
const valueOf = (event) => event.exception.values[0].value;
check('document text quoted by ProseMirror goes',
  valueOf(report({ exception: { values: [{ type: 'RangeError', value: 'Invalid content for node paragraph: <"The clerk said \\"hello there\\" to the board">' }] } })),
  'Invalid content for node paragraph: <"…">');
check('…and by JSON.parse', valueOf(report({ exception: { values: [{ type: 'SyntaxError', value: 'Unexpected token \'M\', "Minutes of the meeting" is not valid JSON' }] } })),
  'Unexpected token \'M\', "…" is not valid JSON');
check('a name the engine single-quotes stays', valueOf(report({ exception: { values: [{ type: 'TypeError', value: "Cannot read properties of undefined (reading 'title')" }] } })),
  "Cannot read properties of undefined (reading 'title')");
check('an id in a message goes', valueOf(report({ exception: { values: [{ type: 'Error', value: `Sync failed for ${UID}` }] } })), 'Sync failed for [id]');
check('a captured message is scrubbed too', report({ message: 'Refused "Budget hearing"' }).message, 'Refused "…"');
check('a long message is cut', valueOf(report({ exception: { values: [{ type: 'Error', value: 'x'.repeat(500) }] } })).length, 300);
check('extra goes (a Supabase error is a plain object; its details hold the failing row)',
  report({ extra: { __serialized__: { code: '23514', details: 'Failing row contains (Budget hearing, …)' } } }).extra, undefined);
check('no user, so no IP address', report({ user: { ip_address: '{{auto}}' } }).user, undefined);
check('the page goes as its route, with no query or fragment',
  report({ request: { url: `${SITE}/editor/${UID}?from=desk#h2`, headers: { 'User-Agent': 'Safari', Referer: `${SITE}/editor/budget-hearing` } } }).request,
  { url: `${SITE}/editor/[docId]`, headers: { 'User-Agent': 'Safari' } });
check('a click goes (its label can be a document’s title)', keepBreadcrumb({ category: 'ui.click', message: 'button[aria-label="Open Budget hearing"]' }), null);
check('a console line goes', keepBreadcrumb({ category: 'console', message: `Sync failed for ${UID}`, data: { arguments: [{ details: 'Failing row' }] } }), null);
check('a navigation stays, ids out',
  keepBreadcrumb({ category: 'navigation', data: { from: '/desk', to: `/editor/${UID}?x=1` } }),
  { category: 'navigation', data: { from: '/desk', to: '/editor/[docId]' } });
check('a storage request stays, the account id out',
  keepBreadcrumb({ category: 'fetch', type: 'http', data: { method: 'POST', status_code: 400, url: `${SUPABASE}/storage/v1/object/images/${UID}/abc123`, request_body_size: 9 } }),
  { category: 'fetch', type: 'http', data: { method: 'POST', status_code: 400, url: `${SUPABASE}/storage/v1/object/images/[id]/abc123` } });
check('a database request stays, its query out',
  keepBreadcrumb({ category: 'xhr', data: { method: 'GET', status_code: 200, url: `${SUPABASE}/rest/v1/documents?owner_id=eq.${UID}&select=*` } }),
  { category: 'xhr', data: { method: 'GET', status_code: 200, url: `${SUPABASE}/rest/v1/documents` } });

// No report may name its person.
const setsUser = execSync(`git -C "${ROOT}" grep -nE "Sentry\\.setUser|setUser\\(" -- app instrumentation-client.ts || true`).toString().trim();
check('nothing tells Sentry who the visitor is', setsUser, '');

console.log(failures.length ? `\n${failures.length} failed, ${passed} passed` : `\n${passed} passed`);
process.exit(failures.length ? 1 : 0);
