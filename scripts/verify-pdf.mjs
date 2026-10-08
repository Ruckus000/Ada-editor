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
import { ensureVeraPdf, validatePdfUa } from './verapdf.mjs';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { JPEG_3X2, png, withOrientation } from './harness/images.mjs';
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
// A cell: a string (td), { th }, or { td|th, colspan, rowspan }; its content a string or blocks.
const cell = (c) => {
  const o = typeof c === 'string' ? { td: c } : c;
  const header = 'th' in o;
  const content = header ? o.th : o.td;
  return (header ? N.table_header : N.table_cell).create({ colspan: o.colspan ?? 1, rowspan: o.rowspan ?? 1, colwidth: null },
    typeof content === 'string' ? [para(content)] : content);
};
const table = (rows, caption = '') => N.table.create({ caption }, rows.map((r) => N.table_row.create(null, r.map(cell))));
// Real pictures, by key, as the browser hands them to exportPdf.
const keyOf = (bytes) => createHash('sha256').update(bytes).digest('hex');
const CHART = png(40, 30, { alpha: true });
const PHOTO = withOrientation(JPEG_3X2, 6);
const IMAGES = new Map([[keyOf(CHART), { data: CHART }], [keyOf(PHOTO), { data: PHOTO }]]);
const picture = (id, alt, bytes, width, height, layout = {}) => N.figure.create({ id, alt, label: id, image: keyOf(bytes), width, height, ...layout });
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
  picture('img-2', 'Chart of weekly visits', CHART, 40, 30),
  // Rotated by its EXIF tag: displayed 2 wide by 3 tall.
  picture('img-3', 'Photo of the library entrance', PHOTO, 2, 3),
  // Its bytes aren't available: the placeholder, with its alt.
  N.figure.create({ id: 'img-4', alt: 'Floor plan', label: 'floor plan', image: 'f'.repeat(64) }),
  // Sized and placed: half the column, centred; a quarter, at the right.
  picture('img-5', 'Visits, medium', CHART, 40, 30, { size: 'medium', align: 'center' }),
  picture('img-6', 'Visits, small', CHART, 40, 30, { size: 'small', align: 'right' }),
  table([[{ th: 'Day' }, { th: 'Hours' }], ['Monday', '9 to 6'], ['Saturday', '10 to 2']], 'Library hours'),
  heading(2, 'Enough text for more pages'),
  ...Array.from({ length: 14 }, (_, i) => para(`${i + 1}. ${PROSE} ${PROSE}`)),
  heading(3, 'Last heading'),
  para('The end.'),
]);
const FEATURE_META = { title: 'Exporter feature sheet', header: 'City Planning Commission\nDraft for publication', footer: 'Questions? Call 311.', headerImage: { alt: 'City seal', image: keyOf(CHART), width: 40, height: 30 } };

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
  const result = await exportPdf(featureDoc(), FEATURE_META, fonts, IMAGES);
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
  for (const type of ['Document', 'H1', 'H2', 'H3', 'P', 'L', 'LI', 'Lbl', 'LBody', 'Link', 'Span', 'Figure', 'Div', 'Table', 'Caption', 'TR', 'TH', 'TD']) {
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
  eq(figures.length, 7, 'a Figure per figure (four pictures, two placeholders) and the header logo, read once');
  for (const alt of [ALT, 'Chart of weekly visits', 'Photo of the library entrance', 'Floor plan', 'Visits, medium', 'Visits, small', 'City seal']) {
    assert(figures.some((f) => f.includes(`/Alt (${alt})`)), `a figure carries its alt text: ${alt}`);
  }
  const xobjects = [...objects.values()].filter((o) => o.includes('/Subtype /Image'));
  assert(xobjects.some((o) => o.includes('/Filter /DCTDecode')), 'the JPEG is embedded as a JPEG');
  assert(xobjects.some((o) => o.includes('/SMask')), 'the PNG keeps its transparency as a soft mask');
  // Each picture, plus the PNG's soft mask (itself an image XObject).
  eq(xobjects.filter((o) => o.includes('/SMask')).length + xobjects.filter((o) => o.includes('/Filter /DCTDecode')).length, 2, 'both pictures are drawn');
  const bboxes = figures.map((f) => /\/BBox \[([^\]]*)\]/.exec(f)?.[1]).filter(Boolean).map((b) => b.trim().split(/\s+/).map(Number));
  assert(bboxes.some(([x1, y1, x2, y2]) => Math.abs((x2 - x1) - 30) < 0.5 && Math.abs(Math.abs(y2 - y1) - 22.5) < 0.5), `the chart is drawn at its own size, 40×30 px = 30×22.5 pt (bboxes ${JSON.stringify(bboxes)})`);
  assert(bboxes.some(([x1, y1, x2, y2]) => Math.abs((x2 - x1) - 1.5) < 0.5 && Math.abs(Math.abs(y2 - y1) - 2.25) < 0.5), 'the rotated photo is taller than wide, as displayed');
  // US Letter, 72 pt margins: a 468 pt column from x = 72.
  const bboxOf = (alt) => { const f = figures.find((o) => o.includes(`/Alt (${alt})`)); return /\/BBox \[([^\]]*)\]/.exec(f ?? '')?.[1].trim().split(/\s+/).map(Number); };
  const near = (a, b) => Math.abs(a - b) < 0.5;
  const [c1, , c2] = bboxOf('Chart of weekly visits') ?? [];
  assert(near(c1, 72 + (468 - 30) / 2) && near(c2 - c1, 30), `Original size is centred by default (x ${c1}–${c2})`);
  const [m1, m2y, m2, m1y] = bboxOf('Visits, medium') ?? [];
  assert(near(m2 - m1, 234) && near(m1, 72 + 117) && near(Math.abs(m1y - m2y), 175.5), `Medium: half the column, centred, in proportion (${[m1, m2y, m2, m1y]})`);
  const [s1, , s2] = bboxOf('Visits, small') ?? [];
  assert(near(s2 - s1, 117) && near(s2, 72 + 468), `Small, right: a quarter of the column, against its right edge (x ${s1}–${s2})`);
  // Reading order: the header is read first and the footer last, once each.
  const documentKids = refs(/\/K \[([^\]]*)\]/.exec(withType(objects, 'Document')[0])?.[1] ?? '');
  const first = objects.get(documentKids[0]);
  const last = objects.get(documentKids[documentKids.length - 1]);
  assert(first && /\/S \/Div\b/.test(first), 'the header comes first in reading order');
  assert(last && /\/S \/Div\b/.test(last), 'the footer comes last in reading order');
  eq(withType(objects, 'Div').length, 2, 'the header and footer are read once each, not per page');
  const headerKids = refs(/\/K \[([^\]]*)\]/.exec(first)?.[1] ?? '').map((id) => objects.get(id) ?? '');
  assert(/\/S \/Figure\b/.test(headerKids[0] ?? '') && headerKids[0].includes('/Alt (City seal)'), 'the header reads its logo first, with its alt text, then its text');
  const pages = contentStreams(result.bytes);
  eq(pages.length, result.pages, 'one content stream per page');
  const pagination = pages.map((page) => (page.match(/\/Artifact <<\n\/Type \/Pagination\n>> BDC/g) ?? []).length);
  eq(pagination[0], 1, 'first page: the footer repeat is an artifact, the header is content');
  eq(pagination[pagination.length - 1], 1, 'last page: the header repeat is an artifact, the footer is content');
  assert(pagination.slice(1, -1).every((n) => n === 2), 'middle pages: header and footer are both artifacts');
});

await check('tables: headers carry a scope, spans are kept, and a long table repeats its header row as an artifact', async () => {
  const rows = [
    [{ th: 'Program' }, { th: 'Deadline' }, { th: 'Notes' }],
    [{ th: 'Food assistance' }, 'May 1', { td: [N.bullet_list.create(null, [item(para('Bring ID')), item(para('Bring proof of address'))])] }],
    [{ th: 'Rent relief' }, { td: 'Rolling, reviewed monthly', colspan: 2 }],
    [{ th: 'Utilities', rowspan: 2 }, 'June 1', PROSE],
    ['July 1', PROSE],
    ...Array.from({ length: 22 }, (_, i) => [{ th: `Program ${i + 1}` }, `Month ${i + 1}`, `${PROSE}`]),
  ];
  const result = await exportPdf(N.doc.create(null, [heading(1, 'Deadlines'), table(rows, 'Benefit deadlines')]), { title: 'Deadlines', header: '', footer: '' }, fonts);
  assert(result.ok, `refused: ${JSON.stringify(result.missing)}`);
  assert(result.pages >= 2, `the table runs onto a second page (got ${result.pages})`);
  save('tables', result.bytes);
  const { objects } = objectsOf(result.bytes);
  eq(withType(objects, 'Table').length, 1, 'one Table');
  eq(withType(objects, 'Caption').length, 1, 'its caption');
  eq(withType(objects, 'TR').length, rows.length, 'a TR per row — the repeated header is not read again');
  const ths = withType(objects, 'TH');
  eq(ths.filter((o) => o.includes('/Scope /Column')).length, 3, 'the header row: column scope');
  // Every body row but "July 1", whose first column is the spanning "Utilities".
  eq(ths.filter((o) => o.includes('/Scope /Row')).length, rows.length - 2, 'a header cell starting a row: row scope');
  assert(ths.every((o) => o.includes('/O /Table')), 'every TH owns a Table attribute dictionary');
  assert([...objects.values()].some((o) => /\/S \/TD\b/.test(o) && o.includes('/ColSpan 2')), 'the merged cell says it spans two columns');
  assert(ths.some((o) => o.includes('/RowSpan 2')), 'the header spanning two rows says so');
  eq(withType(objects, 'L').length, 1, 'the list inside a cell is still a list');
  const pages = contentStreams(result.bytes);
  eq((pages[0].match(/\/Artifact <<\n\/Type \/Pagination\n>> BDC/g) ?? []).length, 0, 'first page: no repeated header');
  assert(pages.slice(1).every((page) => (page.match(/\/Artifact <<\n\/Type \/Pagination\n>> BDC/g) ?? []).length === 1), 'each later page: the header row again, as a pagination artifact');
});

await check('tables: a table without header cells still exports its cells as data', async () => {
  const result = await exportPdf(N.doc.create(null, [heading(1, 'Hours'), table([['Day', 'Hours'], ['Monday', '9 to 6']])]), { title: 'Hours', header: '', footer: '' }, fonts);
  assert(result.ok, 'exported');
  save('table-without-header', result.bytes);
  const { objects } = objectsOf(result.bytes);
  eq(withType(objects, 'TH').length, 0, 'no header cells invented');
  eq(withType(objects, 'TD').length, 4, 'four data cells');
});

await check('no block the editor can hold is dropped from the PDF', async () => {
  // Every block type in the schema must come out as at least one structure
  // element: a type the exporter doesn't know would otherwise vanish silently.
  const sample = {
    paragraph: () => para('x'),
    heading: () => heading(1, 'x'),
    figure: () => N.figure.create({ id: 'img-1', alt: 'x', label: 'x' }),
    bullet_list: () => N.bullet_list.create(null, [item(para('x'))]),
    ordered_list: () => N.ordered_list.create(null, [item(para('x'))]),
    table: () => table([[{ th: 'x' }], ['y']]),
  };
  const blockTypes = Object.values(N).filter((type) => type.isInGroup('block')).map((type) => type.name).sort();
  eq(JSON.stringify(blockTypes), JSON.stringify(Object.keys(sample).sort()), 'every block type has a sample here — add one for a new node');
  for (const [name, make] of Object.entries(sample)) {
    const result = await exportPdf(N.doc.create(null, [make()]), { title: name, header: '', footer: '' }, fonts);
    assert(result.ok, `${name} exported`);
    const { objects } = objectsOf(result.bytes);
    const kids = refs(/\/K \[([^\]]*)\]/.exec(withType(objects, 'Document')[0])?.[1] ?? '');
    assert(kids.length > 0, `${name} produced no structure element — it would be dropped from the PDF`);
  }
});

await check('a figure without alt text has no /Alt — never filled in from its label', async () => {
  const result = await exportPdf(N.doc.create(null, [heading(1, 'Map'), picture('img-1', '', CHART, 40, 30)]), { title: 'Map', header: '', footer: '' }, fonts, IMAGES);
  assert(result.ok, 'exported');
  save('figure-without-alt', result.bytes);
  const { objects } = objectsOf(result.bytes);
  const figure = withType(objects, 'Figure')[0];
  assert(figure && !figure.includes('/Alt'), 'no /Alt on the figure');
  assert([...objects.values()].some((o) => o.includes('/Subtype /Image')), 'the picture itself is there, just unlabelled');
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

await check('a title with & < > is escaped in the XMP and kept as written in the info dictionary', async () => {
  const TITLE = 'Parks & Recreation <draft> agenda';
  const result = await exportPdf(N.doc.create(null, [heading(1, 'Agenda'), para('Item 1.')]), { title: TITLE, header: '', footer: '' }, fonts);
  assert(result.ok, 'exported');
  save('title-with-markup', result.bytes);
  const file = objectsOf(result.bytes);
  eq(infoEntry(file, 'Title'), TITLE, 'the info dictionary keeps the title as written');
  const xmp = /<\?xpacket begin[\s\S]*?<\?xpacket end[^>]*>/.exec(file.text)?.[0] ?? '';
  assert(xmp, 'an XMP packet');
  assert(xmp.includes('<rdf:li xml:lang="x-default">Parks &amp; Recreation &lt;draft&gt; agenda</rdf:li>'), 'dc:title is the escaped title');
  assert(!/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(xmp), 'no bare & in the XMP (it must parse as XML)');
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
const expected = new Map([['features', []], ['spanish', []], ['figure-without-alt', ['7.3-1']], ['tables', []], ['table-without-header', []], ['title-with-markup', []], ...seedClauses]);

console.log('\nPDF export — PDF/UA-1 conformance (veraPDF)');

const skip = (why) => {
  if (process.env.CI) {
    failures.push(`veraPDF could not run: ${why}. CI is where this must run, so a skip here is a failure.`);
    console.log(`  FAIL veraPDF could not run — ${why}`);
    return;
  }
  console.log(`  SKIPPED — ${why}. Install Java 11+ and Maven to run the conformance half.`);
};

const vera = ensureVeraPdf({ verbose: VERBOSE });
if (!vera.ok) {
  skip(vera.why);
} else {
  const { results, error } = validatePdfUa([...exported.values()]);
  if (error) failures.push(error);
  for (const [file, result] of results) {
    const name = [...exported].find(([, f]) => f === file)?.[0];
    await check(`${name} ${expected.get(name).length ? `fails PDF/UA-1 on exactly ${expected.get(name).join(', ')}` : 'passes PDF/UA-1'}`, () => {
      assert(result.failed, `no validation result (${result.status})`);
      const want = expected.get(name);
      assert(JSON.stringify(result.failed) === JSON.stringify(want), `veraPDF failed ${result.describe(result.failed)}; expected ${want.join(', ') || 'none'}`);
      if (VERBOSE && result.failed.length) console.log(`         ${result.describe(result.failed)}`);
    });
  }
  if (!error && results.size !== exported.size) failures.push(`veraPDF validated ${results.size} of ${exported.size} exports`);
}

if (outArg > 0) console.log(`\nPDFs kept in ${OUT}`);
else rmSync(OUT, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\nFailures:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
