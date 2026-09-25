#!/usr/bin/env node
/**
 * Engine-parity gate: A/B the ported ProseMirror engine against the validated
 * spike over the frozen corpus snapshot.
 *
 * The spike (scripts/spike/rules.mjs, DOM path via marked + linkedom) is the
 * oracle — its rule set was validated against these 28 real documents before
 * the port was approved (docs/audit/rule-set-spike.md). The corpus is checked
 * in (corpus/, frozen) so this gate is hermetic and its numbers are stable;
 * provenance URLs live in corpus/manifest.json. Re-fetching would drift: the
 * sources are live branches, so parity is measured engine-vs-engine on one
 * snapshot, never against the spike document's historical numbers.
 *
 * The mark: zero unexplained divergences. Every per-(document, rule) count
 * difference must be either fixed at the root (converter/engine bug) or
 * carry an ALLOWLIST entry with a reason. Deferred rules (table-no-header,
 * document-language — §5) are excluded from both engines by construction.
 *
 *   node scripts/measure-engine.mjs [--verbose] [--json]
 */

import { build } from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, extname } from 'node:path';
import { marked } from 'marked';
import { parseHTML } from 'linkedom';
import { RULES as SPIKE_RULES } from './spike/rules.mjs';
import { mdToPM } from './harness/md-to-pm.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const CORPUS = resolve(ROOT, 'corpus');
const TMP = resolve(HERE, '.parity-bundle.mjs');
const VERBOSE = process.argv.includes('--verbose');

/** §5: not ported — no table node in the schema, no language field in the model. */
// The spike's document-language ("no language declared") can't happen in the
// engine, where every document has one; the engine's rule of that id instead
// checks the declared language against the text, and the English corpus is
// English, so it fires zero times there.
const DEFERRED = new Set(['table-no-header', 'document-language']);

/**
 * Explained divergences. Each entry pins exact per-(doc, rule) counts for both
 * engines and states why the difference is correct rather than a bug, and
 * which way the flagged texts must nest (`holds`), which is checked: `superset`
 * = every spike finding's text is among the engine's; `subset` = the reverse. The
 * corpus is frozen, so these numbers are deterministic; if a row stops
 * matching, this gate fails and the entry must be revisited — allowlist rows
 * are load-bearing assertions, not suppressions.
 */
const RL_LIST_ITEMS = { holds: 'superset', text: 'Engine grades tight-list-item text; the spike\'s reading-level selector was \'p\' only and never matched text directly inside <li>. Same validated formula over more of the document\'s real prose — a coverage improvement, not a drift. Verified per doc: every spike finding appears in the engine\'s set.' };
const LS_DUPLICATE = { holds: 'subset', text: 'The spike\'s \'p,li\' long-sentence selector matched both the inner <p> of a loose list item and its <li> (identical textContent), double-counting the same sentence. The engine flags each paragraph once; the spike extras are duplicates, verified side by side.' };
const LS_CONCAT = { holds: 'subset', text: 'The spike measured <li> textContent, which concatenates nested list items and fenced-code blocks inside the item into cross-block "sentences" that exist in no reader\'s experience. The engine evaluates each paragraph; the spike extras are concatenation artifacts, verified against the source.' };
const NH_ENGINE_ONLY = { holds: 'superset', text: 'document-no-headings is an engine-only rule, added after the spike to close the gap document-no-h1 leaves (it needs at least one heading), so the spike has nothing to agree with. .rst is ingested as plain text by design, so this README really is a many-paragraph document with no headings as checked. Pinned per document: the rule firing anywhere else in the corpus is still a divergence.' };
const LD_ENGINE_ONLY = { holds: 'superset', text: 'img-long-description is an engine-only rule (a Needs-your-call question when alt text names a chart, map or diagram), so the spike has nothing to agree with. These three images really are graphs of repository traffic, clones and contributors — exactly the question the rule asks. Pinned per document: the rule firing anywhere else in the corpus is still a divergence.' };
const HE_LOGO = { holds: 'subset', text: 'Logo-only heading (`# ![WICG Logo](...)`): DOM textContent cannot see alt attributes, so the spike called the h1 empty. A heading whose image carries alt text IS announced by screen readers — the spike finding was a false positive; the engine is right to stay silent.' };

const ALLOWLIST = [
  { doc: 'usds-playbook.md', rule: 'reading-level', spike: 4, engine: 6, reason: RL_LIST_ITEMS },
  { doc: 'uswds.md', rule: 'reading-level', spike: 11, engine: 13, reason: RL_LIST_ITEMS },
  { doc: 'uswds.md', rule: 'long-sentence', spike: 3, engine: 1, reason: LS_CONCAT },
  { doc: 'w3c-wcag.md', rule: 'reading-level', spike: 16, engine: 23, reason: RL_LIST_ITEMS },
  { doc: 'carbon-accessibility-guide.md', rule: 'long-sentence', spike: 5, engine: 4, reason: LS_DUPLICATE },
  { doc: 'wicg-proposals.md', rule: 'heading-empty', spike: 1, engine: 0, reason: HE_LOGO },
  { doc: 'opensource-guide-contribute.md', rule: 'reading-level', spike: 11, engine: 15, reason: RL_LIST_ITEMS },
  { doc: 'opensource-guide-leadership.md', rule: 'long-sentence', spike: 6, engine: 5, reason: LS_DUPLICATE },
  { doc: 'opensource-guide-metrics.md', rule: 'reading-level', spike: 6, engine: 7, reason: RL_LIST_ITEMS },
  { doc: 'superset-code-of-conduct.md', rule: 'reading-level', spike: 7, engine: 10, reason: RL_LIST_ITEMS },
  { doc: 'superset-code-of-conduct.md', rule: 'long-sentence', spike: 9, engine: 7, reason: LS_DUPLICATE },
  { doc: 'bootstrap-readme.md', rule: 'reading-level', spike: 1, engine: 2, reason: RL_LIST_ITEMS },
  { doc: 'eslint-readme.md', rule: 'reading-level', spike: 9, engine: 11, reason: RL_LIST_ITEMS },
  { doc: 'django-readme.rst', rule: 'document-no-headings', spike: 0, engine: 1, reason: NH_ENGINE_ONLY },
  { doc: 'opensource-guide-metrics.md', rule: 'img-long-description', spike: 0, engine: 3, reason: LD_ENGINE_ONLY },
];

/* ---------- bundle the TS engine ---------- */

await build({
  entryPoints: [resolve(HERE, 'harness/rules-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  packages: 'external',
  outfile: TMP,
  logLevel: 'warning',
});

let mod;
try {
  mod = await import(pathToFileURL(TMP).href);
} finally {
  rmSync(TMP, { force: true });
}

const { schema } = mod;
const { checkDocument } = mod.check;
const ENGINE_RULE_IDS = mod.rules.RULES.map((r) => r.id);

/* ---------- both engines over one document ---------- */

/** The spike path, byte-for-byte report.mjs's pipeline (minus deferred rules). */
function spikeFindings(source, name) {
  const html = extname(name) === '.md'
    ? marked.parse(source, { async: false })
    : `<p>${source.split(/\n{2,}/).join('</p><p>')}</p>`;
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const meta = { hasLanguage: false, name };
  const out = [];
  for (const rule of SPIKE_RULES) {
    if (DEFERRED.has(rule.id)) continue;
    for (const f of rule.run(document, meta)) out.push({ rule: rule.id, ...f });
  }
  return out;
}

const ruleOf = (finding) => {
  const hit = ENGINE_RULE_IDS.find((r) => finding.id === r || finding.id.startsWith(`${r}:`));
  if (hit) return hit;
  // img-alt-missing keeps the legacy `img-alt-${figureId}` id (check.ts stableId).
  if (finding.id.startsWith('img-alt-')) return 'img-alt-missing';
  return 'unknown';
};

function engineFindings(source, name) {
  const doc = mdToPM(source, schema, { ext: extname(name) });
  return checkDocument(doc, { prose: true }).map((f) => ({ rule: ruleOf(f), ...f }));
}

/* ---------- measure ---------- */

const manifest = JSON.parse(readFileSync(resolve(CORPUS, 'manifest.json'), 'utf8'));

/* Debug aid: --dump <doc> [rule] prints both engines' findings side by side. */
if (process.argv.includes('--dump')) {
  const docName = process.argv[process.argv.indexOf('--dump') + 1];
  const ruleFilter = process.argv[process.argv.indexOf('--dump') + 2] ?? null;
  const source = readFileSync(resolve(CORPUS, docName), 'utf8');
  const spike = spikeFindings(source, docName).filter((f) => !ruleFilter || f.rule === ruleFilter);
  const engine = engineFindings(source, docName).filter((f) => !ruleFilter || f.rule === ruleFilter);
  console.log(`SPIKE (${spike.length}):`);
  for (const f of spike) console.log(`  [${f.rule}/${f.severity}] ${JSON.stringify((f.snippet ?? '').slice(0, 90))}`);
  console.log(`ENGINE (${engine.length}):`);
  for (const f of engine) console.log(`  [${f.rule}/${f.severity}] ${JSON.stringify((f.excerpt ?? '').slice(0, 90))}`);
  process.exit(0);
}

const countBy = (findings) => {
  const m = new Map();
  for (const f of findings) m.set(f.rule, (m.get(f.rule) ?? 0) + 1);
  return m;
};

// Comparable text: the spike truncates snippets at 50/60/80 chars, the engine's
// excerpt at 59 + '…'.
// ponytail: 40-char prefix compare — blind to two findings sharing a long
// prefix (GitHub raw-image srcs); expose raw snippets from checkDocument if a
// divergence ever hides behind one.
const textKey = (s) => (s ?? '').replace(/…$/, '').replace(/\s+/g, ' ').trim().slice(0, 40);

/** Per rule, the flagged texts only one side has (multiset difference). */
function textDiff(spike, engine, rule) {
  const onlyEngine = engine.filter((f) => f.rule === rule).map((f) => textKey(f.excerpt));
  const onlySpike = [];
  for (const f of spike.filter((x) => x.rule === rule)) {
    const i = onlyEngine.indexOf(textKey(f.snippet));
    if (i >= 0) onlyEngine.splice(i, 1);
    else onlySpike.push(textKey(f.snippet));
  }
  return { onlySpike, onlyEngine };
}

const rows = [];
const divergences = [];
const totals = { spike: new Map(), engine: new Map() };
let spikeTotal = 0;
let engineTotal = 0;

for (const entry of manifest) {
  const source = readFileSync(resolve(CORPUS, entry.name), 'utf8');
  const spike = spikeFindings(source, entry.name);
  const engine = engineFindings(source, entry.name);
  const sCounts = countBy(spike);
  const eCounts = countBy(engine);
  spikeTotal += spike.length;
  engineTotal += engine.length;
  for (const [rule, n] of sCounts) totals.spike.set(rule, (totals.spike.get(rule) ?? 0) + n);
  for (const [rule, n] of eCounts) totals.engine.set(rule, (totals.engine.get(rule) ?? 0) + n);
  rows.push({ doc: entry.name, kind: entry.kind, spike: spike.length, engine: engine.length });

  const rules = new Set([...sCounts.keys(), ...eCounts.keys()]);
  for (const rule of rules) {
    const s = sCounts.get(rule) ?? 0;
    const e = eCounts.get(rule) ?? 0;
    const diff = textDiff(spike, engine, rule);
    if (s === e && !diff.onlySpike.length && !diff.onlyEngine.length) continue;
    divergences.push({ doc: entry.name, rule, spike: s, engine: e, ...diff });
  }
  if (VERBOSE) {
    for (const f of engine.filter((x) => x.rule === 'unknown')) {
      console.log(`  ?? unknown-rule finding in ${entry.name}: ${f.id}`);
    }
  }
}

/* ---------- allowlist matching ---------- */

const unexplained = [];
for (const d of divergences) {
  const entry = ALLOWLIST.find((a) => (a.doc === '*' || a.doc === d.doc) && a.rule === d.rule && a.spike === d.spike && a.engine === d.engine);
  // The counts match an entry; its reason must also hold for the texts.
  const holds = entry && (entry.reason.holds === 'superset' ? !d.onlySpike.length : !d.onlyEngine.length);
  if (holds) d.reason = entry.reason.text;
  else unexplained.push(d);
}
const stale = ALLOWLIST.filter((a) => !divergences.some((d) => (a.doc === '*' || a.doc === d.doc) && a.rule === d.rule && a.spike === d.spike && a.engine === d.engine));

/* ---------- report ---------- */

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ rows, divergences, unexplained, stale }, null, 2));
} else {
  console.log(`Engine parity — spike (DOM) vs ported engine (PM) over ${manifest.length} frozen corpus documents\n`);
  console.log(`${spikeTotal} spike findings (deferred rules excluded) vs ${engineTotal} engine findings\n`);
  console.log('Per rule (spike → engine):');
  const allRules = [...new Set([...totals.spike.keys(), ...totals.engine.keys()])].sort();
  for (const rule of allRules) {
    const s = totals.spike.get(rule) ?? 0;
    const e = totals.engine.get(rule) ?? 0;
    const mark = s === e ? '  ' : '≠ ';
    console.log(`  ${mark}${rule.padEnd(24)} ${String(s).padStart(4)} → ${String(e).padStart(4)}`);
  }
  console.log('');
  if (VERBOSE) {
    console.log('Per document (spike → engine):');
    for (const r of rows) {
      const mark = r.spike === r.engine ? '  ' : '≠ ';
      console.log(`  ${mark}${r.doc.padEnd(36)} ${String(r.spike).padStart(4)} → ${String(r.engine).padStart(4)}`);
    }
    console.log('');
  }
  if (divergences.length) {
    console.log(`Divergences (${divergences.length}):`);
    for (const d of divergences) {
      console.log(`  ${d.reason ? 'ok ' : '!! '}${d.doc} :: ${d.rule}  spike=${d.spike} engine=${d.engine}${d.reason ? `\n      ↳ ${d.reason}` : ''}`);
    }
    console.log('');
  }
}

if (stale.length) {
  console.error(`STALE ALLOWLIST (${stale.length}) — these entries no longer match any divergence; revisit each:`);
  for (const a of stale) console.error(`  ${a.doc} :: ${a.rule} spike=${a.spike} engine=${a.engine}`);
  console.error('');
}

if (unexplained.length || stale.length) {
  console.error(`FAILED — ${unexplained.length} unexplained divergence(s), ${stale.length} stale allowlist entr(ies).`);
  for (const d of unexplained) {
    console.error(`  ${d.doc} :: ${d.rule}  spike=${d.spike} engine=${d.engine}`);
    if (d.onlySpike.length) console.error(`      only spike:  ${JSON.stringify(d.onlySpike)}`);
    if (d.onlyEngine.length) console.error(`      only engine: ${JSON.stringify(d.onlyEngine)}`);
  }
  console.error('\nFix the converter or the engine, or add an allowlist entry with a reason. Do not weaken the check.');
  process.exit(1);
}
console.log(`PASSED — engines agree on ${manifest.length} documents (counts and flagged text); ${divergences.length} divergence(s), all allowlisted with reasons that hold.`);
