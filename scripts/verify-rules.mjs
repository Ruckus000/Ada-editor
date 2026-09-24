#!/usr/bin/env node
/**
 * Verification for the real checking engine (app/_engine).
 *
 * The rules were validated once against a 28-document corpus in the rule-set
 * spike (docs/audit/rule-set-spike.md). This gate keeps the port honest: the
 * text helpers must behave exactly as the spike's did, every ported rule must
 * fire on content that violates it and stay quiet on content that doesn't, and
 * the stable-id/memoization guarantees from the implementation plan must hold.
 *
 * The engine is TypeScript, so it is bundled with esbuild first — the same
 * pattern scripts/build-preview.mjs uses for the design system. Assertions are
 * hand-rolled, in the style of scripts/test-verifier.mjs: no test framework,
 * no new dependencies.
 *
 *   node scripts/verify-rules.mjs
 */

import { build } from 'esbuild';
import { DOMParser as XmlParser, parseHTML } from 'linkedom';
import { crc32, deflateRawSync } from 'node:zlib';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const TMP = resolve(HERE, '.rules-bundle.mjs');

let passed = 0;
const failures = [];

const check = (name, fn) => {
  try {
    fn();
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
const deepEq = (actual, expected, what = '') =>
  eq(JSON.stringify(actual), JSON.stringify(expected), what);

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

// Kept until exit so a test can import a fresh module instance (module state
// such as the store's disk-failure flag must not leak between tests).
process.on('exit', () => rmSync(TMP, { force: true }));
const mod = await import(pathToFileURL(TMP).href);

/* ---------- textHelpers ---------- */

const {
  GENERIC_LINK_TEXT,
  COLOUR_WORDS,
  COLOUR_REFERENCE,
  REDUNDANT_ALT_PREFIX,
  syllables,
  gradeLevel,
  sentenceSpans,
  collapseSpaces,
} = mod.textHelpers;

check('syllables matches the spike\'s validated counter', () => {
  eq(syllables('the'), 1, 'short word');
  eq(syllables('screen'), 1, 'vowel group counts once');
  eq(syllables('banana'), 3, 'banana');
  eq(syllables('utilising'), 4, 'utilising');
  eq(syllables('accessibility'), 6, 'accessibility');
  eq(syllables('THE'), 1, 'case-insensitive');
  eq(syllables('a'), 1, 'single letter floors at 1');
});

check('gradeLevel refuses short text and grades dense prose', () => {
  eq(gradeLevel('Short text.'), null, 'under the word floor');
  eq(gradeLevel('One two three four five six seven eight nine ten eleven twelve.'), null, 'sentences too short');
  const dense = 'Applicants must furnish documentation substantiating residency prior to the aforementioned deadline, '
    + 'notwithstanding any prior determination issued by the commission to the contrary in this particular matter.';
  const grade = gradeLevel(dense);
  assert(grade !== null && grade > 12, `dense bureaucratic prose should grade above 12, got ${grade}`);
  const plain = 'You must bring proof of where you live before the deadline. If you do not, we cannot process the form that you sent to us last week.';
  const plainGrade = gradeLevel(plain);
  assert(plainGrade !== null && plainGrade <= 12, `plain prose should grade at or below 12, got ${plainGrade}`);
});

check('sentenceSpans splits sentences without lookbehind, offset-accurately (§9.10)', () => {
  const slice = (t) => sentenceSpans(t).map((s) => t.slice(s.from, s.to));
  deepEq(slice('A. B! C? D'), ['A.', 'B!', 'C?', 'D'], 'four sentences keep their terminators');
  deepEq(slice('Only one sentence.'), ['Only one sentence.'], 'single sentence');
  deepEq(slice('No terminator here'), ['No terminator here'], 'unterminated text');
  deepEq(slice('A.  B'), ['A.', 'B'], 'multiple spaces after a terminator');
  deepEq(slice(''), [], 'empty string');
  // The lookbehind split the spike used would treat "3.5" mid-text the same
  // way this does: a terminator only splits when whitespace follows it.
  deepEq(slice('Version 3.5 is out. Upgrade now.'), ['Version 3.5 is out.', 'Upgrade now.'], 'decimal points do not split');
  deepEq(sentenceSpans('A. B!'), [{ from: 0, to: 2 }, { from: 3, to: 5 }], 'offsets are exact');
});

check('spike regexes ported unchanged', () => {
  assert(GENERIC_LINK_TEXT.has('click here'), 'click here is generic');
  assert(GENERIC_LINK_TEXT.has('download'), 'download is generic');
  assert(!GENERIC_LINK_TEXT.has('the winter shelter list'), 'real labels are not generic');
  assert(COLOUR_WORDS.test('shown in light grey'), 'COLOUR_WORDS matches grey');
  assert(!COLOUR_WORDS.test('shown in light tone'), 'COLOUR_WORDS ignores non-colours');
  assert(COLOUR_REFERENCE.test('deadlines are shown in red beside each program'), 'COLOUR_REFERENCE matches pointing colour');
  assert(!COLOUR_REFERENCE.test('red cars are nice'), 'COLOUR_REFERENCE ignores incidental colour');
  assert(REDUNDANT_ALT_PREFIX.test('Image of a site plan'), 'redundant prefix matched');
  assert(REDUNDANT_ALT_PREFIX.test('photo showing the entrance'), 'redundant prefix matched (showing)');
  assert(!REDUNDANT_ALT_PREFIX.test('a site plan of the entrance'), 'normal alt not matched');
});

check('collapseSpaces normalizes whitespace', () => {
  eq(collapseSpaces('  a \n b\tc  '), 'a b c');
});

/* ---------- source-level guard: no lookbehind anywhere in the engine ---------- */

check('no lookbehind regexes in shipped source (§9.10, Safari 12)', () => {
  // Everything that reaches a browser: the app, the design system, and the
  // harness entry bundled into the preview. A lookbehind in ANY of them throws
  // at module parse on Safari 12, which the browserslist still includes.
  const roots = ['app', 'design-system', 'scripts/harness'];
  let scanned = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      scanned++;
      const src = readFileSync(full, 'utf8');
      assert(!src.includes('(?<'), `${full} contains a lookbehind — it breaks Safari 12 at module parse`);
    }
  };
  for (const r of roots) walk(resolve(ROOT, r));
  assert(scanned > 25, `guard scanned only ${scanned} files — the walk is broken`);
});

/* ---------- rules: PM-doc builders ---------- */

const { schema } = mod;
const { summarizeBlock, crossBlockFindings, RULES, PROSE_RULE_IDS } = mod.rules;

const N = schema.nodes;
const M = schema.marks;
const text = (s, marks) => schema.text(s, marks);
const link = (href, extra = []) => [M.link.create({ href }), ...extra];
const para = (...children) => N.paragraph.create(null, children.map((c) => (typeof c === 'string' ? schema.text(c) : c)));
const heading = (level, str) => N.heading.create({ level }, str === '' ? undefined : schema.text(str));
const figure = (id, alt, label = 'image') => N.figure.create({ id, alt, label });
const doc = (...blocks) => N.doc.create(null, blocks);

/** Mirrors check.ts's walk: one entry per textblock/figure, in doc order. */
function entriesOf(document) {
  const entries = [];
  document.descendants((node, pos) => {
    if (node.isTextblock || node.type === N.figure) {
      entries.push({ pos, contentSize: node.content.size, summary: summarizeBlock(node) });
    }
    return true;
  });
  return entries;
}

/** Per-block findings whose ruleId matches, from a doc. */
const blockFindings = (document, ruleId) =>
  entriesOf(document).flatMap((e) => e.summary.findings.filter((f) => f.ruleId === ruleId));

/** Cross-block findings whose ruleId matches, from a doc. */
const crossFindings = (document, ruleId) =>
  crossBlockFindings(entriesOf(document)).filter((f) => f.ruleId === ruleId);

const ids = (list) => list.map((f) => f.ruleId);

/* ---------- rules registry ---------- */

check('RULES ports the 12 rules with the §8.1 structural/prose split', () => {
  eq(RULES.length, 12, 'rule count');
  deepEq([...PROSE_RULE_IDS].sort(), ['colour-only-reference', 'long-sentence', 'reading-level'], 'prose rules');
  for (const r of RULES) {
    assert(r.criterion && r.criterion.length > 0, `${r.id} has no criterion`);
    assert(r.kind === 'structural' || r.kind === 'prose', `${r.id} has no kind`);
  }
  deepEq(RULES.map((r) => r.id).sort(), [
    'colour-only-reference', 'document-no-h1', 'document-no-headings', 'heading-empty', 'heading-skip',
    'img-alt-missing', 'img-alt-suspicious', 'link-text-ambiguous', 'link-text-generic',
    'link-text-raw-url', 'long-sentence', 'reading-level',
  ], 'rule ids');
});

/* ---------- link rules ---------- */

check('link runs merge across inner formatting (§9.9)', () => {
  // "click **here**" — two text nodes, different full mark sets, same link href.
  const d = doc(para(text('click ', link('https://x.org/a')), text('here', link('https://x.org/a', [M.strong.create()]))));
  const found = blockFindings(d, 'link-text-generic');
  eq(found.length, 1, 'fires once on the split link');
  eq(found[0].severity, 'violation', 'severity');
  eq(found[0].snippet, 'click here', 'merged run text');
  deepEq(found[0].anchor, { kind: 'blockRange', from: 0, to: 10 }, 'range spans the whole run');
  // Different hrefs must NOT merge into one run.
  const two = doc(para(text('here', link('https://x.org/a')), text('here', link('https://x.org/b'))));
  eq(blockFindings(two, 'link-text-generic').length, 2, 'two hrefs stay two runs');
});

check('link-text-generic fires only on generic labels', () => {
  const generic = doc(para(text('For locations, '), text('click here', link('https://x.org/loc')), text('.')));
  const found = blockFindings(generic, 'link-text-generic');
  eq(found.length, 1, 'one finding');
  eq(found[0].criterion, '2.4.4 Link Purpose (In Context)', 'criterion');
  eq(found[0].fix, undefined, 'no machine fix — naming the destination needs a human');
  deepEq(found[0].anchor, { kind: 'blockRange', from: 15, to: 25 }, 'range covers only the link');
  const meaningful = doc(para(text('the winter shelter list', link('https://x.org/s'))));
  eq(blockFindings(meaningful, 'link-text-generic').length, 0, 'meaningful label is quiet');
});

check('link-text-raw-url fires only on long raw URLs', () => {
  const url = 'https://city.example.gov/notices/2026/hearing';
  const raw = doc(para(text(url, link(url))));
  const found = blockFindings(raw, 'link-text-raw-url');
  eq(found.length, 1, 'fires');
  eq(found[0].severity, 'violation', 'severity');
  eq(found[0].snippet, url, 'full url kept in snippet');
  const short = doc(para(text('https://x.org', link('https://x.org'))));
  eq(blockFindings(short, 'link-text-raw-url').length, 0, 'short URL is quiet');
});

check('link-text-ambiguous: same label, different destinations (cross-block)', () => {
  const d = doc(
    para(text('the notice', link('https://x.org/a'))),
    para(text('The Notice', link('https://x.org/b'))), // case-insensitive label match
  );
  const found = crossFindings(d, 'link-text-ambiguous');
  eq(found.length, 1, 'one finding for the label');
  eq(found[0].severity, 'manual', 'severity');
  deepEq(found[0].anchor, { kind: 'docRange', from: 1, to: 11 }, 'anchored at the first occurrence');
  const same = doc(
    para(text('the notice', link('https://x.org/a'))),
    para(text('the notice', link('https://x.org/a'))),
  );
  eq(crossFindings(same, 'link-text-ambiguous').length, 0, 'one destination is not ambiguous');
});

/* ---------- heading rules ---------- */

check('heading-empty fires on a heading with no text', () => {
  const d = doc(heading(1, 'Title'), heading(2, ''));
  const found = blockFindings(d, 'heading-empty');
  eq(found.length, 1, 'one finding');
  eq(found[0].severity, 'blocker', 'severity');
  const clean = doc(heading(1, 'Title'), heading(2, 'Section'));
  eq(blockFindings(clean, 'heading-empty').length, 0, 'non-empty headings are quiet');
});

check('heading-skip fires on level jumps with a level fix (cross-block)', () => {
  const d = doc(heading(1, 'Title'), heading(3, 'Jumped'));
  const found = crossFindings(d, 'heading-skip');
  eq(found.length, 1, 'one finding');
  eq(found[0].severity, 'violation', 'severity');
  eq(found[0].title, 'Heading level jumps from h1 to h3', 'title');
  deepEq(found[0].fix, { kind: 'headingLevel', level: 2 }, 'mechanical fix: one below its parent');
  deepEq(found[0].anchor, { kind: 'docRange', from: 8, to: 14 }, 'range covers the heading text');
  const clean = doc(heading(1, 'Title'), heading(2, 'Section'), heading(2, 'Other'));
  eq(crossFindings(clean, 'heading-skip').length, 0, 'sequential headings are quiet');
  // A leading h3 (no previous heading) is not a skip — matches the spike (previous starts at 0).
  eq(crossFindings(doc(heading(3, 'Orphan')), 'heading-skip').length, 0, 'first heading never skips');
});

check('document-no-h1 fires only when headings exist but none is h1', () => {
  const found = crossFindings(doc(para('intro'), heading(2, 'Section')), 'document-no-h1');
  eq(found.length, 1, 'one finding');
  eq(found[0].severity, 'violation', 'severity');
  deepEq(found[0].anchor, { kind: 'document' }, 'document-anchored (§6)');
  eq(crossFindings(doc(heading(1, 'T'), heading(2, 'S')), 'document-no-h1').length, 0, 'h1 present is quiet');
  eq(crossFindings(doc(para('no headings at all')), 'document-no-h1').length, 0, 'no headings is quiet');
});

check('document-no-headings asks about sections once a document has several blocks and no headings', () => {
  const noHeadings = (d, prose = true) => mod.check.checkDocument(d, { prose }).filter((f) => f.id === 'document-no-headings');
  const five = doc(para('One.'), para('Two.'), para('Three.'), para('Four.'), para('Five.'));
  const found = noHeadings(five);
  eq(found.length, 1, 'fires on five blocks without a heading');
  eq(found[0].severity, 'manual', 'needs a person: only they know whether there are sections');
  eq(found[0].criterion, '1.3.1 Info and Relationships', 'criterion');
  deepEq(found[0].anchor, { kind: 'document' }, 'document-anchored');
  eq(noHeadings(five, false).length, 1, 'structural: present on every keystroke run');
  // Adding a heading must retract it at once, not at the next blur: the live
  // structural run replaces it with document-no-h1 and nothing carries it over.
  const withH2 = doc(heading(2, 'Now sectioned'), para('One.'), para('Two.'), para('Three.'), para('Four.'), para('Five.'));
  const next = mod.check.reconcile(mod.check.checkDocument(five, { prose: true }), mod.check.checkDocument(withH2, { prose: false }), new Set(), { keepProse: true });
  deepEq(next.filter((f) => f.id.startsWith('document-no-')).map((f) => f.id), ['document-no-h1'], 'no stale card beside document-no-h1');
  eq(noHeadings(doc(para('One.'), para('Two.'), para('Three.'), para('Four.'))).length, 0, 'four blocks is a short note');
  eq(noHeadings(doc(para('One.'), para(), para(), figure('img-1', ''), para('Two.'), para('Three.'), para('Four.'))).length, 0, 'empty paragraphs and figures do not count');
  eq(noHeadings(doc(heading(2, 'Only an h2'), para('One.'), para('Two.'), para('Three.'), para('Four.'), para('Five.'))).length, 0, 'any heading silences it (document-no-h1 covers that case)');
  const list = N.bullet_list.create(null, ['a', 'b', 'c'].map((t) => N.list_item.create(null, para(t))));
  eq(noHeadings(doc(para('Intro.'), list, para('End.'))).length, 1, 'list paragraphs count as blocks');
});

/* ---------- image rules ---------- */

check('img-alt-missing fires on a figure with no alt text', () => {
  const d = doc(figure('img-1', ''), figure('img-2', 'A plan of the shelter entrance'));
  const found = blockFindings(d, 'img-alt-missing');
  eq(found.length, 1, 'one finding');
  eq(found[0].severity, 'blocker', 'severity');
  deepEq(found[0].anchor, { kind: 'figure', figureId: 'img-1' }, 'figure-anchored by stable id');
  eq(found[0].snippet, 'image', 'snippet is the figure label');
});

check('img-alt-suspicious: redundant prefix gets a figureAlt fix, terse/filename is manual', () => {
  const prefix = blockFindings(doc(figure('img-1', 'Image of a site plan')), 'img-alt-suspicious');
  eq(prefix.length, 1, 'prefix fires');
  eq(prefix[0].severity, 'advisory', 'prefix severity');
  deepEq(prefix[0].fix, { kind: 'figureAlt', alt: 'a site plan' }, 'mechanical fix strips the prefix');
  const terse = blockFindings(doc(figure('img-2', 'map')), 'img-alt-suspicious');
  eq(terse.length, 1, 'terse fires');
  eq(terse[0].severity, 'manual', 'terse severity');
  eq(terse[0].fix, undefined, 'no machine fix for judgement calls');
  const filename = blockFindings(doc(figure('img-3', 'siteplan_map.png')), 'img-alt-suspicious');
  eq(filename.length, 1, 'filename fires');
  eq(filename[0].severity, 'manual', 'filename severity');
  const good = blockFindings(doc(figure('img-4', 'A plan of the proposed shelter entrance')), 'img-alt-suspicious');
  eq(good.length, 0, 'descriptive alt is quiet');
  const empty = blockFindings(doc(figure('img-5', '')), 'img-alt-suspicious');
  eq(empty.length, 0, 'empty alt belongs to img-alt-missing only');
});

/* ---------- prose rules (gated kind, per-block) ---------- */

check('reading-level flags dense paragraphs above grade 12', () => {
  const dense = para('Applicants must furnish documentation substantiating residency prior to the aforementioned deadline, '
    + 'notwithstanding any prior determination issued by the commission to the contrary in this particular matter.');
  const found = summarizeBlock(dense).findings.filter((f) => f.ruleId === 'reading-level');
  eq(found.length, 1, 'fires');
  eq(found[0].severity, 'advisory', 'severity');
  assert(/^Passage reads at about grade \d+$/.test(found[0].title), `title carries the grade, got ${JSON.stringify(found[0].title)}`);
  const plain = para('You must bring proof of where you live before the deadline. If you do not, we cannot process the form that you sent to us last week.');
  eq(summarizeBlock(plain).findings.filter((f) => f.ruleId === 'reading-level').length, 0, 'plain prose is quiet');
  // Headings are not graded (the spike graded <p> only).
  eq(summarizeBlock(heading(1, 'Applicants must furnish documentation substantiating residency')).findings.filter((f) => f.ruleId === 'reading-level').length, 0, 'headings are quiet');
});

const LONG = 'the quick brown fox jumps over the lazy dog '.repeat(4).trim() + '.'; // 36 words

check('long-sentence flags >35-word sentences with sentence-level ranges', () => {
  const found = summarizeBlock(para(LONG)).findings.filter((f) => f.ruleId === 'long-sentence');
  eq(found.length, 1, 'fires');
  eq(found[0].severity, 'advisory', 'severity');
  eq(found[0].title, 'Sentence runs to 36 words', 'title counts words');
  deepEq(found[0].anchor, { kind: 'blockRange', from: 0, to: LONG.length }, 'range covers the sentence');
  // Two sentences: only the long one is flagged, and its range starts after the first.
  const mixed = summarizeBlock(para(`Short intro. ${LONG}`)).findings.filter((f) => f.ruleId === 'long-sentence');
  eq(mixed.length, 1, 'only the long sentence fires');
  deepEq(mixed[0].anchor, { kind: 'blockRange', from: 13, to: 13 + LONG.length }, 'range starts at the second sentence');
  const short = summarizeBlock(para('This sentence is comfortably under the limit of words.'))
    .findings.filter((f) => f.ruleId === 'long-sentence');
  eq(short.length, 0, 'short sentences are quiet');
});

check('colour-only-reference fires when a colour does the pointing', () => {
  const d = para('Deadlines are shown in red beside each program.');
  const found = summarizeBlock(d).findings.filter((f) => f.ruleId === 'colour-only-reference');
  eq(found.length, 1, 'fires');
  eq(found[0].severity, 'manual', 'severity');
  deepEq(found[0].anchor, { kind: 'blockRange', from: 0, to: d.content.size }, 'range covers the paragraph');
  const quiet = summarizeBlock(para('Red cars are nice.'))
    .findings.filter((f) => f.ruleId === 'colour-only-reference');
  eq(quiet.length, 0, 'incidental colour is quiet');
});

/* ---------- checkDocument + reconcile ---------- */

const { checkDocument, reconcile } = mod.check;

const linkPara = () => para(text('Go '), text('click here', link('https://x.org/a')), text('.'));
const DENSE = 'Applicants must furnish documentation substantiating residency prior to the aforementioned deadline, '
  + 'notwithstanding any prior determination issued by the commission to the contrary in this particular matter.';

check('checkDocument maps rules to anchored findings with stable ids', () => {
  const d = doc(heading(1, 'Title'), linkPara(), figure('img-1', ''), heading(3, 'Jumped'));
  const found = checkDocument(d, { prose: false });
  deepEq(found.map((f) => f.id), ['link-text-generic:click here', 'img-alt-img-1', 'heading-skip:Jumped'], 'ids in doc order');
  const linkF = found[0];
  deepEq(linkF.anchor, { kind: 'text' }, 'text anchor');
  eq(linkF.from, 11, 'link from');
  eq(linkF.to, 21, 'link to');
  eq(linkF.severity, 'violation', 'link severity');
  eq(linkF.excerpt, 'click here', 'excerpt is the flagged text');
  const figF = found[1];
  deepEq(figF.anchor, { kind: 'figure', figureId: 'img-1' }, 'figure anchor');
  eq(figF.from, 23, 'figure from');
  eq(figF.to, 24, 'figure to');
  eq(figF.severity, 'blocker', 'figure severity');
  const headF = found[2];
  eq(headF.from, 25, 'heading from');
  eq(headF.to, 31, 'heading to');
  deepEq(headF.fix, { kind: 'headingLevel', level: 2 }, 'fix descriptor');
  eq(headF.excerpt, 'Jumped', 'card excerpt is the heading text');
  eq(headF.original, 'h3', 'diff shows the current level');
  eq(headF.suggestion, 'h2', 'diff shows the corrected level');
});

check('prose gating: prose rules only run when asked (§8.1)', () => {
  const d = doc(heading(1, 'Title'), para(DENSE));
  const structural = checkDocument(d, { prose: false });
  eq(structural.length, 0, 'structural run is quiet on prose-only problems');
  const full = checkDocument(d, { prose: true });
  eq(full.length, 1, 'full run flags the dense passage');
  assert(full[0].id.startsWith('reading-level:'), `reading-level fires, got ${full[0].id}`);
});

check('stable ids are content-derived, not position-derived (§4/§9.3)', () => {
  const lp = linkPara();
  const base = checkDocument(doc(heading(1, 'Title'), lp), { prose: false });
  // Insert unrelated paragraphs above: positions move, ids do not. The lp node
  // is shared, so this also proves the memo caches block-RELATIVE results and
  // the live walk supplies absolute positions (§9.1).
  const shifted = checkDocument(doc(para('A brand new paragraph.'), para('And another one here.'), heading(1, 'Title'), lp), { prose: false });
  deepEq(shifted.map((f) => f.id), base.map((f) => f.id), 'ids survive edits elsewhere');
  assert(shifted[0].from > base[0].from, 'positions moved with the insertion');
  // Edit the flagged text itself (to another generic label): the id changes with it.
  const edited = checkDocument(doc(heading(1, 'Title'), para(text('Go '), text('read more', link('https://x.org/a')), text('.'))), { prose: false });
  deepEq(edited.map((f) => f.id), ['link-text-generic:read more'], 'id tracks the flagged text');
  // ...and to a meaningful label: the finding goes away entirely.
  const fixed = checkDocument(doc(heading(1, 'Title'), para(text('Go '), text('the hearing agenda', link('https://x.org/a')), text('.'))), { prose: false });
  deepEq(fixed.map((f) => f.id), [], 'fixing the text removes the finding');
  // Duplicate snippets get collision ordinals in document order.
  const dupes = checkDocument(doc(para(text('here', link('https://a.example/x'))), para(text('here', link('https://b.example/y')))), { prose: false });
  deepEq(dupes.map((f) => f.id), ['link-text-generic:here', 'link-text-ambiguous:here', 'link-text-generic:here#2'], 'ordinal disambiguates duplicates');
});

check('reconcile preserves object and array identity (§9.4)', () => {
  const lp = linkPara();
  const d = doc(heading(1, 'Title'), lp);
  const first = checkDocument(d, { prose: false });
  const second = checkDocument(d, { prose: false });
  assert(first !== second, 'checkDocument returns a fresh array each run');
  assert(first[0] !== second[0], 'and fresh finding objects');
  const merged = reconcile(first, second, new Set());
  assert(merged === first, 'unchanged findings reconcile to the SAME array');
  // An edit after the flagged block leaves the finding object-identical.
  const withTrailer = doc(heading(1, 'Title'), lp, para('A paragraph added after the flagged one.'));
  const third = checkDocument(withTrailer, { prose: false });
  const merged2 = reconcile(first, third, new Set());
  const before = first.find((f) => f.id === 'link-text-generic:click here');
  const after = merged2.find((f) => f.id === 'link-text-generic:click here');
  assert(before === after, 'untouched finding keeps its object across an edit elsewhere');
});

check('reconcile drops dismissed ids and keeps non-engine findings', () => {
  const next = checkDocument(doc(heading(1, 'Title'), linkPara()), { prose: false });
  const dismissed = new Set(['link-text-generic:click here']);
  eq(reconcile([], next, dismissed).length, 0, 'dismissed finding is filtered out');
  const sectionFinding = {
    id: 'img-alt-header-img-1', severity: 'blocker', title: 'Image has no alternative text',
    explanation: 'x', criterion: '1.1.1 Non-text Content', excerpt: 'header image',
    hint: 'Add a description', from: 0, to: 0, anchor: { kind: 'section', section: 'header' },
  };
  const prev = [...next, sectionFinding];
  const merged = reconcile(prev, next, new Set());
  eq(merged.length, 2, 'engine finding + section finding');
  assert(merged.includes(sectionFinding), 'section finding survives untouched');
  const merged2 = reconcile(prev, next, dismissed);
  eq(merged2.length, 1, 'a dismissed finding stays gone across recomputes');
  assert(merged2[0] === sectionFinding, 'only the section finding remains');
});

check('a dismissal never hides a duplicate nobody judged', () => {
  const here = (href) => para(text('here', link(href)));
  const generic = (list) => list.filter((f) => f.id.startsWith('link-text-generic:'));
  const two = generic(checkDocument(doc(here('https://a.example/x'), here('https://b.example/y')), { prose: false }));
  deepEq(two.map((f) => f.dismissKey), ['link-text-generic:here~2', 'link-text-generic:here#2~2'], 'duplicates key on id and count');
  const dismissed = new Set([two[0].dismissKey]);
  eq(generic(reconcile([], two, dismissed)).length, 1, 'the dismissed twin is hidden, the other is not');
  // Delete the dismissed link: the survivor inherits the base id, but not the dismissal.
  const one = generic(checkDocument(doc(here('https://b.example/y')), { prose: false }));
  eq(one[0].id, 'link-text-generic:here', 'survivor takes the base id');
  eq(generic(reconcile([], one, dismissed)).length, 1, 'survivor stays visible');
  // An exact revert restores the count, so the dismissal re-applies.
  eq(generic(reconcile([], two, dismissed)).length, 1, 'exact revert re-hides only the dismissed one');
  // A unique finding keys on its bare id, so older stored dismissals still match.
  eq(one[0].dismissKey, undefined, 'unique findings carry no separate key');
  eq(reconcile([], one, new Set(['link-text-generic:here'])).filter((f) => f.id === 'link-text-generic:here').length, 0, 'bare-id dismissal still applies');
});

check('heading-skip ids belong to the heading, not the level', () => {
  const skips = (...hs) => checkDocument(doc(heading(1, 'Title'), ...hs), { prose: false }).filter((f) => f.id.startsWith('heading-skip'));
  const alpha = skips(heading(3, 'Alpha'));
  const dismissed = new Set(alpha.map((f) => f.id));
  // Fix Alpha's level; a different heading that later skips to h3 must not inherit the dismissal.
  const beta = skips(heading(2, 'Alpha'), heading(4, 'Beta'));
  eq(beta.length, 1, 'Beta skips');
  eq(reconcile([], beta, dismissed).length, 1, 'Beta is not hidden by Alpha\'s dismissal');
  const twoSkips = skips(heading(3, 'Alpha'), heading(1, 'Again'), heading(3, 'Gamma'));
  deepEq(twoSkips.map((f) => f.id), ['heading-skip:Alpha', 'heading-skip:Gamma'], 'two headings skipping to h3 get different ids');
});

check('reconcile carries prose findings between gated runs', () => {
  const d = doc(heading(1, 'Title'), para(DENSE));
  const full = checkDocument(d, { prose: true });
  eq(full.length, 1, 'one prose finding');
  const structural = checkDocument(d, { prose: false });
  const carried = reconcile(full, structural, new Set(), { keepProse: true });
  assert(carried === full, 'structural run leaves the prose finding (same array)');
  const refreshed = reconcile(carried, checkDocument(d, { prose: true }), new Set());
  deepEq(refreshed.map((f) => f.id), full.map((f) => f.id), 'full run re-anchors prose findings');
  assert(refreshed === carried, 'identity preserved across the full run');
  // A prose finding BEFORE a structural one: reconcile rebuilds structural
  // first and appends carried prose, a different order over the same objects.
  const mixed = doc(heading(1, 'Title'), para(DENSE), linkPara());
  const mixedFull = checkDocument(mixed, { prose: true });
  eq(mixedFull.length, 2, 'one prose + one structural finding');
  const mixedCarried = reconcile(mixedFull, checkDocument(mixed, { prose: false }), new Set(), { keepProse: true });
  assert(mixedCarried === mixedFull, 'reordering alone never allocates a new array (no extra render after a full run)');
});

check('document-anchored findings (§6)', () => {
  const found = checkDocument(doc(para('intro text only'), heading(2, 'Section')), { prose: false });
  const noH1 = found.find((f) => f.id === 'document-no-h1');
  assert(noH1, 'document-no-h1 fired');
  deepEq(noH1.anchor, { kind: 'document' }, 'document anchor');
  eq(noH1.from, 0, 'from');
  eq(noH1.to, 0, 'to');
  eq(noH1.severity, 'violation', 'severity');
});

/* ---------- display order ---------- */

check('sortFindings orders by severity, then document position', () => {
  const { sortFindings } = mod.editorFindings;
  const f = (id, severity, from) => ({
    id, severity, title: 't', explanation: 'e', criterion: 'c',
    excerpt: 'x', hint: 'h', from, to: from + 1, anchor: { kind: 'text' },
  });
  const sorted = sortFindings([f('far-advisory', 'advisory', 30), f('near-advisory', 'advisory', 5), f('far-blocker', 'blocker', 30)]);
  deepEq(sorted.map((x) => x.id), ['far-blocker', 'near-advisory', 'far-advisory'],
    'severity first; within a severity, document position — not insertion order');
});

/* ---------- false-positive floor ---------- */

check('a genuinely clean document produces zero findings', () => {
  // The port's new failure mode is firing on PM structures the DOM spike never
  // saw; the corpus parity gate measures fidelity, this pins the quiet side.
  const clean = doc(
    heading(1, 'Community Garden Program'),
    para('Welcome to the community garden program for the 2026 growing season.'),
    heading(2, 'How to register'),
    para(
      'You can register online at the ',
      text('parks and recreation portal', link('https://city.example.gov/gardens')),
      '. Registration takes about ten minutes, and you will get a confirmation email within two business days.',
    ),
    figure('img-1', 'A map of the garden plots, with the entrance on Elm Street', 'garden map'),
    para('Bring your own gloves. Water and compost are provided at the shed near the entrance.'),
  );
  deepEq(checkDocument(clean, { prose: true }).map((f) => f.id), [], 'accessible content stays quiet');
});

/* ---------- store: pure helpers (the browser API paths are gate-tested) ---------- */

const { relativeTime, countsOf } = mod.store;

check('relativeTime formats the dashboard\'s "last checked" column', () => {
  const now = Date.now();
  eq(relativeTime(now, now), 'just now', 'now');
  eq(relativeTime(now - 30_000, now), 'just now', 'under a minute');
  eq(relativeTime(now - 2 * 60_000, now), '2 min ago', 'minutes');
  eq(relativeTime(now - 60 * 60_000, now), '1 h ago', 'one hour');
  eq(relativeTime(now - 3 * 60 * 60_000, now), '3 h ago', 'hours');
  eq(relativeTime(now - 25 * 60 * 60_000, now), 'Yesterday', 'yesterday');
  const mar3 = new Date(2026, 2, 3, 12).getTime();
  eq(relativeTime(mar3, mar3 + 72 * 60 * 60_000), 'Mar 3', 'older dates show month and day');
  eq(relativeTime(now + 60_000, now), 'just now', 'clock skew into the future stays "just now"');
});

check('countsOf aggregates findings into DocSummary.counts', () => {
  const fake = (severity, n) => ({
    id: `x-${severity}-${n}`, severity, title: 't', explanation: 'e', criterion: 'c',
    from: 0, to: 1, excerpt: 'x', hint: 'h', anchor: { kind: 'text' },
  });
  deepEq(countsOf([]), {}, 'no findings, no counts');
  deepEq(
    countsOf([fake('blocker', 1), fake('blocker', 2), fake('manual', 3)]),
    { blocker: 2, manual: 1 },
    'only present severities appear',
  );
});

/* ---------- seed content: the demo docs must produce what they promise ---------- */

check('seed docs produce real engine findings across all four severities', () => {
  // In Node there is no localStorage, so the store runs on its in-memory seed
  // fallback — exactly the content the browser seeds from.
  const canon = (counts) => JSON.stringify(Object.keys(counts).sort().map((k) => [k, counts[k]]));
  const summaries = mod.store.loadDashboardData().docs;
  eq(summaries.length, 8, 'eight seed documents');
  const byId = Object.fromEntries(summaries.map((s) => [s.id, s.counts]));
  const expect = (id, counts) => eq(canon(byId[id]), canon(counts), id);
  expect('hearing-notice', { blocker: 1, violation: 2, advisory: 3, manual: 2 });
  expect('shelter-faq', { blocker: 1, violation: 1, advisory: 1 });
  expect('benefits-guide', { violation: 1, advisory: 1 });
  expect('health-advisory', { violation: 1, manual: 2 });
  expect('transit-notice', { blocker: 1, advisory: 2 });
  expect('zoning-variance', { blocker: 1, manual: 1 });
  expect('water-quality', {});
  expect('voter-deadlines', {});
});

check('the hearing-notice seed exercises the gate-critical paths', () => {
  const stored = mod.store.loadDoc('hearing-notice');
  assert(stored, 'hearing-notice is stored');
  const found = checkDocument(mod.store.docFromJSON(stored.content), { prose: true });
  const byId = Object.fromEntries(found.map((f) => [f.id, f]));
  assert('img-alt-img-1' in byId, 'figure without alt is a blocker (paste/insert path)');
  assert('link-text-generic:click here' in byId, 'generic link fires');
  const skip = byId['heading-skip:Public Comment'];
  assert(skip, 'heading-skip fires');
  deepEq(skip.fix, { kind: 'headingLevel', level: 2 }, 'heading-skip carries the anchor-aware Apply fix');
  eq(skip.suggestion, 'h2', 'suggestion renders in the diff UI');
  const severities = new Set(found.map((f) => f.severity));
  deepEq([...severities].sort(), ['advisory', 'blocker', 'manual', 'violation'], 'all four severities present');
});

/* ---------- carryPositions: identity-preserving position carry (§9.4) ---------- */

const { carryPositions } = mod.editorFindings;

const mkFinding = (id, kind, from, to) => ({
  id, severity: 'blocker', title: 't', explanation: 'e', criterion: 'c',
  excerpt: 'x', hint: 'h', from, to, anchor: { kind },
});

check('carryPositions returns the SAME array when nothing moved', () => {
  const list = [mkFinding('a', 'text', 5, 10), mkFinding('b', 'figure', 20, 21), mkFinding('c', 'section', 0, 0)];
  assert(carryPositions(list, (p) => p) === list, 'identity mapping must not allocate');
  // A mapping that only touches positions after every finding is also a no-op.
  assert(carryPositions(list, (p) => (p > 100 ? p + 1 : p)) === list, 'far-away edits must not allocate');
});

check('carryPositions moves text findings, passes others through by identity', () => {
  const list = [mkFinding('a', 'text', 5, 10), mkFinding('b', 'figure', 20, 21), mkFinding('c', 'section', 0, 0)];
  const moved = carryPositions(list, (p) => (p >= 5 ? p + 3 : p));
  assert(moved !== list, 'a real move allocates');
  eq(moved[0].from, 8, 'from moved');
  eq(moved[0].to, 13, 'to moved');
  assert(moved[1] === list[1] && moved[2] === list[2], 'figure/section findings keep their objects');
  // A text finding whose range collapses (its text was deleted) is dropped.
  const deleted = carryPositions(list, (p) => Math.min(p, 5));
  eq(deleted.length, 2, 'collapsed finding dropped');
  eq(deleted[0].id, 'b', 'survivors keep order');
  // A caret finding (empty heading) moves as a caret instead of being dropped
  // and re-created by the next structural run.
  const caret = carryPositions([mkFinding('e', 'text', 4, 4)], (p) => p + 2);
  eq(caret.length, 1, 'caret finding survives an edit above it');
  eq(caret[0].from, 6, 'caret moved');
  eq(caret[0].to, 6, 'still a caret');
});

check('imageIdFloor never reissues an id whose dismissal persists', () => {
  // Persisted dismissals outlive the figure they were made against. If the
  // counter floor ignored them, deleting a dismissed image and inserting a
  // new one would reissue the id — and the stale dismissal would silently
  // swallow the NEW image's missing-alt blocker.
  const { imageIdFloor } = mod.editorFindings;
  eq(imageIdFloor(doc(para('x'), figure('img-2', ''))), 2, 'floor from live figures');
  eq(imageIdFloor(doc(para('x'), figure('img-2', '')), ['img-alt-img-5', 'link-text-generic:here']), 5, 'persisted dismissals raise the floor');
  eq(imageIdFloor(doc(para('no figures')), ['img-alt-img-1']), 1, 'floor survives the dismissed figure being deleted');
  eq(imageIdFloor(doc(para('x')), []), 0, 'empty doc, no dismissals');
});

/* ---------- HTML export ---------- */

check('exportHtml builds an accessible standalone page', () => {
  const { exportHtml } = mod.exportHtml;
  // Shaped like the browser's createHTMLDocument(''), which already has an empty <title>.
  const empty = () => parseHTML('<!doctype html><html><head><title></title></head><body></body></html>').document;
  const listItem = (s) => N.list_item.create(null, [para(s)]);
  const d = doc(
    heading(1, 'Hearing'),
    para(text('Read '), text('the agenda', [...link('https://x.org/a'), M.strong.create()]), text('.')),
    para(text('bad', link('javascript:alert(1)'))),
    N.bullet_list.create(null, [listItem('one'), listItem('two')]),
    figure('img-1', 'Site plan of the shelter', 'site plan'),
    figure('img-2', '', 'map'),
  );
  // A hostile title is checked in the browser by the app gate: linkedom does
  // not escape <title> text on serialization, browsers do (HTML spec).
  const html = exportHtml(d, { title: 'Hearing notice', header: 'CITY OF X', footer: '' }, empty());
  assert(html.startsWith('<!doctype html>'), 'doctype first');
  const page = parseHTML(html).document;
  eq(page.documentElement.getAttribute('lang'), 'en', 'page language declared (WCAG 3.1.1)');
  eq(page.querySelectorAll('title').length, 1, 'exactly one title');
  eq(page.querySelector('title').textContent, 'Hearing notice', 'title');
  eq(page.querySelector('meta[name=viewport]').getAttribute('content'), 'width=device-width, initial-scale=1', 'zoom is not locked');
  eq(page.querySelector('main h1').textContent, 'Hearing', 'content keeps its structure');
  eq(page.querySelector('main a strong')?.textContent, 'the agenda', 'marks nest inside the link');
  eq(page.querySelector('main a').getAttribute('href'), 'https://x.org/a', 'safe href kept');
  const bad = [...page.querySelectorAll('main a')].find((a) => a.textContent === 'bad');
  assert(bad && !bad.hasAttribute('href'), 'unsafe href dropped, text kept');
  eq(page.querySelectorAll('main ul > li').length, 2, 'lists survive');
  const [withAlt, withoutAlt] = page.querySelectorAll('main figure');
  eq(withAlt.getAttribute('role'), 'img', 'figure is an image');
  eq(withAlt.getAttribute('aria-label'), 'Site plan of the shelter', 'alt text is its name');
  assert(!withoutAlt.hasAttribute('aria-label'), 'missing alt stays missing — never filled from the label');
  eq(page.querySelector('header').textContent, 'CITY OF X', 'header text exported');
  eq(page.querySelector('footer'), null, 'empty footer omitted');
  eq(exportHtml(doc(para('x')), { title: '  ', header: '', footer: '' }, empty()).match(/<title>(.*)<\/title>/)[1], 'Untitled document', 'blank title falls back');
});

/* ---------- store mocks (shared by the sections below) ---------- */

const storedDocJSON = (id, overrides = {}) => ({
  id, title: `Title ${id}`, owner: 'o', targets: [], header: 'h', footer: 'f',
  content: doc(heading(1, 'T'), para(`body of ${id}`)).toJSON(),
  lastChecked: Date.now(),
  dismissed: [],
  ...overrides,
});

/** A variable-backed localStorage stand-in: writes persist unless failWrites. */
const mockStorage = (initial, { failWrites = false } = {}) => {
  let disk = initial;
  globalThis.window = {
    localStorage: {
      getItem: () => disk,
      setItem: (_key, value) => {
        if (failWrites) throw new Error('QuotaExceededError');
        disk = value;
      },
      removeItem: () => { disk = null; },
    },
  };
};

/* ---------- dashboard aggregates: derived, never authored ---------- */

check('loadDashboardData derives the side cards from real findings', () => {
  const { docs, criteria, manualItems } = mod.store.loadDashboardData();
  eq(docs.length, 8, 'all eight seed docs');
  assert(criteria.length > 0 && criteria.length <= 5, `criteria rows: ${criteria.length}`);
  for (let i = 1; i < criteria.length; i++) {
    assert(criteria[i - 1].count >= criteria[i].count, 'criteria sorted by count desc');
  }
  for (const c of criteria) {
    assert(/^\d+\.\d+\.\d+$/.test(c.id), `criterion id shape: ${c.id}`);
    assert(c.name.length > 0 && c.count > 0, `criterion row: ${JSON.stringify(c)}`);
  }
  // Failures only (blocker + violation). 1.1.1 used to lead with 6, but three of
  // those were alt-text questions and advisories; 3.1.5 (advisory, AAA) and
  // 1.4.1 (questions only) no longer appear at all.
  deepEq(criteria, [
    { id: '2.4.4', name: 'Link Purpose (In Context)', count: 4 },
    { id: '1.1.1', name: 'Non-text Content', count: 3 },
    { id: '1.3.1', name: 'Info and Relationships', count: 2 },
  ], 'criteria pinned from the seeds');
  assert(manualItems.length > 0, 'manual items exist');
  const docIds = new Set(docs.map((d) => d.id));
  const keys = new Set();
  for (const m of manualItems) {
    assert(docIds.has(m.docId), `manual item points at a real doc: ${m.docId}`);
    assert(m.question.length > 0, 'question text is the finding title');
    const key = `${m.docId}:${m.question}`;
    assert(!keys.has(key), `duplicate manual item ${key}`);
    keys.add(key);
  }
  assert(manualItems.some((m) => m.question === 'Alternative text may not describe the image'), 'the terse-alt finding surfaces on the card');
});

check('dismissed findings leave dashboard counts and manual items', () => {
  mockStorage(null);
  try {
    mod.store.seedIfEmpty();
    const before = mod.store.loadDashboardData();
    const hearingBefore = before.docs.find((d) => d.id === 'hearing-notice');
    eq(hearingBefore.counts.manual, 2, 'seed baseline: two manual findings');
    const itemsBefore = before.manualItems.filter((m) => m.docId === 'hearing-notice').length;
    mod.store.saveDoc('hearing-notice', { dismissed: ['img-alt-suspicious:map'] });
    const after = mod.store.loadDashboardData();
    const hearingAfter = after.docs.find((d) => d.id === 'hearing-notice');
    eq(hearingAfter.counts.manual, 1, 'the dismissed finding leaves the count');
    eq(after.manualItems.filter((m) => m.docId === 'hearing-notice').length, itemsBefore - 1, 'and leaves the card');
    assert(!after.manualItems.some((m) => m.docId === 'hearing-notice' && m.question === 'Alternative text may not describe the image'), 'the dismissed item was the terse-alt one');
  } finally {
    delete globalThis.window;
  }
});

/* ---------- store hardening: corrupt payloads and failed writes ----------
 * NOTE: these tests mutate the store module's internal state (diskFailed,
 * memoryDocs) with no way to reset it — keep them LAST among store tests. */

check('sanitizeStoredDocs normalizes the optional dismissed field', () => {
  const { sanitizeStoredDocs } = mod.store;
  const base = {
    id: 'x', title: 't', owner: 'o', targets: [], header: '', footer: '',
    content: doc(heading(1, 'T')).toJSON(), lastChecked: 0,
  };
  deepEq(sanitizeStoredDocs([base])[0].dismissed, [], 'a payload without the field (pre-dating it) normalizes to []');
  deepEq(sanitizeStoredDocs([{ ...base, dismissed: ['a', 3, null, 'b'] }])[0].dismissed, ['a', 'b'], 'non-string members are filtered (trust boundary)');
  eq(sanitizeStoredDocs([{ ...base, targets: ['WCAG 2.1 AA', { html: 'x' }] }]).length, 0, 'non-string targets drop the doc (they render as React children)');
});

check('dismissed ids round-trip through the store', () => {
  mockStorage(null);
  try {
    mod.store.seedIfEmpty();
    mod.store.saveDoc('hearing-notice', { dismissed: ['img-alt-img-2'] });
    deepEq(mod.store.loadDoc('hearing-notice').dismissed, ['img-alt-img-2'], 'persisted per document');
    deepEq(mod.store.loadDoc('shelter-faq').dismissed, [], 'untouched docs stay empty');
  } finally {
    delete globalThis.window;
  }
});

check('store skips structurally invalid and unparseable docs instead of crashing', () => {
  mockStorage(JSON.stringify([
    storedDocJSON('valid-doc'),
    { id: 'bogus' },                                            // shape-invalid
    storedDocJSON('bad-content', { content: { type: 'nonexistent_node', content: [] } }), // parses as JSON, not as a PM doc
    storedDocJSON('para-top', { content: para('just a paragraph').toJSON() }), // parses fine, but is not a top-level doc node
  ]));
  try {
    const summaries = mod.store.loadDashboardData().docs;
    eq(summaries.length, 1, 'only the fully valid doc is summarized');
    eq(summaries[0].id, 'valid-doc', 'the valid doc survives');
    eq(mod.store.loadDoc('bad-content'), null, 'loadDoc probes content and reports missing rather than throwing');
    eq(mod.store.loadDoc('para-top'), null, 'a non-doc top node is rejected — it would crash the editor mount');
    eq(mod.store.loadDoc('bogus'), null, 'shape-invalid entry is gone');
  } finally {
    delete globalThis.window;
  }
});

check('store reseeds when every stored entry is invalid', () => {
  mockStorage('[{"id":"bogus"}]');
  try {
    const summaries = mod.store.loadDashboardData().docs;
    eq(summaries.length, 8, 'an all-invalid payload reseeds the eight demo docs');
  } finally {
    delete globalThis.window;
  }
});

check('a failed localStorage write flips reads to memory — no stale-disk loop', () => {
  mockStorage(JSON.stringify([storedDocJSON('stale-doc', { header: 'old' })]), { failWrites: true });
  try {
    mod.store.saveDoc('stale-doc', { header: 'new' });
    eq(mod.store.loadDoc('stale-doc').header, 'new', 'after a failed write, reads come from memory, not stale disk');
  } finally {
    delete globalThis.window;
  }
});

/* ---------- .docx import ---------- */

// Async twin of check(): the importer inflates with DecompressionStream.
const acheck = async (name, fn) => {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.log(`  FAIL ${name} — ${error.message}`);
  }
};
const parseXml = (xml) => new XmlParser().parseFromString(xml, 'text/xml');
const { importDocx, ImportError } = mod.importDocx;
const fixture = (name) => new Uint8Array(readFileSync(resolve(ROOT, 'corpus/docx', name)));
const shape = (d) => { const out = []; d.forEach((n) => out.push(n.type.name === 'heading' ? `h${n.attrs.level}` : n.type.name)); return out; };
const hrefs = (d) => { const out = []; d.descendants((n) => { const l = n.marks?.find((m) => m.type.name === 'link'); if (l) out.push(l.attrs.href); }); return out; };
const figures = (d) => { const out = []; d.descendants((n) => { if (n.type.name === 'figure') out.push(n.attrs.alt); }); return out; };
const findingIds = (d) => mod.check.checkDocument(d, { prose: true }).map((f) => f.id);
const rejects = async (bytes, message, what) => {
  try {
    await importDocx(bytes, 'x.docx', parseXml);
  } catch (error) {
    assert(error instanceof ImportError, `${what}: expected an ImportError, got ${error?.constructor?.name}: ${error?.message}`);
    assert(error.userMessage.includes(message), `${what}: message ${JSON.stringify(error.userMessage)} lacks ${JSON.stringify(message)}`);
    return;
  }
  throw new Error(`${what}: imported without error`);
};

/** Build a ZIP from [name, content, { method, flags }] entries — enough to forge hostile archives. */
function makeZip(files, { centralSize } = {}) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content, opt = {}] of files) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const method = opt.method ?? 8;
    const body = method === 8 ? deflateRawSync(data) : data;
    const nameBuf = Buffer.from(name, 'utf8');
    const head = (sig, central) => {
      const b = Buffer.alloc(central ? 46 : 30);
      let o = 0;
      const w16 = (v) => { b.writeUInt16LE(v, o); o += 2; };
      const w32 = (v) => { b.writeUInt32LE(v >>> 0, o); o += 4; };
      w32(sig);
      if (central) w16(20);
      w16(20); w16(opt.flags ?? 0); w16(method); w16(0); w16(0);
      w32(crc32(data)); w32(centralSize ?? body.length); w32(data.length);
      w16(nameBuf.length); w16(0);
      if (central) { w16(0); w16(0); w16(0); w32(0); w32(offset); }
      return b;
    };
    const local = Buffer.concat([head(0x04034b50, false), nameBuf, body]);
    centrals.push(Buffer.concat([head(0x02014b50, true), nameBuf]));
    locals.push(local);
    offset += local.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, cd, end]));
}

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:v="urn:schemas-microsoft-com:vml"';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const rel = (id, type, target, external = false) =>
  `<Relationship Id="${id}" Type="${REL_NS}/${type}" Target="${target}"${external ? ' TargetMode="External"' : ''}/>`;
const rels = (...r) => `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${r.join('')}</Relationships>`;

/** A minimal .docx: body XML plus optional styles, numbering, extra document rels and parts. */
function docx({ body, styles = '', numbering = '', docRels = [], parts = [], title } = {}) {
  const files = [
    ['_rels/.rels', rels(rel('rId1', 'officeDocument', 'word/document.xml'), title === undefined ? '' : rel('rId2', 'metadata/core-properties', 'docProps/core.xml'))],
    ['word/document.xml', `<?xml version="1.0"?><w:document ${NS}><w:body>${body}</w:body></w:document>`],
    ['word/_rels/document.xml.rels', rels(rel('rS', 'styles', 'styles.xml'), rel('rN', 'numbering', 'numbering.xml'), ...docRels)],
    ['word/styles.xml', `<?xml version="1.0"?><w:styles ${NS}>${styles}</w:styles>`],
    ['word/numbering.xml', `<?xml version="1.0"?><w:numbering ${NS}>${numbering}</w:numbering>`],
    ...parts,
  ];
  if (title !== undefined) files.push(['docProps/core.xml', `<?xml version="1.0"?><cp:coreProperties xmlns:cp="x" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${title}</dc:title></cp:coreProperties>`]);
  return makeZip(files);
}
const P = (inner, pPr = '') => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${inner}</w:p>`;
const R = (text, rPr = '') => `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const style = (id, name, extra = '') => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/>${extra}</w:style>`;
const drawing = (docPr, graphic = '<pic:pic/>') => `<w:r><w:drawing><wp:inline>${docPr}<a:graphic><a:graphicData>${graphic}</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;

await acheck('linkedom matches OOXML by qualified name, as the importer assumes', () => {
  const el = parseXml(`<w:p ${NS}/>`).documentElement;
  eq(el.tagName, 'w:p', 'qualified tagName');
});

for (const producer of ['pandoc', 'libreoffice']) {
  await acheck(`import: ${producer}'s .docx keeps headings, lists, links, images and reports the table`, async () => {
    const r = await importDocx(fixture(`library-hours.${producer}.docx`), `library-hours.${producer}.docx`, parseXml);
    eq(r.title, 'Library hours notice', 'title from docProps');
    deepEq(shape(r.content), ['h1', 'h1', 'paragraph', 'h2', 'bullet_list', 'ordered_list', 'h4', 'paragraph', 'figure', 'figure',
      'paragraph', 'paragraph', 'paragraph', 'paragraph', 'paragraph'], 'block structure');
    const bullets = r.content.child(4);
    eq(bullets.childCount, 2, 'two top-level bullets');
    eq(bullets.child(1).lastChild.type.name, 'bullet_list', 'the second bullet holds the nested list');
    eq(r.content.child(5).childCount, 2, 'one ordered list of two items, even across numIds');
    deepEq(hrefs(r.content), ['https://example.org/hours', 'https://example.org/branch'], 'links');
    deepEq(figures(r.content), ['Bar chart of visits by weekday', ''], 'image alt text');
    deepEq(r.notes, ['1 table flattened into paragraphs; table structure isn’t checked yet.'], 'notes');
    const ids = findingIds(r.content);
    for (const want of ['heading-skip:Details', 'link-text-generic:click here', 'img-alt-img-2']) {
      assert(ids.includes(want), `finding ${want} in ${JSON.stringify(ids)}`);
    }
    assert(ids.some((id) => id.startsWith('link-text-raw-url')), `raw-URL link flagged in ${JSON.stringify(ids)}`);
  });
}

await acheck('import: a TextEdit .docx with fake headings and typed bullets stays unstructured, and is flagged', async () => {
  const r = await importDocx(fixture('library-hours.textedit.docx'), 'library-hours.textedit.docx', parseXml);
  eq(r.title, 'library-hours.textedit', 'no docProps title: the file name');
  assert(shape(r.content).every((t) => t === 'paragraph'), `no invented structure: ${shape(r.content)}`);
  eq(r.content.child(3).textContent, ' • Weekdays: 9 to 6', 'a typed bullet stays text');
  assert(findingIds(r.content).includes('document-no-headings'), 'a document with no headings is flagged for review');
});

await acheck('import: styles, numbering and fields resolve the way Word renders them', async () => {
  const r = await importDocx(docx({
    styles: style('Heading2', 'heading 2') + style('Sect', 'Section Head', '<w:basedOn w:val="Heading2"/>')
      + style('LoopA', 'Loop A', '<w:basedOn w:val="LoopB"/>') + style('LoopB', 'Loop B', '<w:basedOn w:val="LoopA"/>')
      + style('__proto__', 'heading 3') + style('ListPara', 'List Bullet', '<w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr>')
      + style('NumHead', 'heading 1', '<w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr>'),
    numbering: '<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>',
    docRels: [rel('rL', 'hyperlink', 'https://example.org/a', true), rel('rJ', 'hyperlink', 'javascript:alert(1)', true)],
    body: [
      P(R('Inherited'), '<w:pStyle w:val="Sect"/>'),
      P(R('Cycle'), '<w:pStyle w:val="LoopA"/>'),
      P(R('Proto'), '<w:pStyle w:val="__proto__"/>'),
      P(R('Numbered heading'), '<w:pStyle w:val="NumHead"/>'),
      P(R('Item'), '<w:pStyle w:val="ListPara"/>'),
      P(R('Not an item'), '<w:pStyle w:val="ListPara"/><w:numPr><w:numId w:val="0"/></w:numPr>'),
      P('<w:r><w:t>See </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> HYPERLINK "https://example.org/f" </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>the form</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>'),
      P('<w:r><w:fldChar w:fldCharType="begin"/><w:instrText>HYPERLINK \\l "top"</w:instrText><w:fldChar w:fldCharType="separate"/><w:t>back to top</w:t><w:fldChar w:fldCharType="end"/></w:r>'),
      P('<w:hyperlink r:id="rL">' + R('safe') + '</w:hyperlink> <w:hyperlink r:id="rJ">' + R('unsafe') + '</w:hyperlink>'),
    ].join(''),
  }), 'f.docx', parseXml);
  deepEq(shape(r.content), ['h2', 'paragraph', 'h3', 'h1', 'bullet_list', 'paragraph', 'paragraph', 'paragraph', 'paragraph'], 'structure');
  eq(r.content.child(6).textContent, 'See the form', 'field code text is not content');
  deepEq(hrefs(r.content), ['https://example.org/f', 'https://example.org/a'], 'field hyperlink linked; bookmark and javascript: are not');
  eq(r.content.child(7).textContent, 'back to top', 'bookmark field keeps its text');
  eq(r.title, 'f', 'file name without extension');
});

await acheck('import: tracked changes, hidden text, symbols, notes and text boxes are read once and correctly', async () => {
  const r = await importDocx(docx({
    body: [
      P('<w:ins>' + R('kept') + '</w:ins><w:del><w:r><w:delText>gone</w:delText></w:r></w:del>' + R('hidden', '<w:vanish/>') + R(' shown', '<w:vanish w:val="0"/>')),
      P('<w:r><w:t>a</w:t><w:sym w:font="Symbol" w:char="F0B7"/><w:sym w:font="Arial" w:char="00E9"/><w:noBreakHyphen/><w:softHyphen/><w:t>b</w:t><w:footnoteReference w:id="1"/></w:r>'),
      P('<w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wp:anchor><wp:docPr id="1" name="Box"/><a:graphic><a:graphicData><wps:wsp><wps:txbx><w:txbxContent>' + P(R('Box text')) + '</w:txbxContent></wps:txbx></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice><mc:Fallback><w:pict><v:shape><v:textbox><w:txbxContent>' + P(R('Box text')) + '</w:txbxContent></v:textbox></v:shape></w:pict></mc:Fallback></mc:AlternateContent></w:r>'),
    ].join(''),
  }), 'x.docx', parseXml);
  eq(r.content.child(0).textContent, 'kept shown', 'insertions kept, deletions and hidden text dropped');
  eq(r.content.child(1).textContent, 'aé‑b', 'symbol-font glyph dropped, real character kept, hyphens mapped');
  eq(r.content.textContent.split('Box text').length - 1, 1, 'a text box is read once, not once per AlternateContent branch');
  deepEq(r.notes, ['1 footnote or endnote not imported.', 'Tracked changes were imported as if accepted.'], 'notes');
});

await acheck('import: images keep their alt text, decorative ones are left out, headings survive a split', async () => {
  const r = await importDocx(docx({
    styles: style('Heading1', 'heading 1'),
    body: [
      P(R('Chart ') + drawing('<wp:docPr id="1" name="P" descr="Visits by day"/>') + R(' after'), '<w:pStyle w:val="Heading1"/>'),
      P(drawing('<wp:docPr id="2" name="P" title="Title only"/>')),
      P(drawing('<wp:docPr id="3" name="P"><a:extLst><a:ext><adec:decorative xmlns:adec="x" val="1"/></a:ext></a:extLst></wp:docPr>')),
      P(drawing('<wp:docPr id="4" name="P"><a:extLst><a:ext><adec:decorative xmlns:adec="x" val="0"/></a:ext></a:extLst></wp:docPr>')),
      P(drawing('<wp:docPr id="5" name="Shape"/>', '<wps:wsp/>')),
    ].join(''),
  }), 'x.docx', parseXml);
  deepEq(shape(r.content), ['h1', 'figure', 'h1', 'figure', 'figure', 'figure'], 'heading text on both sides of the image; no empty heading');
  deepEq(figures(r.content), ['Visits by day', 'Title only', '', ''], 'alt from descr, then title; decorative val=0 is not decorative; a shape without alt is flagged like Word does');
  deepEq(r.notes, ['1 decorative image marked in Word left out.'], 'notes');
});

await acheck('import: header, footer and body text arrive as text, never markup', async () => {
  const r = await importDocx(docx({
    body: P(R('&lt;img src=x onerror=alert(1)&gt;')) + '<w:sectPr><w:headerReference w:type="default" r:id="rH"/><w:footerReference w:type="first" r:id="rF"/></w:sectPr>',
    docRels: [rel('rH', 'header', 'header1.xml'), rel('rF', 'footer', 'footer1.xml')],
    parts: [['word/header1.xml', `<w:hdr ${NS}>${P(R('CITY  OF  X'))}</w:hdr>`], ['word/footer1.xml', `<w:ftr ${NS}>${P(R('first page only'))}</w:ftr>`]],
    title: '  Council   minutes ',
  }), 'x.docx', parseXml);
  eq(r.content.child(0).textContent, '<img src=x onerror=alert(1)>', 'markup-looking text is plain text');
  eq(r.header, 'CITY OF X', 'default header text');
  eq(r.footer, '', 'a first-page-only footer is not the default');
  eq(r.title, 'Council minutes', 'whitespace-collapsed dc:title');
});

await acheck('import: an empty body still yields a valid document', async () => {
  const r = await importDocx(docx({ body: '' }), 'Empty.docx', parseXml);
  deepEq(shape(r.content), ['paragraph'], 'one empty paragraph');
  eq(r.content.type.name, 'doc', 'a doc node');
});

await acheck('import (review regressions): nothing is silently lost', async () => {
  const pic = drawing('<wp:docPr id="9" name="P" descr="Logo"/>');
  const r = await importDocx(docx({
    styles: '<w:style w:type="numbering" w:styleId="MyList"><w:name w:val="My List"/><w:pPr><w:numPr><w:numId w:val="2"/></w:numPr></w:pPr></w:style>' + style('H2', 'heading 2'),
    numbering: '<w:abstractNum w:abstractNumId="0"><w:numStyleLink w:val="MyList"/></w:abstractNum>'
      + '<w:abstractNum w:abstractNumId="1"><w:styleLink w:val="MyList"/><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>'
      + '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>',
    body: [
      // A field whose end never comes must not swallow what follows.
      P('<w:r><w:fldChar w:fldCharType="begin"/><w:instrText>PAGE</w:instrText></w:r>'),
      P(R('After the broken field')),
      // A text box holding an image keeps its text, and its image.
      P('<w:r><w:drawing><wp:anchor><wp:docPr id="1" name="Box"/><a:graphic><a:graphicData><wps:wsp><wps:txbx><w:txbxContent>' + P(R('Callout') + pic) + '</w:txbxContent></wps:txbx></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>'),
      // Rows inside a repeating-section content control.
      '<w:tbl><w:sdt><w:sdtContent><w:tr><w:tc>' + P(R('Row in a control')) + '</w:tc></w:tr></w:sdtContent></w:sdt></w:tbl>',
      // A list defined through a list style is ordered, not a fallback bullet;
      // an image inside an item stays in that item.
      P(R('Step A') + pic + R(' continued'), '<w:numPr><w:numId w:val="1"/></w:numPr>'),
      P(R('Step B'), '<w:numPr><w:numId w:val="1"/></w:numPr>'),
      // A block-level tracked insertion is reported; a deleted empty heading is gone.
      '<w:ins>' + P(R('Inserted paragraph')) + '</w:ins>',
      P('<w:del><w:r><w:delText>Old heading</w:delText></w:r></w:del>', '<w:pStyle w:val="H2"/><w:rPr><w:del w:id="1"/></w:rPr>'),
    ].join(''),
  }), 'x.docx', parseXml);
  const text = r.content.textContent;
  for (const want of ['After the broken field', 'Callout', 'Row in a control', 'Inserted paragraph']) assert(text.includes(want), `"${want}" imported (got ${JSON.stringify(text)})`);
  eq(figures(r.content).length, 2, 'the text box image and the list image');
  const ol = [];
  r.content.forEach((n) => { if (n.type.name.endsWith('_list')) ol.push(n); });
  eq(ol.length, 1, 'one list: the image does not restart it');
  eq(ol[0].type.name, 'ordered_list', 'numStyleLink resolved to the decimal definition');
  eq(ol[0].childCount, 2, 'two items');
  deepEq(ol[0].child(0).content.content.map((n) => n.type.name), ['paragraph', 'figure', 'paragraph'], 'the image stays inside its item');
  assert(!shape(r.content).includes('h2'), 'a deleted heading is not imported as an empty h2');
  assert(r.notes.includes('Tracked changes were imported as if accepted.'), 'tracked changes noted');
});

await acheck('import (review regressions): header text boxes are read once; many fields stay linear', async () => {
  const box = '<w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wp:anchor><wp:docPr id="1" name="B"/><a:graphic><a:graphicData><wps:wsp><wps:txbx><w:txbxContent>' + P(R('CITY OF X')) + '</w:txbxContent></wps:txbx></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice><mc:Fallback><w:pict><v:shape><v:textbox><w:txbxContent>' + P(R('CITY OF X')) + '</w:txbxContent></v:textbox></v:shape></w:pict></mc:Fallback></mc:AlternateContent></w:r>';
  const r = await importDocx(docx({
    body: P('<w:r>' + '<w:fldChar w:fldCharType="begin"/><w:fldChar w:fldCharType="end"/>'.repeat(50_000) + '<w:t>still here</w:t></w:r>') + '<w:sectPr><w:headerReference w:type="default" r:id="rH"/></w:sectPr>',
    docRels: [rel('rH', 'header', 'header1.xml')],
    parts: [['word/header1.xml', `<w:hdr ${NS}>${P(box)}</w:hdr>`]],
  }), 'x.docx', parseXml);
  eq(r.header, 'CITY OF X', 'header text box read once');
  eq(r.content.textContent, 'still here', '100k fldChars in one run: processed without cloning or recursion');
});

await acheck('import rejects hostile or unreadable files with a plain message', async () => {
  await rejects(new Uint8Array(Buffer.from('%PDF-1.7 not a zip')), 'isn’t a .docx', 'a PDF');
  await rejects(new Uint8Array(Buffer.from('\xd0\xcf\x11\xe0 legacy .doc or encrypted docx', 'latin1')), 'isn’t a .docx', 'an OLE file');
  await rejects(makeZip([['a.txt', 'hello']]), 'isn’t a .docx', 'a zip without a document');
  const bomb = makeZip([
    ['_rels/.rels', rels(rel('rId1', 'officeDocument', 'word/document.xml'))],
    ['word/document.xml', Buffer.alloc(40 * 1024 * 1024, 0x20)],
  ]);
  assert(bomb.length < 200_000, `the bomb is small on disk (${bomb.length} bytes)`);
  await rejects(bomb, 'too large to import', 'a zip bomb');
  await rejects(docx({ body: '' }).slice(0, 400), 'isn’t a .docx', 'a truncated file');
  const doctype = makeZip([
    ['_rels/.rels', rels(rel('rId1', 'officeDocument', 'word/document.xml'))],
    ['word/document.xml', `<?xml version="1.0"?><!DOCTYPE d [<!ENTITY a "aaaa">]><w:document ${NS}><w:body>${P(R('&a;'))}</w:body></w:document>`],
  ]);
  await rejects(doctype, 'couldn’t be read', 'a DTD');
  await rejects(makeZip([['_rels/.rels', rels(rel('rId1', 'officeDocument', 'word/document.xml'))], ['word/document.xml', 'x', { flags: 1 }]]), 'couldn’t be read', 'an encrypted entry');
  await rejects(makeZip([['_rels/.rels', 'a'], ['_rels/.rels', 'b']]), 'couldn’t be read', 'duplicate entry names');
  await rejects(makeZip([['_rels/.rels', rels(rel('rId1', 'officeDocument', 'word/document.xml'))], ['word/document.xml', 'x']], { centralSize: 0x7fffffff }), 'couldn’t be read', 'sizes pointing past the end');
  const corrupt = makeZip([['_rels/.rels', rels(rel('rId1', 'officeDocument', 'word/document.xml'))], ['word/document.xml', `<w:document ${NS}><w:body/></w:document>`]]);
  const i = Buffer.from(corrupt).indexOf('word/document.xml') + 'word/document.xml'.length;
  corrupt.fill(0xff, i, i + 8);
  await rejects(corrupt, 'couldn’t be read', 'corrupt deflate data');
  const strict = makeZip([['_rels/.rels', `<Relationships xmlns="x"><Relationship Id="r" Type="http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument" Target="word/document.xml"/></Relationships>`]]);
  await rejects(strict, 'Strict Open XML', 'Strict OOXML');
  await rejects(docx({ body: '<w:p/>'.repeat(401_000) }), 'too large to import', 'an element budget blow-out');
});

await acheck('store: createDoc gives a safe, unique id and keeps import notes', async () => {
  const { store } = await import(`${pathToFileURL(TMP).href}?fresh`);
  const { slugId } = store;
  eq(slugId('Library hours notice', () => false), 'library-hours-notice', 'slug');
  eq(slugId('Café  Menu!', () => false), 'cafe-menu', 'accents and punctuation');
  eq(slugId('../../etc/passwd', () => false), 'etc-passwd', 'no path characters');
  eq(slugId('日本語', () => false), 'document', 'nothing sluggable');
  eq(slugId('x', (id) => id === 'x' || id === 'x-2'), 'x-3', 'unique suffix');
  mockStorage(JSON.stringify([storedDocJSON('library-hours-notice')]));
  try {
    const content = doc(para('Hello')).toJSON();
    const a = store.createDoc({ title: 'Library hours notice', header: '', footer: '', content, importNotes: ['1 table flattened'] });
    eq(a.id, 'library-hours-notice-2', 'collides with an existing doc');
    eq(a.persisted, true, 'written to storage');
    deepEq(store.loadDoc(a.id).importNotes, ['1 table flattened'], 'notes stored');
  } finally {
    delete globalThis.window;
  }
  mockStorage('[]', { failWrites: true });
  try {
    const b = store.createDoc({ title: 'T', header: '', footer: '', content: doc(para('x')).toJSON(), importNotes: [] });
    eq(b.persisted, false, 'a failed write is reported, not hidden');
    eq(store.loadDoc(b.id)?.title, 'T', 'still usable this session');
  } finally {
    delete globalThis.window;
  }
  deepEq(store.sanitizeStoredDocs([{ ...storedDocJSON('d'), importNotes: ['ok', 3, null] }])[0].importNotes, ['ok'], 'notes sanitized to strings');
});

await acheck('dashboard "Most-failed criteria" counts failures only, never questions or advisories', async () => {
  const { store } = await import(`${pathToFileURL(TMP).href}?criteria`);
  // No headings in six blocks (a Needs-your-call question) and dense prose (advisory, 3.1.5 is AAA).
  const questionsOnly = doc(para(DENSE), para('Two.'), para('Three.'), para('Four.'), para('Five.'), para('Six.'));
  const failing = doc(heading(1, 'T'), figure('img-1', ''), para(text('click here', link('https://x.org/a'))));
  mockStorage(JSON.stringify([storedDocJSON('q', { content: questionsOnly.toJSON() }), storedDocJSON('f', { content: failing.toJSON() })]));
  try {
    const { criteria, docs } = store.loadDashboardData();
    const q = docs.find((d) => d.id === 'q');
    assert(q.counts.manual >= 1 && q.counts.advisory >= 1, `fixture has manual and advisory findings: ${JSON.stringify(q.counts)}`);
    deepEq(criteria, [
      { id: '1.1.1', name: 'Non-text Content', count: 1 },
      { id: '2.4.4', name: 'Link Purpose (In Context)', count: 1 },
    ], 'the blocker and the violation count; the question and the advisory do not');
  } finally {
    delete globalThis.window;
  }
});

/* ---------- report ---------- */

console.log('');
if (failures.length) {
  console.error(`FAILED (${failures.length})\n`);
  for (const f of failures) console.error('  ' + f);
  console.error('\nFix the rules. Do not weaken the check.');
  process.exit(1);
}
console.log(`Checking engine: PASSED — ${passed} checks, 0 failures.`);
