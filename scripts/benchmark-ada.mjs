#!/usr/bin/env node
/**
 * The engine benchmark's Ada runner (docs/audit/engine-benchmark-2026-10.md).
 * Imports each Word file the way the app does and checks it: the body with
 * checkDocument, the header and footer pictures with sectionFindings, as the
 * desk does (store.ts loadDashboardData). Prints JSON: each file's headings,
 * pictures, import notes, and every finding with the heading it sits under.
 *
 *   node scripts/benchmark-ada.mjs [--tree <dir>] <file.docx>...
 *
 * --tree runs another commit's engine, extracted with
 *   git archive <commit> app design-system scripts/harness | tar -x -C <dir>
 * and node_modules linked into <dir>. Without it, this checkout's engine runs.
 */
import { build } from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DOMParser as XmlParser } from 'linkedom';

const args = process.argv.slice(2);
const at = args.indexOf('--tree');
const TREE = at >= 0 ? resolve(args.splice(at, 2)[1]) : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(TREE, '.benchmark-bundle.mjs');
await build({ entryPoints: [resolve(TREE, 'scripts/harness/rules-entry.ts')], bundle: true, format: 'esm', platform: 'node', target: 'es2022', packages: 'external', outfile: OUT, logLevel: 'warning' });
const mod = await import(pathToFileURL(OUT).href);
rmSync(OUT, { force: true });
const parseXml = (xml) => new XmlParser().parseFromString(xml, 'text/xml');

const result = {};
for (const path of args) {
  const name = basename(path);
  const r = await mod.importDocx.importDocx(new Uint8Array(readFileSync(path)), name, parseXml);
  const doc = r.content;
  const headings = [];
  const figures = {};
  doc.descendants((n, pos) => {
    if (n.type.name === 'heading') headings.push({ pos, level: n.attrs.level, text: n.textContent });
    if (n.type.name === 'figure') figures[n.attrs.id] = { pos, alt: n.attrs.alt };
  });
  /** The heading a position sits under: how a finding is matched to a planted row. */
  const under = (pos) => {
    let h = '(before any heading)';
    for (const x of headings) if (x.pos <= pos) h = x.text; else break;
    return h;
  };
  const findings = mod.check.checkDocument(doc, { prose: true, title: r.title }).map((f) => {
    const pos = f.anchor?.kind === 'figure' && figures[f.anchor.figureId] ? figures[f.anchor.figureId].pos : f.from;
    return { id: f.id, severity: f.severity, title: f.title, excerpt: f.excerpt ?? '', under: typeof pos === 'number' ? under(pos) : '(document)' };
  });
  for (const f of mod.editorFindings.sectionFindings({ headerImage: r.headerImage, footerImage: r.footerImage })) {
    findings.push({ id: f.id, severity: f.severity, title: f.title, excerpt: f.excerpt, under: `(${f.anchor.section})` });
  }
  result[name] = {
    title: r.title,
    lang: doc.attrs?.lang,
    notes: r.notes,
    headerImage: r.headerImage && { id: r.headerImage.id, alt: r.headerImage.alt },
    footerImage: r.footerImage && { id: r.footerImage.id, alt: r.footerImage.alt },
    headings: headings.map((h) => `h${h.level} ${h.text}`),
    figures,
    findings,
  };
}
console.log(JSON.stringify(result, null, 2));
