#!/usr/bin/env node
/**
 * Runs the rule set over the corpus and reports the finding distribution
 * against the criteria pre-registered in docs/audit/rule-set-spike.md.
 *
 *   node scripts/spike/report.mjs [--json]
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, extname } from 'node:path';
import { marked } from 'marked';
import { parseHTML } from 'linkedom';
import { RULES } from './rules.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(HERE, '../../corpus');
const manifest = JSON.parse(readFileSync(resolve(CORPUS, 'manifest.json'), 'utf8'));

const SEVERITIES = ['blocker', 'violation', 'advisory', 'manual'];

const perDocument = [];
const all = [];

for (const entry of manifest) {
  const source = readFileSync(resolve(CORPUS, entry.name), 'utf8');
  // .rst is not markdown; treat it as plain text so it still exercises the
  // prose rules rather than being silently skipped.
  const html = extname(entry.name) === '.md'
    ? marked.parse(source, { async: false })
    : `<p>${source.split(/\n{2,}/).join('</p><p>')}</p>`;
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);

  // Markdown and plain text carry no language declaration; an HTML export would.
  const meta = { hasLanguage: false, name: entry.name };

  const findings = [];
  for (const rule of RULES) {
    for (const f of rule.run(document, meta)) {
      findings.push({ ...f, rule: rule.id, criterion: rule.criterion, document: entry.name, kind: entry.kind });
    }
  }
  perDocument.push({ ...entry, findings: findings.length });
  all.push(...findings);
}

/* ---------- distribution ---------- */

const count = (predicate) => all.filter(predicate).length;
const pct = (n) => (all.length ? (100 * n / all.length) : 0);

const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, count((f) => f.severity === s)]));
const withFix = count((f) => typeof f.suggestion === 'string');
const rangeAnchored = count((f) => f.anchor === 'range');
const counts = perDocument.map((d) => d.findings).sort((a, b) => a - b);
const median = counts.length
  ? (counts.length % 2 ? counts[(counts.length - 1) / 2]
    : (counts[counts.length / 2 - 1] + counts[counts.length / 2]) / 2)
  : 0;

const criteria = [
  { id: 'F1', label: 'manual share of findings', value: pct(bySeverity.manual), threshold: 50, failIf: 'gte', unit: '%' },
  { id: 'F2', label: 'findings with an automatic fix', value: pct(withFix), threshold: 25, failIf: 'lt', unit: '%' },
  { id: 'F3', label: 'findings anchored to a text range', value: pct(rangeAnchored), threshold: 50, failIf: 'lt', unit: '%' },
  { id: 'F4', label: 'median findings per document', value: median, threshold: 3, failIf: 'lt', unit: '' },
];
for (const c of criteria) {
  c.tripped = c.failIf === 'gte' ? c.value >= c.threshold : c.value < c.threshold;
}

if (process.argv.includes('--json')) {
  writeFileSync(resolve(HERE, 'results.json'), JSON.stringify({ criteria, bySeverity, all }, null, 2));
}

/* ---------- output ---------- */

const bar = (n, total, width = 28) => '#'.repeat(Math.round((n / Math.max(total, 1)) * width));

console.log(`Rule-set spike — ${RULES.length} rules over ${manifest.length} real documents\n`);
console.log(`${all.length} findings total, median ${median} per document\n`);

console.log('Severity distribution');
for (const s of SEVERITIES) {
  console.log(`  ${s.padEnd(10)} ${String(bySeverity[s]).padStart(4)}  ${pct(bySeverity[s]).toFixed(1).padStart(5)}%  ${bar(bySeverity[s], all.length)}`);
}

console.log('\nBy rule');
const byRule = {};
for (const f of all) byRule[f.rule] = (byRule[f.rule] ?? 0) + 1;
for (const [rule, n] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) {
  const sev = all.find((f) => f.rule === rule).severity;
  console.log(`  ${rule.padEnd(24)} ${String(n).padStart(4)}  ${sev}`);
}

console.log('\nBy document kind (manual share is what matters)');
const kinds = {};
for (const f of all) {
  kinds[f.kind] ??= { total: 0, manual: 0 };
  kinds[f.kind].total++;
  if (f.severity === 'manual') kinds[f.kind].manual++;
}
for (const [kind, k] of Object.entries(kinds).sort((a, b) => b[1].total - a[1].total)) {
  console.log(`  ${kind.padEnd(20)} ${String(k.total).padStart(4)} findings, ${(100 * k.manual / k.total).toFixed(0).padStart(3)}% manual`);
}

console.log('\nPre-registered criteria');
for (const c of criteria) {
  const cmp = c.failIf === 'gte' ? `>= ${c.threshold}` : `< ${c.threshold}`;
  console.log(`  ${c.id}  ${c.label.padEnd(34)} ${c.value.toFixed(1).padStart(6)}${c.unit}   fails if ${cmp.padEnd(6)} ${c.tripped ? '*** TRIPPED ***' : 'ok'}`);
}

const tripped = criteria.filter((c) => c.tripped);
console.log();
if (tripped.length === 0) {
  console.log('VERDICT: the inline-assistant form is supported by the finding set.');
} else {
  console.log(`VERDICT: ${tripped.map((c) => c.id).join(', ')} tripped — the inline-assistant form is NOT supported as designed.`);
}
