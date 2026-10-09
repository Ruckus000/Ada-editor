#!/usr/bin/env node
/**
 * Gate for the posted-PDF checker (posted-pdf.mjs, check-posted-pdf.mjs).
 *
 * Exports a seed document, then does to it what agenda systems were seen doing
 * (docs/audit/agenda-platforms-2026-10.md): re-saving it, stripping its tags,
 * dropping its language, replacing its title, merging it into a packet,
 * flattening its tags to paragraphs. The checker must name each one. With
 * Java, veraPDF must also find no new failure in a faithful re-save and some
 * in a stripped copy; without it that half is skipped locally and fails in CI.
 *
 *   node scripts/verify-check-posted.mjs
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef } from 'pdf-lib';
import { loadPdfHarness } from './harness/pdf-harness.mjs';
import { comparePdfs, inspectPdf } from './posted-pdf.mjs';
import { ensureVeraPdf, validatePdfUa } from './verapdf.mjs';

let passed = 0;
const failures = [];
const check = async (label, fn) => {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${label}`);
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
    console.log(`  FAIL ${label} — ${error.message}`);
  }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assertion failed'); };
const eq = (actual, expected, what = '') =>
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${what ? what + ': ' : ''}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

const { mod, fonts } = await loadPdfHarness('check-posted');
const seed = mod.seed.SEEDS.find((s) => s.id === 'water-quality');
const exported = await mod.exportPdf.exportPdf(mod.seed.buildSeedDocument(seed.content), { title: seed.title, header: seed.content.header, footer: seed.content.footer }, fonts);
if (!exported.ok) throw new Error('the seed document did not export');
const ORIGINAL = exported.bytes;

/* ---------- what platforms do, done with pdf-lib ---------- */

const load = (bytes) => PDFDocument.load(bytes, { updateMetadata: false });
const save = async (doc) => new Uint8Array(await doc.save({ useObjectStreams: true }));
const N = (key) => PDFName.of(key);
/** Every structure element in the tree, as dictionaries. */
const elementsOf = (doc) => {
  const out = [];
  const visit = (value) => {
    const node = value instanceof PDFRef ? doc.context.lookup(value) : value;
    if (node instanceof PDFArray) node.asArray().forEach(visit);
    else if (node instanceof PDFDict && node.get(N('S'))) { out.push(node); visit(node.get(N('K'))); }
  };
  visit(doc.catalog.lookup(N('StructTreeRoot'), PDFDict).get(N('K')));
  return out;
};

const variants = {
  resaved: async () => save(await load(ORIGINAL)),
  stripped: async () => {
    const doc = await load(ORIGINAL);
    doc.catalog.delete(N('StructTreeRoot'));
    doc.catalog.delete(N('MarkInfo'));
    return save(doc);
  },
  languageDropped: async () => {
    const doc = await load(ORIGINAL);
    doc.catalog.delete(N('Lang'));
    elementsOf(doc)[0].delete(N('Lang'));
    return save(doc);
  },
  titleReplaced: async () => {
    const doc = await load(ORIGINAL);
    doc.setTitle('File 26-123 - Exhibit A');
    return save(doc);
  },
  packet: async () => {
    const source = await load(ORIGINAL);
    const packet = await PDFDocument.create();
    for (const page of await packet.copyPages(source, source.getPageIndices())) packet.addPage(page);
    packet.addPage();
    packet.addPage();
    return save(packet);
  },
  flattened: async () => {
    const doc = await load(ORIGINAL);
    for (const element of elementsOf(doc)) {
      if (element.get(N('S'))?.decodeText() !== 'Document') element.set(N('S'), N('P'));
    }
    return save(doc);
  },
};

console.log('Posted-PDF checker — verdicts');

const original = await inspectPdf(ORIGINAL);
await check('reads the original: tagged, with headings, a table, a language change and a language on the root tag', () => {
  assert(original.tagged && original.marked, 'tagged and marked');
  assert(original.groups.headings > 0 && original.groups.tables > 0 && original.groups.languageSpans > 0, `headings, a table and a Span (${JSON.stringify(original.groups)})`);
  eq(original.lang, 'en', 'catalog /Lang');
  eq(original.rootLang, 'en', 'root /Lang');
  eq(original.title, seed.title, 'title');
  eq(original.pdfua, 1, 'PDF/UA identifier');
  eq(original.orphanPages, 0, 'no orphaned pages');
});

const bytes = { original: ORIGINAL };
for (const [label, make] of Object.entries(variants)) bytes[label] = await make();
const verdicts = {};
for (const [label, b] of Object.entries(bytes)) verdicts[label] = comparePdfs(original, await inspectPdf(b));

await check('the same bytes are "served unchanged"', () => eq(verdicts.original.unchanged, true));
await check('a faithful re-save keeps everything', () => {
  const v = verdicts.resaved;
  eq([v.unchanged, v.tags, v.language, v.rootLanguage, v.title, v.pdfua, v.packet], [false, 'kept', 'kept', 'kept', 'kept', 'kept', false]);
});
await check('stripped tags are "removed", recognised by the pages still pointing into a tree', () => {
  eq(verdicts.stripped.tags, 'removed');
  assert(verdicts.stripped.orphanPages > 0, 'orphaned pages counted');
});
await check('a dropped language is reported for the catalog and the root tag', () => {
  eq([verdicts.languageDropped.language, verdicts.languageDropped.rootLanguage, verdicts.languageDropped.tags], ['dropped', 'dropped', 'kept']);
});
await check('a replaced title is reported, the tags still kept', () => {
  eq([verdicts.titleReplaced.title, verdicts.titleReplaced.tags], ['replaced', 'kept']);
});
await check('a merged packet is recognised, and its lost tags reported', () => {
  eq([verdicts.packet.packet, verdicts.packet.tags], [true, 'removed']);
});
await check('tags rewritten as paragraphs are "flattened"', () => eq(verdicts.flattened.tags, 'flattened'));

console.log('\nPosted-PDF checker — veraPDF');
const vera = ensureVeraPdf();
if (!vera.ok) {
  if (process.env.CI) {
    failures.push(`veraPDF could not run: ${vera.why}. CI is where this must run, so a skip here is a failure.`);
    console.log(`  FAIL veraPDF could not run — ${vera.why}`);
  } else {
    console.log(`  SKIPPED — ${vera.why}. Install Java 11+ and Maven to run this half.`);
  }
} else {
  const dir = mkdtempSync(join(tmpdir(), 'ada-check-posted-'));
  const files = Object.fromEntries(['original', 'resaved', 'stripped'].map((label) => {
    const path = join(dir, `${label}.pdf`);
    writeFileSync(path, bytes[label]);
    return [label, path];
  }));
  const { results, error } = validatePdfUa(Object.values(files));
  const failed = (label) => results.get(files[label])?.failed;
  await check('veraPDF ran on every file', () => assert(!error && Object.keys(files).every((l) => failed(l)), error ?? 'a file had no result'));
  await check('the original passes PDF/UA-1', () => eq(failed('original'), []));
  await check('a faithful re-save fails no new rule', () => {
    eq(comparePdfs(original, { ...original, sha256: 'x' }, { original: failed('original'), posted: failed('resaved') }).newFailures, []);
  });
  await check('a stripped copy fails new rules, and the checker lists them', () => {
    const v = comparePdfs(original, { ...original, sha256: 'x' }, { original: failed('original'), posted: failed('stripped') });
    assert(v.newFailures?.length > 0, `expected new failures, got ${JSON.stringify(v.newFailures)}`);
  });
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\nFailures:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
