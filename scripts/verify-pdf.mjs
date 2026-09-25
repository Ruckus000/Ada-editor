#!/usr/bin/env node
/**
 * PDF/UA gate for the PDF export (app/_editor/exportPdf.ts).
 *
 * Two halves, the same promise the HTML export makes: the PDF is exactly as
 * accessible as the findings say.
 *
 *   1. Structure. The exporter's own tags are asserted directly on the file:
 *      headings, lists, links tied to their annotations, language spans, figure
 *      alt text, the reading order of the header and footer. A PDF can pass
 *      veraPDF with its links silently untagged; these checks can't.
 *   2. Conformance. veraPDF, the PDF Association's open-source validator,
 *      checks every export against PDF/UA-1 (ISO 14289-1). A document the
 *      checker passes must pass; a seed document the checker flags must fail
 *      on exactly the clauses its findings map to — never on anything else.
 *
 * veraPDF runs on Java. It is fetched from Maven Central on first run
 * (scripts/verapdf/pom.xml → scripts/verapdf/lib, gitignored). Without Java
 * and Maven the conformance half is skipped locally; in CI a skip fails.
 *
 *   node scripts/verify-pdf.mjs [--verbose] [--out <dir>]
 *
 * --out keeps the exported PDFs for a look in a real reader.
 */

import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { inflateSync } from 'node:zlib';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const TMP = resolve(HERE, '.pdf-bundle.mjs');
const VERAPDF = resolve(HERE, 'verapdf');
const VERBOSE = process.argv.includes('--verbose');
const outArg = process.argv.indexOf('--out');
const OUT = outArg > 0 ? resolve(process.argv[outArg + 1] ?? '') : mkdtempSync(join(tmpdir(), 'ada-pdf-'));

let passed = 0;
const failures = [];
const check = async (name, fn) => {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.log(`  FAIL ${name} — ${error.message}`);
  }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assertion failed'); };
const eq = (actual, expected, what = '') =>
  assert(actual === expected, `${what ? what + ': ' : ''}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

/* ---------- bundle the exporter ---------- */

await build({
  entryPoints: [resolve(HERE, 'harness/pdf-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  packages: 'external',
  outfile: TMP,
  logLevel: 'warning',
});
process.on('exit', () => rmSync(TMP, { force: true }));
const mod = await import(pathToFileURL(TMP).href);
const { schema } = mod;
const { exportPdf } = mod.exportPdf;
const N = schema.nodes;
const M = schema.marks;

// The same bytes the browser fetches from public/.
const fonts = Object.fromEntries(Object.entries(mod.exportPdf.PDF_FONT_FILES).map(([face, url]) => [face, readFileSync(join(ROOT, 'public', url))]));

/* ---------- documents ---------- */

const t = (s, marks = []) => schema.text(s, marks);
const para = (...content) => N.paragraph.create(null, content.map((c) => (typeof c === 'string' ? t(c) : c)));
const heading = (level, s) => N.heading.create({ level }, t(s));
const item = (...blocks) => N.list_item.create(null, blocks);
const PROSE = 'Residents may review the full application at the planning office during business hours, or online at any time, and may submit written comments before the hearing date.';
const ALT = 'Site plan: the shelter sits north of the library.';

/** Every construct the exporter draws, long enough to run onto several pages. */
const featureDoc = () => N.doc.create({ lang: 'en' }, [
  heading(1, 'Everything the exporter draws'),
  para('Plain, ', t('bold', [M.strong.create()]), ', ', t('italic', [M.em.create()]), ', ', t('underlined', [M.underline.create()]), ', ',
    t('dark red', [M.textColor.create({ color: '#8b0000' })]), ', ', t('highlighted', [M.highlight.create({ color: 'yellow' })]), ' and ',
    t('large', [M.fontSize.create({ size: 24 })]), ' text.'),
  para('Read ', t('the hearing agenda', [M.link.create({ href: 'https://city.example.gov/agenda' })]), ' first. ',
    t('Llame al 311 para ', [M.lang.create({ lang: 'es' })]), t('ayuda en español', [M.lang.create({ lang: 'es' }), M.link.create({ href: 'https://city.example.gov/es' })]), '.'),
  para('Line one', N.hard_break.create(), 'line two.'),
  para('A long address: ', t('https://city.example.gov/planning/applications/2026/variance-requests/parcel-one-and-parcel-two/supporting-documents', [M.link.create({ href: 'https://city.example.gov/x' })])),
  heading(2, 'Lists'),
  N.bullet_list.create(null, [item(para('First bullet')), item(para('Second bullet'), N.ordered_list.create({ order: 3 }, [item(para('Third step')), item(para('Fourth step'))])), item(para(PROSE))]),
  N.paragraph.create({ indent: 2 }, [t(`Indented. ${PROSE}`)]),
  N.figure.create({ id: 'img-1', alt: ALT, label: 'site plan' }),
  heading(2, 'Enough text for more pages'),
  ...Array.from({ length: 14 }, (_, i) => para(`${i + 1}. ${PROSE} ${PROSE}`)),
  heading(3, 'Last heading'),
  para('The end.'),
]);
const FEATURE_META = { title: 'Exporter feature sheet', header: 'City Planning Commission\nDraft for publication', footer: 'Questions? Call 311.' };

/* ---------- reading the file ---------- */

/** PDFKit writes every object dictionary uncompressed: id → its text. */
const objectsOf = (bytes) => {
  const text = Buffer.from(bytes).toString('latin1');
  const objects = new Map();
  for (const m of text.matchAll(/(\d+) 0 obj\n([\s\S]*?)\nendobj/g)) objects.set(Number(m[1]), m[2]);
  return { text, objects };
};
const withType = (objects, type) => [...objects.values()].filter((o) => o.includes(`/S /${type}\n`) || new RegExp(`/S /${type}\\b`).test(o));
const refs = (s) => [...s.matchAll(/(\d+) 0 R/g)].map((m) => Number(m[1]));
/** Every page's content stream, inflated: what is drawn and how it is marked. */
const contentStreams = (bytes) => {
  const buffer = Buffer.from(bytes);
  const text = buffer.toString('latin1');
  const streams = [];
  for (const m of text.matchAll(/\/Filter \/FlateDecode\n>>\nstream\n/g)) {
    const start = m.index + m[0].length;
    const end = text.indexOf('\nendstream', start);
    try {
      streams.push(inflateSync(buffer.subarray(start, end)).toString('latin1'));
    } catch {
      // A font program or image, not page content.
    }
  }
  return streams.filter((s) => s.includes('BDC'));
};
/** A PDF string as text: a literal `(…)` or UTF-16BE hex `<FEFF…>`. */
const pdfString = (raw) => {
  const value = raw.trim();
  if (value.startsWith('(')) return value.slice(1, -1).replace(/\\([()\\])/g, '$1');
  const hex = /^<(?:feff|FEFF)([0-9a-fA-F]*)>$/.exec(value);
  return hex ? Buffer.from(hex[1], 'hex').swap16().toString('utf16le') : value;
};
/** An info-dictionary entry (PDFKit writes each value as its own object). */
const infoEntry = ({ text, objects }, key) => {
  const m = new RegExp(`/${key} (?:(\\d+) 0 R|(\\([^)]*\\)|<[0-9a-fA-F]*>))`).exec(text);
  return m ? pdfString(m[1] ? objects.get(Number(m[1])) ?? '' : m[2]) : null;
};

const exported = new Map();
const save = (name, bytes) => {
  mkdirSync(OUT, { recursive: true });
  const file = join(OUT, `${name}.pdf`);
  writeFileSync(file, bytes);
  exported.set(name, file);
};

/* ---------- structure ---------- */

console.log('PDF export — structure');

await check('exports every construct, across pages', async () => {
  const result = await exportPdf(featureDoc(), FEATURE_META, fonts);
  assert(result.ok, `refused: ${JSON.stringify(result.missing)}`);
  assert(result.pages >= 3, `expected at least 3 pages, got ${result.pages}`);
  save('features', result.bytes);
  const file = objectsOf(result.bytes);
  const { text, objects } = file;
  assert(text.startsWith('%PDF-1.7'), 'PDF 1.7');
  assert(/\/Lang \(en\)/.test(text), 'document language in the catalog (WCAG 3.1.1)');
  assert(/\/DisplayDocTitle true/.test(text), 'the title, not the file name, is what a reader shows');
  eq(infoEntry(file, 'Title'), 'Exporter feature sheet', 'title in the info dictionary');
  assert(text.includes('<pdfuaid:part>1</pdfuaid:part>'), 'PDF/UA identification in the XMP metadata');
  assert(/\/Marked true/.test(text), 'marked as tagged');
  assert(text.includes('/FontFile2'), 'fonts are embedded');
  assert(!/\/BaseFont \/Helvetica/.test(text), 'no unembedded standard font');
  assert(!text.includes('/CIDSet'), 'no CIDSet (PDFKit writes an incomplete one; see omitCidSets)');
  for (const type of ['Document', 'H1', 'H2', 'H3', 'P', 'L', 'LI', 'Lbl', 'LBody', 'Link', 'Span', 'Figure', 'Div']) {
    assert(withType(objects, type).length, `a /${type} structure element`);
  }
  eq(withType(objects, 'L').filter((o) => o.includes('/ListNumbering /Decimal')).length, 1, 'the ordered list says it is numbered');
  const spans = withType(objects, 'Span');
  assert(spans.every((o) => o.includes('/Lang (es)')), 'the Spanish passage is a Span with /Lang (es) (WCAG 3.1.2)');
  const links = withType(objects, 'Link');
  eq(links.length, 3, 'one Link element per link');
  assert(links.some((o) => o.includes('/Lang (es)')), 'a link inside the Spanish passage keeps its language');
  assert(links.every((o) => o.includes('/Type /OBJR')), 'every Link element owns its annotation (PDF/UA 7.18.1)');
  const annots = [...objects.values()].filter((o) => o.includes('/Subtype /Link'));
  assert(annots.length >= 4, `a link annotation per line (the long address wraps), got ${annots.length}`);
  assert(annots.every((o) => /\/StructParent \d+/.test(o)), 'every annotation is in the structure tree');
  assert(annots.some((o) => o.includes('/Contents (the hearing agenda)')), 'an annotation describes its link (PDF/UA 7.18.5)');
  assert(/\/Tabs \/S/.test(text), 'tab order follows the structure');
  const figures = withType(objects, 'Figure');
  eq(figures.length, 1, 'one Figure');
  assert(figures[0].includes(`/Alt (${ALT})`), 'the figure carries its alt text');
  // Reading order: the header is read first and the footer last, once each.
  const documentKids = refs(/\/K \[([^\]]*)\]/.exec(withType(objects, 'Document')[0])?.[1] ?? '');
  const first = objects.get(documentKids[0]);
  const last = objects.get(documentKids[documentKids.length - 1]);
  assert(first && /\/S \/Div\b/.test(first), 'the header comes first in reading order');
  assert(last && /\/S \/Div\b/.test(last), 'the footer comes last in reading order');
  eq(withType(objects, 'Div').length, 2, 'the header and footer are read once each, not per page');
  const pages = contentStreams(result.bytes);
  eq(pages.length, result.pages, 'one content stream per page');
  const pagination = pages.map((page) => (page.match(/\/Artifact <<\n\/Type \/Pagination\n>> BDC/g) ?? []).length);
  eq(pagination[0], 1, 'first page: the footer repeat is an artifact, the header is content');
  eq(pagination[pagination.length - 1], 1, 'last page: the header repeat is an artifact, the footer is content');
  assert(pagination.slice(1, -1).every((n) => n === 2), 'middle pages: header and footer are both artifacts');
});

await check('a figure without alt text has no /Alt — never filled in from its label', async () => {
  const result = await exportPdf(N.doc.create(null, [heading(1, 'Map'), N.figure.create({ id: 'img-1', alt: '', label: 'location map' })]), { title: 'Map', header: '', footer: '' }, fonts);
  assert(result.ok, 'exported');
  save('figure-without-alt', result.bytes);
  const figure = withType(objectsOf(result.bytes).objects, 'Figure')[0];
  assert(figure && !figure.includes('/Alt'), 'no /Alt on the figure');
});

await check('the document language and title reach the file', async () => {
  const result = await exportPdf(N.doc.create({ lang: 'es' }, [heading(1, 'Aviso'), para('Llame al 311.')]), { title: '  ', header: '', footer: '' }, fonts);
  assert(result.ok, 'exported');
  save('spanish', result.bytes);
  const file = objectsOf(result.bytes);
  const { text, objects } = file;
  assert(/\/Lang \(es\)/.test(text), 'catalog /Lang is the document language');
  eq(infoEntry(file, 'Title'), 'Untitled document', 'a blank title falls back, as the HTML export does');
  eq(withType(objects, 'Span').length, 0, 'text in the page language is not a language change');
});

await check('refuses text the embedded font cannot draw, naming the characters', async () => {
  const result = await exportPdf(N.doc.create(null, [para('Status: Готово — Ελληνικά')]), { title: 'x', header: 'עברית', footer: '' }, fonts);
  assert(!result.ok, 'refused rather than drawn as empty boxes');
  for (const ch of ['Г', 'Ε', 'ע']) assert(result.missing.includes(ch), `${ch} is reported missing`);
  assert(!result.missing.includes('—') && !result.missing.includes(' '), 'covered characters are not reported');
});

/* ---------- conformance ---------- */

// Checker rules and the PDF/UA-1 clause each one's failure breaks. A seed
// document must fail veraPDF on exactly these clauses for its findings.
const CLAUSE_FOR_RULE = {
  'img-alt-missing': '7.3-1', // Figure tags shall include alternative text
  'heading-skip': '7.4.2-1', // Heading levels shall not be skipped
  'document-no-h1': '7.4.2-1', // …and the first heading shall be H1
};

/** A finding's rule, from its stable id (check.ts: `rule:snippet`, and
 *  `img-alt-<figure>` for a missing alt). */
const ruleOf = (id) => {
  const base = id.split(/[:#]/)[0];
  return /^img-alt-(?!suspicious)/.test(base) ? 'img-alt-missing' : base;
};

const seedClauses = new Map();
for (const seed of mod.seed.SEEDS) {
  const doc = mod.seed.buildSeedDocument(seed.content);
  await check(`seed "${seed.id}" exports`, async () => {
    const result = await exportPdf(doc, { title: seed.title, header: seed.content.header, footer: seed.content.footer }, fonts);
    assert(result.ok, `refused: ${JSON.stringify(result.missing)}`);
    save(`seed-${seed.id}`, result.bytes);
  });
  const findings = mod.check.checkDocument(doc, { prose: true });
  seedClauses.set(`seed-${seed.id}`, [...new Set(findings.map((f) => CLAUSE_FOR_RULE[ruleOf(f.id)]).filter(Boolean))].sort());
}
const expected = new Map([['features', []], ['spanish', []], ['figure-without-alt', ['7.3-1']], ...seedClauses]);

console.log('\nPDF export — PDF/UA-1 conformance (veraPDF)');

const skip = (why) => {
  if (process.env.CI) {
    failures.push(`veraPDF could not run: ${why}. CI is where this must run, so a skip here is a failure.`);
    console.log(`  FAIL veraPDF could not run — ${why}`);
    return;
  }
  console.log(`  SKIPPED — ${why}. Install Java 11+ and Maven to run the conformance half.`);
};

const have = (cmd) => spawnSync(cmd, ['-version'], { stdio: 'ignore' }).error === undefined;
const LIB = join(VERAPDF, 'lib');
const hasJars = () => existsSync(LIB) && readdirSync(LIB).some((f) => f.startsWith('cli-'));

if (!have('java')) {
  skip('java is not installed');
} else {
  if (!hasJars()) {
    if (!have('mvn')) {
      skip('veraPDF is not fetched and mvn is not installed');
    } else {
      console.log('  fetching veraPDF from Maven Central…');
      const fetched = spawnSync('mvn', ['-q', '-f', join(VERAPDF, 'pom.xml'), 'dependency:copy-dependencies', `-DoutputDirectory=${LIB}`], { stdio: VERBOSE ? 'inherit' : 'pipe', encoding: 'utf8' });
      if (fetched.status !== 0) skip(`mvn could not fetch veraPDF: ${(fetched.stderr || fetched.stdout || '').trim().split('\n').slice(-3).join(' ')}`);
    }
  }
  if (hasJars()) {
    const files = [...exported.values()];
    const run = spawnSync('java', ['-cp', `${LIB}/*`, 'org.verapdf.apps.GreenfieldCliWrapper', '--flavour', 'ua1', '--format', 'json', ...files], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    let report = null;
    try {
      report = JSON.parse(run.stdout);
    } catch {
      failures.push(`veraPDF produced no report (exit ${run.status}): ${(run.stderr || '').trim().split('\n').slice(-3).join(' ')}`);
    }
    for (const job of report?.report?.jobs ?? []) {
      const name = [...exported].find(([, file]) => file === job.itemDetails.name)?.[0];
      const result = [job.validationResult].flat()[0];
      await check(`${name} ${expected.get(name).length ? `fails PDF/UA-1 on exactly ${expected.get(name).join(', ')}` : 'passes PDF/UA-1'}`, () => {
        assert(result, `no validation result (${job.jobEndStatus ?? 'unknown status'})`);
        const failed = [...new Set((result.details?.ruleSummaries ?? []).map((r) => `${r.clause}-${r.testNumber}`))].sort();
        const want = expected.get(name);
        const describe = (ids) => ids.map((id) => {
          const rule = result.details.ruleSummaries.find((r) => `${r.clause}-${r.testNumber}` === id);
          return rule ? `${id} (${rule.description.slice(0, 90)}…)` : id;
        }).join('; ') || 'none';
        assert(JSON.stringify(failed) === JSON.stringify(want), `veraPDF failed ${describe(failed)}; expected ${want.join(', ') || 'none'}`);
        if (VERBOSE && failed.length) console.log(`         ${describe(failed)}`);
      });
    }
    const validated = report?.report?.jobs?.length ?? 0;
    if (report && validated !== exported.size) failures.push(`veraPDF validated ${validated} of ${exported.size} exports`);
  }
}

if (outArg > 0) console.log(`\nPDFs kept in ${OUT}`);
else rmSync(OUT, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\nFailures:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
