#!/usr/bin/env node
/**
 * Search gate: the public pages as a crawler that runs no JavaScript sees
 * them. That is how the AI search crawlers (OAI-SearchBot, PerplexityBot,
 * Claude-SearchBot) read every page, so whatever a page says about itself —
 * its title, description, canonical address, headings, words and structured
 * data — has to be in the HTML the server sends. Also checks robots.txt and
 * the sitemap, noindex on the app's private routes, the /welcome redirect,
 * and that the production .vercel.app alias stays out of search.
 * Why: docs/audit/search-and-ai-2026-10.md.
 *
 *   node scripts/verify-seo.mjs [--verbose] [--no-build]
 *
 * --no-build serves the last `next build` (the app accessibility gate's, in
 * `npm run verify` and CI) instead of building again.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { parseHTML } from 'linkedom';
import { sleep, track, watchdog } from './cdp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NEXT = resolve(ROOT, 'node_modules/.bin/next');
const VERBOSE = process.argv.includes('--verbose');

const SITE = 'https://www.adaedit.com';
/** The production deployment's public .vercel.app address: kept working for
 *  anyone whose session and unsynced edits live in its storage, kept out of search. */
const ALIAS = 'ada-editor-umber.vercel.app';
/** An AI search crawler. Next sends bots it knows (Bingbot, Applebot, Google-*)
 *  the metadata in <head> even when a page renders on demand; this one gets
 *  the worst case, which is what a gate should see. */
const BOT = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot';
/** The app's private routes: never in the sitemap, always noindex. A real path
 *  stands in for each dynamic route. Keep in step with next.config.ts headers(). */
const PRIVATE = { '/desk': '/desk', '/editor/[docId]': '/editor/hearing-notice', '/sign-in': '/sign-in', '/sign-up': '/sign-up' };
/** What the home page owes Google's site name and the entity behind the product. */
const HOME_TYPES = ['WebSite', 'Organization', 'WebApplication'];

const failures = [];
const notes = [];
let page = '';
const fail = (m) => failures.push(`[${page}] ${m}`);
const note = (m) => notes.push(`  ok  [${page}] ${m}`);

/* ---------- the page registry: every public page's title, description and dates ---------- */

const REGISTRY = join(ROOT, 'app/_site/pages.ts');
async function loadPages() {
  if (!existsSync(REGISTRY)) return null;
  // Type-only imports, so the bundle is the registry and nothing else.
  const out = await build({ entryPoints: [REGISTRY], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
  const { PAGES } = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
  return PAGES;
}

/* ---------- serve the app ---------- */

if (!process.argv.includes('--no-build')) {
  const built = spawnSync(NEXT, ['build'], { cwd: ROOT, stdio: VERBOSE ? 'inherit' : 'pipe', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
  if (built.status !== 0) {
    console.error('next build failed\n' + (built.stderr?.toString() ?? '') + (built.stdout?.toString() ?? ''));
    process.exit(1);
  }
} else if (!existsSync(join(ROOT, '.next/BUILD_ID'))) {
  console.error('No build to serve. Run without --no-build, or after a gate that builds (npm run a11y:app).');
  process.exit(1);
}

const freePort = () => new Promise((res) => {
  const srv = createServer();
  srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => res(port)); });
});
const port = await freePort();
const server = track(spawn(NEXT, ['start', '-p', String(port), '-H', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } }));
watchdog(3 * 60_000);

/** One request as the crawler: no JavaScript, no redirect following, and the
 *  Host header as given (Node's fetch quietly replaces a custom Host). */
const get = (path, { host = `127.0.0.1:${port}` } = {}) => new Promise((done, reject) => {
  const req = request({ host: '127.0.0.1', port, path, headers: { host, 'user-agent': BOT, accept: 'text/html,application/xhtml+xml,*/*' } }, (res) => {
    let body = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => done({ status: res.statusCode, headers: res.headers, body }));
  });
  req.on('error', reject);
  req.setTimeout(20_000, () => req.destroy(new Error(`no answer for ${path}`)));
  req.end();
});

let up = false;
for (let i = 0; i < 100 && !up; i++) {
  await sleep(200);
  try { up = (await get('/robots.txt')).status > 0; } catch { /* not yet */ }
}
if (!up) { server.kill(); console.error('next start did not come up'); process.exit(1); }

const noindexHeader = (res) => /noindex/i.test(String(res.headers['x-robots-tag'] ?? ''));
const noindexMeta = (document) => [...document.querySelectorAll('meta[name="robots"]')].some((m) => /noindex/i.test(m.getAttribute('content') ?? ''));

/* ---------- the registry's dates feed the sitemap's lastmod, which Google trusts only while it's right ---------- */

function registry(pages) {
  page = 'app/_site/pages.ts';
  const today = new Date().toISOString().slice(0, 10);
  for (const p of pages) {
    const valid = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
    if (!valid(p.published) || !valid(p.updated)) fail(`DATES  ${p.path} has dates ${JSON.stringify([p.published, p.updated])}; write them as YYYY-MM-DD`);
    else if (p.updated < p.published) fail(`DATES  ${p.path} was updated (${p.updated}) before it was published (${p.published})`);
    else if (p.updated > today) fail(`DATES  ${p.path} is dated ${p.updated}, in the future`);
  }
  note(`${pages.length} pages, dates checked`);
}

/* ---------- robots.txt and the sitemap ---------- */

async function robotsAndSitemap(pages) {
  page = '/robots.txt';
  const robots = await get('/robots.txt');
  if (robots.status !== 200) fail(`ROBOTS  answered ${robots.status}`);
  else {
    const lines = robots.body.split('\n').map((l) => l.trim());
    if (!lines.includes(`Sitemap: ${SITE}/sitemap.xml`)) fail(`ROBOTS  does not name ${SITE}/sitemap.xml`);
    // A disallowed page is never fetched, so its noindex is never seen, and
    // links elsewhere can still get it listed. Private routes use noindex instead.
    const blocked = lines.filter((l) => /^disallow:\s*\S/i.test(l));
    if (blocked.length) fail(`ROBOTS  disallows ${blocked.join(', ')}; use noindex, which crawlers can see`);
    else note('robots.txt names the sitemap and blocks nothing');
  }

  page = '/sitemap.xml';
  const sitemap = await get('/sitemap.xml');
  if (sitemap.status !== 200) { fail(`SITEMAP  answered ${sitemap.status}`); return []; }
  const entries = [...sitemap.body.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([, url]) => ({
    loc: url.match(/<loc>([^<]+)<\/loc>/)?.[1].trim() ?? '',
    lastmod: url.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1].trim() ?? '',
  }));
  const locs = entries.map((e) => e.loc);
  const offSite = locs.filter((l) => l !== SITE && !l.startsWith(`${SITE}/`));
  if (offSite.length) fail(`SITEMAP  lists addresses off ${SITE}: ${offSite.join(', ')}`);
  if (new Set(locs).size !== locs.length) fail('SITEMAP  lists an address twice');
  const listed = new Set(locs.map((l) => new URL(l).pathname));
  const registered = new Set(pages.map((p) => p.path));
  for (const p of registered) if (!listed.has(p)) fail(`SITEMAP  leaves out ${p}`);
  for (const p of listed) if (!registered.has(p)) fail(`SITEMAP  lists ${p}, which app/_site/pages.ts doesn't have`);
  for (const e of entries) {
    const p = pages.find((x) => x.path === new URL(e.loc).pathname);
    if (p && !e.lastmod.startsWith(p.updated)) fail(`SITEMAP  ${e.loc} has lastmod ${JSON.stringify(e.lastmod)}, not ${p.updated}`);
  }
  note(`sitemap lists ${locs.length} addresses on ${SITE}`);
  return locs;
}

/* ---------- each listed page, as served ---------- */

const seen = { titles: new Map(), descriptions: new Map() };

async function listed(loc, pages) {
  const path = new URL(loc).pathname;
  page = path;
  const entry = pages.find((p) => p.path === path);
  const res = await get(path);
  if (res.status !== 200) { fail(`STATUS  answered ${res.status}, not 200`); return; }
  if (noindexHeader(res)) fail('NOINDEX  a listed page sends X-Robots-Tag: noindex');
  const { document } = parseHTML(res.body);
  if (noindexMeta(document)) fail('NOINDEX  a listed page carries a noindex robots meta');

  const titles = [...document.querySelectorAll('title')].filter((t) => !t.closest('svg'));
  const title = titles[0]?.textContent.trim() ?? '';
  if (titles.length !== 1) fail(`TITLE  ${titles.length} <title> elements: ${titles.map((t) => JSON.stringify(t.textContent.trim())).join(', ')}`);
  else if (entry && title !== entry.title) fail(`TITLE  is ${JSON.stringify(title)}; app/_site/pages.ts says ${JSON.stringify(entry.title)}`);
  if (seen.titles.has(title)) fail(`TITLE  ${JSON.stringify(title)} is also ${seen.titles.get(title)}'s`);
  seen.titles.set(title, path);

  const descriptions = [...document.querySelectorAll('meta[name="description"]')];
  const description = descriptions[0]?.getAttribute('content') ?? '';
  if (descriptions.length !== 1) fail(`DESCRIPTION  ${descriptions.length} description metas`);
  else if (description.length < 50 || description.length > 160) fail(`DESCRIPTION  is ${description.length} characters; keep it between 50 and 160`);
  else if (entry && description !== entry.description) fail(`DESCRIPTION  is not the one app/_site/pages.ts gives ${path}`);
  if (seen.descriptions.has(description)) fail(`DESCRIPTION  is the same as ${seen.descriptions.get(description)}'s`);
  seen.descriptions.set(description, path);

  const canonicals = [...document.querySelectorAll('link[rel="canonical"]')];
  const canonical = canonicals[0]?.getAttribute('href') ?? '';
  if (canonicals.length !== 1) fail(`CANONICAL  ${canonicals.length} canonical links`);
  else if (new URL(canonical, SITE).href !== new URL(loc).href) fail(`CANONICAL  is ${canonical}, not ${loc}`);

  const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? '';
  if (!ogImage.startsWith(`${SITE}/`)) fail(`OG  no og:image on ${SITE} (got ${JSON.stringify(ogImage)})`);

  // Metadata streamed into <body> means the page renders on demand, and what
  // a crawler sees depends on whether Next recognises it.
  const outside = [titles[0], descriptions[0], canonicals[0]].filter((el) => el && !document.head.contains(el));
  if (outside.length) fail(`HEAD  ${outside.map((el) => `<${el.tagName.toLowerCase()}>`).join(', ')} outside <head>: the page renders on demand`);

  const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')];
  const h1s = headings.filter((h) => h.tagName === 'H1');
  if (h1s.length !== 1) fail(`HEADINGS  ${h1s.length} h1 elements`);
  if (headings[0] && headings[0].tagName !== 'H1') fail(`HEADINGS  the first heading is <${headings[0].tagName.toLowerCase()}> ${JSON.stringify(headings[0].textContent.trim())}, not the page's h1`);

  const main = document.querySelector('main');
  if (!main) fail('MAIN  no <main>');
  else {
    const copy = main.cloneNode(true);
    for (const el of copy.querySelectorAll('script, style, template, noscript')) el.remove();
    const words = copy.textContent.split(/\s+/).filter(Boolean).length;
    if (words < 150) fail(`WORDS  ${words} words in <main> before any JavaScript runs; a crawler that runs none gets nothing else`);
    else note(`${words} words in the server's HTML`);
  }

  const types = new Set();
  for (const block of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(block.textContent);
      for (const node of [data, ...(data['@graph'] ?? [])]) for (const t of [node['@type']].flat()) if (t) types.add(t);
    } catch (error) {
      fail(`JSON-LD  a block does not parse: ${error.message}`);
    }
  }
  if (path === '/') {
    const missing = HOME_TYPES.filter((t) => !types.has(t));
    if (missing.length) fail(`JSON-LD  the home page has no ${missing.join(', ')}`);
    else note(`structured data: ${[...types].join(', ')}`);
  }

  if (document.documentElement.getAttribute('lang') !== 'en') fail(`LANG  <html lang> is ${JSON.stringify(document.documentElement.getAttribute('lang'))}`);
  note(`${JSON.stringify(title)}, its own description, canonical ${canonical}, one h1 first`);
}

/* ---------- private routes, the 404, redirects and hosts ---------- */

async function unlisted() {
  for (const path of Object.values(PRIVATE)) {
    page = path;
    const res = await get(path);
    const { document } = parseHTML(res.body);
    // The header too: a page rendered on demand streams its metadata into
    // <body>, where some crawlers stop looking.
    if (!noindexHeader(res)) fail('NOINDEX  no X-Robots-Tag: noindex header');
    if (!noindexMeta(document)) fail('NOINDEX  no noindex robots meta');
    if (noindexHeader(res) && noindexMeta(document)) note('kept out of search (header and meta)');
  }
  page = '/no-such-page';
  const missing = await get('/no-such-page');
  if (missing.status !== 404) fail(`STATUS  answered ${missing.status}, not 404`);
  else if (!noindexMeta(parseHTML(missing.body).document)) fail('NOINDEX  the 404 page has no noindex');
  else note('404 with noindex');
}

async function redirects() {
  for (const [from, to] of [['/welcome', '/'], ['/welcome?x=1', '/?x=1']]) {
    page = from;
    const res = await get(from);
    const location = res.headers.location ? new URL(res.headers.location, 'http://x') : null;
    if (res.status !== 308) fail(`REDIRECT  answered ${res.status}, not a permanent 308 to ${to}`);
    else if (!location || location.pathname + location.search !== to) fail(`REDIRECT  goes to ${res.headers.location}, not ${to}`);
    else note(`308 to ${to}`);
  }
}

async function hosts() {
  // `has` host values are regular expressions: the second fake proves the dots
  // are escaped, the first that preview deployments aren't caught.
  for (const [host, path, wanted] of [
    [ALIAS, '/', true], [ALIAS, '/help', true],
    ['www.adaedit.com', '/', false],
    ['ada-editor-git-some-branch-team.vercel.app', '/', false],
    ['ada-editor-umberXvercelXapp', '/', false],
  ]) {
    page = `${host}${path}`;
    const res = await get(path, { host });
    if (noindexHeader(res) !== wanted) fail(wanted ? 'HOST  the .vercel.app alias is not kept out of search' : 'HOST  sends noindex on a host it should leave alone');
    else note(wanted ? 'noindex: the alias stays out of search' : 'no noindex');
  }
}

/* ---------- every route is public (listed) or private (noindex): nothing in between ---------- */

function routes(dir = join(ROOT, 'app'), prefix = '') {
  const found = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (!statSync(full).isDirectory()) { if (name === 'page.tsx') found.push(prefix || '/'); continue; }
    if (name.startsWith('_') || name.startsWith('.')) continue; // private folders
    found.push(...routes(full, prefix + (/^\(.+\)$/.test(name) ? '' : `/${name}`))); // route groups add no segment
  }
  return found;
}

function coverage(locs) {
  page = 'app/';
  const listedPaths = new Set(locs.map((l) => new URL(l).pathname));
  const loose = routes().filter((r) => !listedPaths.has(r) && !(r in PRIVATE));
  for (const r of loose) fail(`COVERAGE  ${r} is neither listed nor private: add it to app/_site/pages.ts, or to the private routes in next.config.ts and this gate`);
  if (!loose.length) note('every route is listed or private');
}

try {
  const pages = await loadPages();
  if (!pages) {
    page = 'app/_site/pages.ts';
    fail('REGISTRY  no page registry: the sitemap, titles and descriptions come from app/_site/pages.ts');
  } else registry(pages);
  const locs = await robotsAndSitemap(pages ?? []);
  for (const loc of locs) await listed(loc, pages ?? []);
  await unlisted();
  await redirects();
  await hosts();
  coverage(locs);
} finally {
  server.kill();
}

console.log('Ada Editor search gate (as a crawler that runs no JavaScript)\n');
if (VERBOSE) console.log(notes.join('\n') + '\n');
if (failures.length) {
  console.error(`FAILED (${failures.length})\n`);
  for (const f of failures) console.error('  ' + f);
  console.error('\nFix the pages. Do not weaken the check.');
  process.exit(1);
}
console.log(`PASSED — ${notes.length} checks, 0 failures.`);
