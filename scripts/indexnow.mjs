#!/usr/bin/env node
/**
 * Tell IndexNow engines (Bing, and so Copilot; also Yandex, Naver, Seznam)
 * that public pages are new or changed, so they recrawl them now rather than
 * whenever they next come round. Google doesn't take IndexNow; it reads the
 * sitemap. Run it after a page is published or what it says changes, once
 * the change is live: not for code-only changes, which engines treat as noise.
 * Why: docs/audit/search-and-ai-2026-10.md.
 *
 *   node scripts/indexnow.mjs /about /help        the pages that changed
 *   node scripts/indexnow.mjs --all               every public page
 *   node scripts/indexnow.mjs --dry-run /about    show what would be sent
 *
 * Only pages in app/_site/pages.ts: the app's screens are kept out of search.
 */

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENDPOINT = 'https://api.indexnow.org/indexnow';

// Type-only imports, so the bundle is the registry and nothing else.
const out = await build({ entryPoints: [join(ROOT, 'app/_site/pages.ts')], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
const { PAGES, SITE_URL, INDEXNOW_KEY } = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const wanted = args.includes('--all') ? PAGES.map((p) => p.path) : args.filter((a) => !a.startsWith('--'));
if (!wanted.length) {
  console.error('Name the pages that changed (/about), or --all. See the top of this file.');
  process.exit(1);
}

const site = new URL(SITE_URL);
const listed = new Set(PAGES.map((p) => p.path));
const urls = [];
for (const arg of wanted) {
  const url = new URL(arg, site);
  if (url.host !== site.host) { console.error(`${arg}: not on ${site.host}`); process.exit(1); }
  if (!listed.has(url.pathname)) { console.error(`${arg}: not a public page in app/_site/pages.ts`); process.exit(1); }
  urls.push(new URL(url.pathname, site).href);
}

const keyLocation = `${SITE_URL}/${INDEXNOW_KEY}.txt`;
const body = { host: site.host, key: INDEXNOW_KEY, keyLocation, urlList: [...new Set(urls)] };
if (dryRun) { console.log(JSON.stringify(body, null, 2)); process.exit(0); }

// Engines check the key on the live site; without it they refuse, so say so here.
const key = await fetch(keyLocation).then(async (r) => (r.ok ? (await r.text()).trim() : null)).catch(() => null);
if (key !== INDEXNOW_KEY) {
  console.error(`${keyLocation} doesn't serve the key yet. Deploy first (public/${INDEXNOW_KEY}.txt), then run this again.`);
  process.exit(1);
}

const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) });
const MEANING = {
  200: 'accepted',
  202: 'received; the key is still being checked, so the URLs count once it is',
  400: 'refused: the request is malformed',
  403: 'refused: the key file was not found or does not match',
  422: 'refused: a URL is not on the host, or the key does not match it',
  429: 'refused: too many requests, try again later',
};
console.log(`${res.status} ${MEANING[res.status] ?? res.statusText}`);
for (const url of body.urlList) console.log(`  ${url}`);
process.exit(res.status === 200 || res.status === 202 ? 0 : 1);
