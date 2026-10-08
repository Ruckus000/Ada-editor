#!/usr/bin/env node
/**
 * Did the agenda system keep the PDF accessible? Compares an Ada Editor export
 * with the copy a town's agenda system published: the tags, the language, the
 * title, the PDF/UA identifier, and (with Java) the PDF/UA rules veraPDF fails
 * on each. The decision behind it, and the pilot it serves:
 * docs/audit/agenda-platforms-2026-10.md.
 *
 *   npm run check-posted -- --original <file|url> --posted <file|url> [--json] [--out <dir>]
 *
 * --out keeps the downloaded copies. A portal that blocks scripted downloads is
 * reported as blocked: save the file in a browser and pass the file instead.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { comparePdfs, inspectPdf } from './posted-pdf.mjs';
import { ensureVeraPdf, validatePdfUa } from './verapdf.mjs';

const MAX_BYTES = 100 * 1024 * 1024;
const args = process.argv.slice(2);
const arg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const JSON_OUT = args.includes('--json');
const original = arg('--original');
const posted = arg('--posted');
if (!original || !posted) {
  console.error('Usage: npm run check-posted -- --original <file|url> --posted <file|url> [--json] [--out <dir>]');
  process.exit(2);
}
const outArg = arg('--out');
const DIR = outArg ? resolve(outArg) : mkdtempSync(join(tmpdir(), 'ada-posted-'));
mkdirSync(DIR, { recursive: true });

const fail = (message) => { console.error(message); process.exit(1); };

/** Bytes of a local file or a public http(s) URL, saved under DIR for veraPDF. */
async function load(source, label) {
  if (!/^https?:\/\//i.test(source)) {
    if (!existsSync(source)) fail(`${label}: no such file: ${source}`);
    const bytes = new Uint8Array(readFileSync(source));
    return { bytes, path: resolve(source) };
  }
  let response;
  try {
    response = await fetch(source, { redirect: 'follow', headers: { 'User-Agent': 'Ada Editor posted-PDF checker (+https://www.adaedit.com/help#posting)', Accept: 'application/pdf,*/*' } });
  } catch (error) {
    fail(`${label}: could not download ${source}: ${error.cause?.message ?? error.message}`);
  }
  if ([401, 403, 429, 503].includes(response.status)) fail(`${label}: blocked (HTTP ${response.status}). Download it in a browser and pass the file.`);
  if (!response.ok) fail(`${label}: HTTP ${response.status} for ${source}`);
  if (Number(response.headers.get('content-length')) > MAX_BYTES) fail(`${label}: larger than ${MAX_BYTES / 1024 / 1024} MB`);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_BYTES) fail(`${label}: larger than ${MAX_BYTES / 1024 / 1024} MB`);
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(Buffer.concat(chunks));
  if (!Buffer.from(bytes.subarray(0, 1024)).toString('latin1').includes('%PDF-')) {
    fail(`${label}: the link returned ${response.headers.get('content-type') || 'something'} that isn't a PDF (often a browser check page). Download it in a browser and pass the file.`);
  }
  const path = join(DIR, `${label}-${basename(new URL(response.url).pathname).replace(/[^\w.-]/g, '_').slice(0, 60) || 'download'}${/\.pdf$/i.test(response.url) ? '' : '.pdf'}`);
  writeFileSync(path, bytes);
  return { bytes, path };
}

const a = await load(original, 'original');
const b = await load(posted, 'posted');
const before = await inspectPdf(a.bytes).catch((e) => fail(`original: not a readable PDF (${e.message})`));
const after = await inspectPdf(b.bytes).catch((e) => fail(`posted: not a readable PDF (${e.message})`));

let failed = null;
let veraNote = '';
if (before.sha256 !== after.sha256) {
  const vera = ensureVeraPdf();
  if (!vera.ok) veraNote = `veraPDF skipped: ${vera.why}`;
  else {
    const { results, error } = validatePdfUa([a.path, b.path]);
    if (error) veraNote = error;
    else failed = { original: results.get(a.path)?.failed, posted: results.get(b.path)?.failed, describe: results.get(b.path)?.describe };
  }
}
const verdict = comparePdfs(before, after, failed);
if (!outArg) rmSync(DIR, { recursive: true, force: true });

if (JSON_OUT) {
  console.log(JSON.stringify({ original: { source: original, ...before }, posted: { source: posted, ...after }, verdict, veraPDF: failed ? { original: failed.original, posted: failed.posted } : veraNote }, null, 2));
  process.exit(0);
}

const show = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
const rows = [
  ['Pages', before.pages, after.pages],
  ['Producer', before.producer, after.producer],
  ['Title', before.title, after.title],
  ['XMP title', before.xmpTitle, after.xmpTitle],
  ['DisplayDocTitle', before.displayDocTitle, after.displayDocTitle],
  ['Language (catalog)', before.lang, after.lang],
  ['Language (root tag)', before.rootLang, after.rootLang],
  ['Marked as tagged', before.marked, after.marked],
  ['Structure elements', before.elements, after.elements],
  ...Object.keys(before.groups).map((g) => [`  ${g}`, before.groups[g], after.groups[g]]),
  ['Figures with alt text', before.figuresWithAlt, after.figuresWithAlt],
  ['Bookmarks', before.bookmarks, after.bookmarks],
  ['PDF/UA identifier', before.pdfua, after.pdfua],
  ['Pages with orphaned tag links', before.orphanPages, after.orphanPages],
];
const w = Math.max(...rows.map(([k]) => k.length));
const wa = Math.max(8, ...rows.map(([, x]) => show(x).length));
console.log(`\n${'Original'.padStart(w + 2 + 8)}${' '.repeat(wa - 6)}Posted`);
for (const [k, x, y] of rows) console.log(`${k.padEnd(w)}  ${show(x).slice(0, 40).padEnd(wa)}  ${show(y).slice(0, 40)}`);

console.log('\nWhat the platform did');
if (verdict.unchanged) {
  console.log('  Served unchanged: the posted file is byte-for-byte the original.');
} else {
  const tagsLine = {
    kept: 'kept: every kind of structure in the original is still there',
    'partly kept': `partly kept: fewer ${verdict.lostGroups.join(', ')} than the original`,
    flattened: 'flattened: a tree is there, but the headings, lists, tables and figures became plain paragraphs',
    removed: `removed: no structure tree, yet ${verdict.orphanPages} page(s) still point into one (the tags were stripped when the file was rewritten)`,
    missing: 'missing: the posted copy has no structure tree',
    'untagged in both': 'untagged in both files',
  }[verdict.tags];
  console.log(`  Tags: ${tagsLine}`);
  if (verdict.notMarked) console.log('  Tagged, but not marked as tagged (MarkInfo): many readers and checkers will treat it as untagged.');
  console.log(`  Language: in the catalog, ${verdict.language}; on the root tag, ${verdict.rootLanguage}`);
  console.log(`  Title: ${verdict.title}${verdict.title === 'replaced' ? ` ("${before.title}" → "${after.title}")` : ''}; DisplayDocTitle: ${verdict.displayDocTitle}`);
  console.log(`  PDF/UA identifier: ${verdict.pdfua}; bookmarks: ${verdict.bookmarks}`);
  console.log('  ("not in the original" means there was nothing to keep: the original never had it.)');
  if (verdict.packet) console.log(`  Probably a packet: ${after.pages} pages against the original's ${before.pages}. The figures above describe the whole file.`);
  if (verdict.newFailures) {
    console.log(verdict.newFailures.length
      ? `  PDF/UA rules newly failing (veraPDF): ${failed.describe(verdict.newFailures)}`
      : '  PDF/UA (veraPDF): no rule fails in the posted copy that passed in the original.');
  } else {
    console.log(`  ${veraNote || 'veraPDF did not run.'}`);
  }
}
if (outArg) console.log(`\nDownloads kept in ${DIR}`);
