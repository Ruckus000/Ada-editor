#!/usr/bin/env node
/**
 * Analytics gate: what leaves the browser when Ada Editor counts a visit.
 * Every page view, event and speed measurement passes through scrub()
 * (app/_site/analytics.ts) before Vercel's scripts send it. A document's
 * address is its id, so editor URLs must go as /editor/[docId]; fragments
 * never go; and with Global Privacy Control on, nothing goes at all. The
 * privacy page promises exactly this. Why: docs/audit/search-and-ai-2026-10.md.
 *
 *   node scripts/verify-analytics.mjs
 */

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODULE = join(ROOT, 'app/_site/analytics.ts');

const failures = [];
let passed = 0;
const check = (name, actual, expected) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { passed++; console.log(`  ok   ${name}`); return; }
  failures.push(name);
  console.log(`  FAIL ${name}\n         expected ${JSON.stringify(expected)}\n         got      ${JSON.stringify(actual)}`);
};

if (!existsSync(MODULE)) {
  console.error('FAIL app/_site/analytics.ts is missing: nothing scrubs what analytics sends.');
  process.exit(1);
}
const out = await build({ entryPoints: [MODULE], bundle: true, format: 'esm', platform: 'browser', write: false, logLevel: 'silent' });
const { scrub } = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);

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

console.log(failures.length ? `\n${failures.length} failed, ${passed} passed` : `\n${passed} passed`);
process.exit(failures.length ? 1 : 0);
