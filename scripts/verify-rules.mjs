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

check('RULES ports the 16 rules with the §8.1 structural/prose split', () => {
  eq(RULES.length, 16, 'rule count');
  deepEq([...PROSE_RULE_IDS].sort(), ['colour-only-reference', 'language-of-parts', 'long-sentence', 'reading-level'], 'prose rules');
  for (const r of RULES) {
    assert(r.criterion && r.criterion.length > 0, `${r.id} has no criterion`);
    assert(r.kind === 'structural' || r.kind === 'prose', `${r.id} has no kind`);
  }
  deepEq(RULES.map((r) => r.id).sort(), [
    'colour-only-reference', 'contrast-minimum', 'document-no-h1', 'document-no-headings', 'form-blank', 'heading-empty', 'heading-skip',
    'img-alt-missing', 'img-alt-suspicious', 'img-long-description', 'language-of-parts', 'link-text-ambiguous', 'link-text-generic',
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
  eq(found[0].severity, 'advisory', 'severity: 2.4.10 is AAA, which the scale grades Advisory');
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

/* ---------- contrast ---------- */

check('contrast maths: colours parse strictly, ratios match the token gate', () => {
  const { parseColour, contrastRatio } = mod.contrast;
  eq(parseColour('constructor'), null, 'an inherited property name is not a colour');
  const { DOMParser: PMDOMParser } = mod.pm;
  const { document: htmlDoc } = parseHTML('<!doctype html><html><body><p><span style="font-size: 18.67px">x</span></p></body></html>');
  const pasted = PMDOMParser.fromSchema(schema).parse(htmlDoc.body);
  eq(pasted.firstChild.firstChild.marks.find((m) => m.type.name === 'fontSize')?.attrs.size, 18.67, 'a pasted fractional size keeps its fraction');
  deepEq(parseColour('#5E6C84'), [94, 108, 132], 'hex 6');
  deepEq(parseColour('#fff'), [255, 255, 255], 'hex 3');
  deepEq(parseColour('rgb(94, 108, 132)'), [94, 108, 132], 'rgb() as browsers write pasted styles');
  deepEq(parseColour('rgba(0,0,0,1)'), [0, 0, 0], 'opaque rgba');
  deepEq(parseColour('Yellow'), [255, 255, 0], 'basic name (the highlight default)');
  for (const junk of ['rgba(0,0,0,0.5)', 'transparent', 'var(--x)', 'hsl(0 0% 50%)', 'rgb(300,0,0)', 'cornflowerblue', '']) {
    eq(parseColour(junk), null, `not judged: ${JSON.stringify(junk)}`);
  }
  // Reference values: the WCAG formula as scripts/verify-tokens.mjs computes it.
  eq(contrastRatio([0, 0, 0], [255, 255, 255]), 21, 'black on white');
  eq(contrastRatio(parseColour('#767676'), [255, 255, 255]).toFixed(2), '4.54', '#767676 just passes');
  eq(contrastRatio(parseColour('#777777'), [255, 255, 255]).toFixed(2), '4.48', '#777777 just fails');
});

check('contrast-minimum flags failing colour combinations, large-text aware, with a one-click fix', () => {
  const colours = (fg, bg, extra = []) => [...(fg ? [M.textColor.create({ color: fg })] : []), ...(bg ? [M.highlight.create({ color: bg })] : []), ...extra];
  const found = (d) => mod.check.checkDocument(d, { prose: false }).filter((f) => f.id.startsWith('contrast-minimum'));
  const GRAY = '#5E6C84';
  const BLUE_HL = '#CCE0FF'; // the toolbar's own pair: 3.96:1
  const one = found(doc(para(text('Deadlines are '), text('shown in light grey', colours(GRAY, BLUE_HL)), text('.'))));
  eq(one.length, 1, 'fires');
  eq(one[0].severity, 'violation', 'Fails AA');
  eq(one[0].criterion, '1.4.3 Contrast (Minimum)', 'criterion');
  eq(one[0].title, 'Text contrast is below 4.5:1', 'title');
  assert(one[0].explanation.startsWith('#5e6c84 on #cce0ff is 3.96:1.'), one[0].explanation);
  eq(one[0].to - one[0].from, 'shown in light grey'.length, 'range covers the coloured run');
  deepEq(one[0].fix, { kind: 'defaultColours' }, 'fix');
  eq(one[0].original, '#5e6c84 on #cce0ff', 'diff: before');
  eq(one[0].suggestion, 'default colours', 'diff: after');
  eq(found(doc(para(text('fine', colours(GRAY, null))))).length, 0, 'Gray on the white page passes (5.31:1)');
  eq(found(doc(para(text('big', colours(GRAY, BLUE_HL, [M.fontSize.create({ size: 24 })]))))).length, 0, '24px is large text: 3:1');
  eq(found(doc(para(text('bold', colours(GRAY, BLUE_HL, [M.fontSize.create({ size: 19 }), M.strong.create()]))))).length, 0, '19px bold is large');
  eq(found(doc(para(text('bold', colours(GRAY, BLUE_HL, [M.fontSize.create({ size: 18 }), M.strong.create()]))))).length, 1, '18px bold is not');
  eq(found(doc(N.heading.create({ level: 2 }, text('Heading', colours(GRAY, BLUE_HL))))).length, 0, 'an h2 renders as large text');
  eq(found(doc(N.heading.create({ level: 4 }, text('Heading', colours(GRAY, BLUE_HL))))).length, 1, 'an h4 does not');
  eq(found(doc(para(text('odd', colours('var(--brand)', BLUE_HL))))).length, 0, 'a colour that cannot be read is not judged');
  const split = found(doc(para(text('light ', colours(GRAY, BLUE_HL)), text('grey', colours(GRAY, BLUE_HL, [M.strong.create()])))));
  eq(split.length, 1, 'a failing run split by bold is one finding');
  eq(split[0].snippet ?? split[0].excerpt, 'light grey', 'its text');
  eq(found(doc(para(text('shown in light grey')))).length, 0, 'after the fix (marks removed) it passes');
  eq(found(doc(para(text('dark on dark', colours(null, '#000080'))))).length, 1, 'default text on a dark highlight fails too');
  // Review regressions.
  const link = found(doc(para(text('a link', [M.link.create({ href: 'https://x.org' }), M.highlight.create({ color: '#808080' })]))));
  eq(link.length, 1, 'an uncoloured link is judged as link blue (2.38:1 on grey), not black (5.32:1)');
  assert(link[0].explanation.startsWith('#0000ee on #808080 is 2.37:1.'), link[0].explanation);
  const edge = found(doc(para(text('edge', colours('#008676', null)))));
  assert(edge[0].explanation.startsWith('#008676 on #ffffff is 4.49:1.'), `4.495 fails and must not read "4.50": ${edge[0].explanation}`);
  eq(found(doc(para(text('Word '), text(' \t ', colours(GRAY, BLUE_HL)), text('spacing')))).length, 0, 'a coloured space is not text to read');
  const recoloured = found(doc(para(text('shown in light grey', colours('#eeeeee', null)))));
  assert(recoloured[0].id !== one[0].id, 'recolouring the same text gives a new id, so an old dismissal cannot hide it');
});

/* ---------- fill-in blanks ---------- */

check('form-blank asks once per document how its fill-in blanks will be completed', () => {
  const blanks = (d, prose = false) => mod.check.checkDocument(d, { prose }).filter((f) => f.id.startsWith('form-blank'));
  const U = [M.underline.create()];
  const form = doc(
    para('Use the form below: Name ____ Address ____'),
    para(text('Date: '), text('\t', U)),
    para('\u2610 Yes \u2751 \u25A1 \u25FB [ ] \uFF3F\uFF3F\uFF3F'),
    para(text('Reference: '), text('\u2002'.repeat(5), U)),
  );
  const found = blanks(form);
  eq(found.length, 1, 'one finding for the whole document, not one per blank');
  eq(found[0].id, 'form-blank', 'id does not follow the text, so a dismissal survives edits');
  eq(found[0].severity, 'manual', 'Needs your call: only the author knows if it must be filled in digitally');
  eq(found[0].criterion, '1.3.1 Info and Relationships', 'criterion');
  eq(found[0].title, 'Document has 10 fill-in blanks', '2 underscore lines + an underlined tab + 6 in the glyph line + underlined en-spaces');
  eq(found[0].from, 1 + 'Use the form below: Name '.length, 'anchored at the first blank');
  eq(found[0].to - found[0].from, 4, 'covering it');
  eq(blanks(doc(para('Sign here: ______')))[0].title, 'Document has 1 fill-in blank', 'singular');
  for (const [what, d] of [
    ['bare []', doc(para('See [Node.js website][] and string[] and [x].'))],
    ['a dunder name', doc(para('Call __init__ first.'))],
    ['checked boxes', doc(para('\u2611 done \u2612 also done'))],
    ['a dotted leader', doc(para('Loading..... please wait'))],
    ['an underlined phrase split by other marks', doc(para(text('foo', [M.strong.create(), ...U]), text(' ', U), text('bar', [M.em.create(), ...U])))],
    ['an underlined word', doc(para(text('important', U)))],
    ['one stray underlined space', doc(para(text('a'), text(' ', U), text('b')))],
    ['underscores inside an identifier', doc(para('Set MAX___RETRIES to 3.'))],
  ]) eq(blanks(d).length, 0, `quiet on ${what}`);
  eq(blanks(doc(para('Name____')))[0].title, 'Document has 1 fill-in blank', 'a label right before the line still counts');
  eq(blanks(doc(para(text('Name: ____'), text('   ', U))))[0].title, 'Document has 1 fill-in blank', 'underscores and underlined spaces that touch are one blank');
  // Structural: deleting the last blank retracts it at once.
  const full = mod.check.checkDocument(doc(para('Name ____')), { prose: true });
  const after = mod.check.reconcile(full, mod.check.checkDocument(doc(para('Name Jo')), { prose: false }), new Set(), { keepProse: true });
  eq(after.filter((f) => f.id.startsWith('form-blank')).length, 0, 'retracted live');
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

check('img-long-description asks about charts, maps and diagrams, one alt question at a time', () => {
  const ask = (alt) => blockFindings(doc(figure('img-1', alt, 'site map')), 'img-long-description');
  for (const alt of [
    'Bar chart of shelter beds by month', 'Traffic graph', 'Wiring diagram for the pump house',
    'Map of the affected area', 'Infographic on water safety', 'Intake flowchart',
    'Schematic of the new entrance', 'Two maps of the flood zone', 'Pie charts comparing 2025 and 2026',
  ]) eq(ask(alt).length, 1, `fires on "${alt}"`);
  const [f] = ask('Map of the affected area');
  eq(f.severity, 'manual', 'only the author knows what readers need');
  eq(f.title, 'Does this site map need a long description?', 'title names the image');
  eq(f.snippet, 'Map of the affected area', 'excerpt shows the alt');
  eq(f.fix, undefined, 'no machine fix');
  deepEq(f.anchor, { kind: 'figure', figureId: 'img-1' }, 'figure-anchored');
  for (const alt of [
    'A graphic of the shelter logo', 'Photograph of the library entrance', 'The 2026 roadmap cover page',
    'Mapping volunteers at the fair', '',
  ]) eq(ask(alt).length, 0, `quiet on "${alt}"`);
  // One alt-text question per image: fix the alt first, then decide on detail.
  eq(ask('map').length, 0, 'terse alt asks "does this describe it?" first');
  eq(ask('Image of a map of the flood zone').length, 0, 'the redundant prefix is fixed first');
  eq(ask('a map of the flood zone').length, 1, 'then the long-description question');
  // Pointing to a description nearby, as the finding advises, answers it.
  eq(ask('Map of the affected area; details below').length, 0, '"below" answers it');
  eq(ask('Flowchart of the intake steps, described in the text').length, 0, '"described" answers it');
  eq(ask('Map of the parcels below the dam').length, 1, 'a bare "below" is geography, not a pointer');
  // Keyed on the image, so any other alt edit keeps a dismissal.
  const idOf = (alt) => mod.check.checkDocument(doc(figure('img-7', alt)), { prose: false })
    .find((x) => x.id.startsWith('img-long-description')).id;
  eq(idOf('Map of the affected area'), 'img-long-description:img-7', 'keyed on the image');
  eq(idOf('Map of the affected areas'), 'img-long-description:img-7', 'stable across alt edits');
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

check('an AAA rule never grades a finding "Blocks access" or "Fails AA"', () => {
  const levelOf = new Map(RULES.map((r) => [r.criterion, r.level]));
  const aaaRules = RULES.filter((r) => r.level === 'AAA').map((r) => r.id).sort();
  // One document that makes every AAA rule fire: an h2 with no h1, dense prose, a long sentence.
  const findings = mod.check.checkDocument(doc(heading(2, 'Section'), para(DENSE), para(LONG)), { prose: true });
  const fired = new Set();
  for (const f of findings) {
    if (levelOf.get(f.criterion) !== 'AAA') continue;
    assert(f.severity === 'advisory' || f.severity === 'manual', `${f.id} is AAA but graded ${f.severity}`);
    const rule = aaaRules.find((id) => f.id === id || f.id.startsWith(`${id}:`));
    if (rule) fired.add(rule);
  }
  deepEq([...fired].sort(), aaaRules, 'every AAA rule fired, so the check is not vacuous');
});

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
  eq(noH1.severity, 'advisory', 'severity: 2.4.10 is AAA, which the scale grades Advisory');
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

/* ---------- language of parts (3.1.2) ---------- */

check('languageRuns names each of the 15 tagline languages and stays quiet on English', () => {
  const { languageRuns } = mod.textHelpers;
  // The federal (HHS §1557) language-assistance taglines, as notices print them.
  const TAGLINES = {
    es: 'ATENCIÓN: si habla español, tiene a su disposición servicios gratuitos de asistencia lingüística. Llame al 1-888-555-0100.',
    zh: '注意：如果您使用繁體中文，您可以免費獲得語言援助服務。請致電 1-888-555-0100。',
    vi: 'CHÚ Ý: Nếu bạn nói Tiếng Việt, có các dịch vụ hỗ trợ ngôn ngữ miễn phí dành cho bạn. Gọi số 1-888-555-0100.',
    ko: '주의: 한국어를 사용하시는 경우, 언어 지원 서비스를 무료로 이용하실 수 있습니다. 1-888-555-0100 번으로 전화해 주십시오.',
    tl: 'PAUNAWA: Kung nagsasalita ka ng Tagalog, maaari kang gumamit ng mga serbisyo ng tulong sa wika nang walang bayad. Tumawag sa 1-888-555-0100.',
    ru: 'ВНИМАНИЕ: Если вы говорите на русском языке, то вам доступны бесплатные услуги перевода. Звоните 1-888-555-0100.',
    ar: 'ملحوظة: إذا كنت تتحدث اللغة العربية، فإن خدمات المساعدة اللغوية تتوافر لك بالمجان. اتصل برقم 1-888-555-0100.',
    ht: 'ATANSYON: Si w pale Kreyòl Ayisyen, gen sèvis èd pou lang ki disponib gratis pou ou. Rele 1-888-555-0100.',
    fr: 'ATTENTION : Si vous parlez français, des services d\'aide linguistique vous sont proposés gratuitement. Appelez le 1-888-555-0100.',
    pl: 'UWAGA: Jeżeli mówisz po polsku, możesz skorzystać z bezpłatnej pomocy językowej. Zadzwoń pod numer 1-888-555-0100.',
    pt: 'ATENÇÃO: Se fala português, encontram-se disponíveis serviços linguísticos, grátis. Ligue para 1-888-555-0100.',
    it: 'ATTENZIONE: In caso la lingua parlata sia l\'italiano, sono disponibili servizi di assistenza linguistica gratuiti. Chiamare il numero 1-888-555-0100.',
    de: 'ACHTUNG: Wenn Sie Deutsch sprechen, stehen Ihnen kostenlos sprachliche Hilfsdienstleistungen zur Verfügung. Rufnummer: 1-888-555-0100.',
    ja: '注意事項：日本語を話される場合、無料の言語支援をご利用いただけます。1-888-555-0100 まで、お電話にてご連絡ください。',
    fa: 'توجه: اگر به زبان فارسی گفتگو می کنید، تسهیلات زبانی بصورت رایگان برای شما فراهم می باشد. با 1-888-555-0100 تماس بگیرید.',
  };
  deepEq(mod.textHelpers.LANGUAGES.slice(0, 15).map((l) => l.code).sort(), Object.keys(TAGLINES).sort(), 'the menu leads with the 15');
  for (const [code, tagline] of Object.entries(TAGLINES)) {
    const runs = languageRuns(tagline);
    eq(runs.length, 1, `${code}: one passage`);
    eq(runs[0].lang, code, `${code}: named`);
  }
  // The Spanish passage runs across its two sentences, label included.
  const es = TAGLINES.es;
  const [run] = languageRuns(es);
  eq(es.slice(run.from, run.to), es.slice(0, -1), 'label, both sentences, no final stop');
  // Only the Spanish clause of a mixed sentence.
  const mixed = 'Spanish-language help: Llame al 311 para ayuda.';
  deepEq(languageRuns(mixed).map((r) => mixed.slice(r.from, r.to)), ['Llame al 311 para ayuda'], 'the English lead-in is not marked');
  for (const english of [
    'Contact Maria de la Cruz at the Los Angeles office.', // name particles and place names
    'Van der Berg and De la Fuente both signed the petition.',
    'The café served a fine résumé of the week.', // borrowed words
    'Por favor, sign in at the front desk.', // a two-word phrase
    'Thanks to 唯然 and Сергей Иванов for their contributions.', // names in other alphabets
    'ChALkeR - Сковорода Никита Андреевич <chalkerx@gmail.com>', // a full Russian name
    'ak239 - Aleksei Koziatinskii <ak239spb@gmail.com>', // "ak" is Creole for "and"; an email is nobody's words
    'Smith et al. found the same result, e.g. in 2019.',
    'Non-profit and non-commercial use is allowed under the MIT license.',
    'Smith et al., Jones et al., and Brown et al. agree.', // a citation chain
    'See para. 2 and para. 3 of the lease.',
    'The annual water quality report is available at the front desk.',
  ]) deepEq(languageRuns(english), [], `quiet on "${english}"`);
  // A sentence never joins a Spanish neighbour on one Spanish-looking name.
  const la = 'Llame al 311 para ayuda. Los Angeles County provides free meals.';
  deepEq(languageRuns(la).map((r) => la.slice(r.from, r.to)), ['Llame al 311 para ayuda'], 'the English sentence stays English');
  // Two languages scoring alike: flag it, but don't guess which.
  deepEq(languageRuns('que para por se está gratuitos').map((r) => r.lang), ['unknown'], 'Spanish/Portuguese tie is unknown');
});

check('languageRuns reads the other alphabets: named when one language uses it, flagged when several do', () => {
  const { languageRuns, alphabetLanguages, LANGUAGES } = mod.textHelpers;
  const OTHER_ALPHABETS = {
    uk: 'УВАГА! Якщо ви розмовляєте українською мовою, ви можете звернутися до безкоштовної служби мовної підтримки.',
    ur: 'خبردار: اگر آپ اردو بولتے ہیں، تو آپ کو زبان کی مدد کی خدمات مفت میں دستیاب ہیں۔',
    he: 'שימו לב: אם אתם מדברים עברית, שירותי סיוע בשפה זמינים עבורכם ללא תשלום.',
    el: 'ΠΡΟΣΟΧΗ: Αν μιλάτε ελληνικά, στη διάθεσή σας βρίσκονται υπηρεσίες γλωσσικής υποστήριξης, οι οποίες παρέχονται δωρεάν.',
    hy: 'ՈՒՇԱԴՐՈՒԹՅՈՒՆ՝ Եթե խոսում եք հայերեն, ապա ձեզ անվճար կարող են տրամադրվել լեզվական աջակցության ծառայություններ:',
    ka: 'ყურადღება: თუ ქართულად საუბრობთ, ენობრივი დახმარების მომსახურება უფასოდ ხელმისაწვდომია.',
    bn: 'লক্ষ্য করুন: যদি আপনি বাংলায় কথা বলেন, তাহলে বিনামূল্যে ভাষা সহায়তা পরিষেবা আপনার জন্য উপলব্ধ আছে।',
    pa: 'ਧਿਆਨ ਦਿਓ: ਜੇ ਤੁਸੀਂ ਪੰਜਾਬੀ ਬੋਲਦੇ ਹੋ, ਤਾਂ ਭਾਸ਼ਾ ਵਿੱਚ ਸਹਾਇਤਾ ਸੇਵਾ ਤੁਹਾਡੇ ਲਈ ਮੁਫਤ ਉਪਲਬਧ ਹੈ।',
    gu: 'સુચના: જો તમે ગુજરાતી બોલતા હો, તો મફત ભાષા સહાય સેવાઓ તમારા માટે ઉપલબ્ધ છે.',
    ta: 'கவனிக்கவும்: நீங்கள் தமிழ் பேசுபவராக இருந்தால், உங்களுக்கு மொழி உதவி சேவைகள் இலவசமாக கிடைக்கின்றன.',
    te: 'శ్రద్ధ పెట్టండి: ఒకవేళ మీరు తెలుగు భాష మాట్లాడుతున్నట్లయితే, మీ కొరకు భాషా సహాయ సేవలు ఉచితంగా లభిస్తాయి.',
    kn: 'ಗಮನಿಸಿ: ನೀವು ಕನ್ನಡ ಮಾತನಾಡುತ್ತಿದ್ದರೆ, ನಿಮಗೆ ಉಚಿತ ಭಾಷಾ ಸಹಾಯ ಸೇವೆಗಳು ಲಭ್ಯವಿವೆ.',
    ml: 'ശ്രദ്ധിക്കുക: നിങ്ങൾ മലയാളം സംസാരിക്കുന്നുവെങ്കിൽ, സൗജന്യ ഭാഷാ സഹായ സേവനങ്ങൾ ലഭ്യമാണ്.',
    th: 'เรียน: ถ้าคุณพูดภาษาไทยคุณสามารถใช้บริการช่วยเหลือทางภาษาได้ฟรี',
    lo: 'ໂປດຊາບ: ຖ້າວ່າ ທ່ານເວົ້າພາສາ ລາວ, ການບໍລິການຊ່ວຍເຫຼືອດ້ານພາສາ, ໂດຍບໍ່ເສັຽຄ່າ, ແມ່ນມີພ້ອມໃຫ້ທ່ານ.',
    km: 'ប្រយ័ត្ន៖ បើសិនជាអ្នកនិយាយ ភាសាខ្មែរ, សេវាជំនួយផ្នែកភាសា ដោយមិនគិតឈ្នួល គឺអាចមានសំរាប់បំរើអ្នក។',
    my: 'သတိပြုရန် - အကယ်၍ သင်သည် မြန်မာစကား ကို ပြောပါက၊ ဘာသာစကား အကူအညီ၊ အခမဲ့၊ သင့်အတွက် စီစဉ်ဆောင်ရွက်ပေးပါမည်။',
  };
  // One alphabet, several languages: flagged, not named.
  const SHARED_ALPHABETS = {
    hi: 'ध्यान दें: यदि आप हिंदी बोलते हैं तो आपके लिए मुफ्त में भाषा सहायता सेवाएं उपलब्ध हैं।',
    am: 'ማስታወሻ: የሚናገሩት ቋንቋ ኣማርኛ ከሆነ የትርጉም እርዳታ ድርጅቶች፣ በነጻ ሊያግዝዎት ተዘጋጀተዋል።',
    si: 'අවධානය: ඔබ සිංහල භාෂාව කතා කරන්නේ නම්, ඔබට භාෂා සහාය සේවා නොමිලේ ලබා ගත හැකිය.', // Sinhala: an alphabet not listed
  };
  const NAMES = ['علی‌رضا محمدی', 'Thanks to יוסי כהן for the review.', 'יוסי כהן', 'Γιώργος Παπαδόπουλος Νικολάου', 'राहुल शर्मा', 'สมชาย ใจดี', 'Արամ Խաչատրյան'];
  for (const [code, sample] of Object.entries(OTHER_ALPHABETS)) {
    deepEq(languageRuns(sample).map((r) => r.lang), [code], `${code}: named`);
  }
  // Devanagari (Hindi, Marathi, Nepali), Ethiopic (Amharic, Tigrinya), and an
  // alphabet not listed at all (Sinhala): flagged, but no guess to apply.
  for (const [code, sample] of Object.entries(SHARED_ALPHABETS)) {
    deepEq(languageRuns(sample).map((r) => r.lang), ['unknown'], `${code}: flagged without a name`);
  }
  // Every menu language is either named by the detector or shares an alphabet.
  const named = new Set(['es', 'zh', 'vi', 'ko', 'tl', 'ru', 'ar', 'ht', 'fr', 'pl', 'pt', 'it', 'de', 'ja', 'fa', ...Object.keys(OTHER_ALPHABETS)]);
  deepEq(LANGUAGES.map((l) => l.code).filter((c) => !named.has(c)).sort(), ['am', 'hi', 'mr', 'ne', 'ti'], 'the rest share Devanagari or Ethiopic');
  // A name's worth of any alphabet stays quiet: uncased ones by word count,
  // cased ones because a name has no lower-case word, unspaced ones by length.
  for (const name of NAMES) deepEq(languageRuns(name), [], `quiet on the name "${name}"`);
  // A borrowed word in an English sentence: its vowel signs are marks, not letters.
  for (const english of ['नमस्ते means hello in Hindi.', 'Say धन्यवाद to the volunteers.', 'The word สวัสดี is a greeting.']) {
    deepEq(languageRuns(english), [], `quiet on "${english}"`);
  }
  deepEq([...alphabetLanguages('שלום עולם')], ['he', 'yi'], 'the languages of an alphabet');
  eq(alphabetLanguages('Hello there'), null, 'Latin text could be any Latin-alphabet language');
  deepEq([...alphabetLanguages('අවධානය ඔබ සිංහල')], [], 'an alphabet not listed trusts no language');
  // Named only when the letters show which: Apply writes the name.
  for (const [what, sample] of [
    ['Bulgarian', 'ВНИМАНИЕ: Ако говорите български, можете да получите безплатна езикова помощ.'],
    ['Serbian', 'ПАЖЊА: Ако говорите српски, услуге језичке помоћи доступне су вам бесплатно.'],
    ['Pashto', 'پاملرنه: که تاسو پښتو خبرې کوئ، د ژبې د مرستې خدمتونه تاسو ته وړیا شتون لري.'],
  ]) deepEq(languageRuns(sample).map((r) => r.lang), ['unknown'], `${what} is flagged, not called Russian or Persian`);
});

check('language-of-parts: prose-gated Needs-your-call with a fix; marked text is never flagged', () => {
  const LANG = (lang) => [M.lang.create({ lang })];
  const found = (d) => mod.check.checkDocument(d, { prose: true }).filter((f) => f.id.startsWith('language-of-parts'));
  const d = doc(para('Spanish-language help: Llame al 311 para ayuda.'));
  const [f] = found(d);
  eq(f.severity, 'manual', 'a guess, so the author decides');
  eq(f.criterion, '3.1.2 Language of Parts', 'criterion');
  eq(f.title, 'Text may be in Spanish but isn’t marked', 'title names the language');
  deepEq(f.fix, { kind: 'lang', lang: 'es' }, 'one-click fix');
  eq(f.suggestion, 'Spanish', 'the card says what Apply does');
  eq(d.textBetween(f.from, f.to), 'Llame al 311 para ayuda', 'range is the Spanish only');
  eq(mod.check.checkDocument(d, { prose: false }).filter((x) => x.id.startsWith('language-of-parts')).length, 0, 'prose-gated');
  // Apply = addMark over the range: the next full run is quiet.
  const applied = d.type.schema.nodes.doc.create(null, [
    para('Spanish-language help: ', text('Llame al 311 para ayuda', LANG('es')), '.'),
  ]);
  eq(found(applied).length, 0, 'marked text is not flagged');
  // Any language tag counts as marked: the author's call stands.
  eq(found(doc(para(text('Llame al 311 para ayuda.', LANG('es-MX'))))).length, 0, 'regional tag counts');
  // Partly marked: only the unmarked Spanish is left to judge.
  const partial = doc(para(text('Si necesita ayuda, llame al 311. ', LANG('es')), 'Para información en español, llame al 311.'));
  const [rest] = found(partial);
  eq(partial.textBetween(rest.from, rest.to), 'Para información en español, llame al 311', 'only the unmarked sentence');
  // A tie gets no fix: the toolbar is the way.
  const [tie] = found(doc(para('que para por se está gratuitos')));
  eq(tie.title, 'Text may be in another language but isn’t marked', 'unknown language title');
  eq(tie.fix, undefined, 'no guessed fix');
  // Headings are read too, and an English heading is not.
  const headed = doc(heading(2, 'Ayuda en español para residentes'), heading(2, 'Help for residents'), para('Contact us.'));
  const [h] = found(headed);
  eq(found(headed).length, 1, 'one heading flagged');
  eq(headed.textBetween(h.from, h.to), 'Ayuda en español para residentes', 'the Spanish heading');
  deepEq(h.fix, { kind: 'lang', lang: 'es' }, 'with its fix');
  eq(found(doc(N.heading.create({ level: 2 }, text('Ayuda en español para residentes', LANG('es'))))).length, 0, 'a marked heading is quiet');
});

check('lang mark: paste keeps a language, the export writes it, Clear formatting leaves it', () => {
  const { DOMParser: PMDOMParser } = mod.pm;
  const parse = (html) => PMDOMParser.fromSchema(schema).parse(parseHTML(`<!doctype html><html><body>${html}</body></html>`).document.body);
  // What a paste leaves: the parse, then transformPasted's withoutPageLanguage on each text node.
  const { withoutPageLanguage } = mod;
  const langsIn = (d) => { const out = []; d.descendants((n) => { if (!n.isText) return; const m = M.lang.isInSet(withoutPageLanguage(n).marks); out.push(`${n.text}=${m ? m.attrs.lang : '-'}`); }); return out.filter((x) => !x.endsWith('=-')); };
  deepEq(langsIn(parse('<p>Say <span lang="fr">bonjour à tous</span>.</p>')), ['bonjour à tous=fr'], 'span lang');
  const block = parse('<p lang="es">Llame al 311.</p>');
  eq(block.firstChild.type.name, 'paragraph', '<p lang> stays a paragraph');
  deepEq(langsIn(block), ['Llame al 311.=es'], 'and stays Spanish');
  deepEq(langsIn(parse('<p><span lang="en-US">English</span> and <span lang="x&lt;y">junk</span> and <span lang="eng">eng</span> <span lang="und">und</span></p>')), [], 'English (en, eng), undetermined and malformed tags are no mark');
  // English inside Spanish ends the Spanish: it must not be read with a Spanish voice.
  deepEq(langsIn(parse('<p lang="es">Hola <span lang="en">hello there</span> amigos</p>')), ['Hola =es', ' amigos=es'], 'nested English is not Spanish');
  deepEq(langsIn(parse('<p><a href="https://x.org" lang="es"><b>ayuda</b></a></p>')), ['ayuda=es'], 'lang on a link element');
  // Export: the schema's toDOM is the export mapping; a tampered stored tag is dropped.
  const html = mod.exportHtml.exportHtml(doc(para('Help: ', text('Llame al 311', [M.lang.create({ lang: 'es' })]), ' ', text('x', [M.lang.create({ lang: '"><script>' })]))),
    { title: 't', header: '', footer: '' }, parseHTML('<!doctype html><html><head><title></title></head><body></body></html>').document);
  const page = parseHTML(html).document;
  eq(page.documentElement.getAttribute('lang'), 'en', 'page stays English');
  eq(page.querySelector('main span[lang="es"]')?.textContent, 'Llame al 311', 'passage exported with its lang');
  eq(page.querySelectorAll('main [lang]').length, 1, 'an invalid stored tag is not written');
  // Clear formatting is formatting only.
  const { EditorState, TextSelection } = mod.pmState;
  const { clearFormatting, formatState } = mod.editorCommands;
  let state = EditorState.create({ doc: doc(para(text('Llame al 311', [M.lang.create({ lang: 'es' }), M.strong.create()]))) });
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 13)));
  eq(formatState(state).lang, 'es', 'toolbar reads the language');
  clearFormatting(state, (tr) => { state = state.apply(tr); });
  deepEq(langsIn(state.doc), ['Llame al 311=es'], 'language survives, bold does not');
  eq(formatState(state).bold, false, 'bold cleared');
  // A stored document is unvalidated JSON: a non-string tag must not reach languageName.
  const tampered = EditorState.create({ doc: schema.nodeFromJSON({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'lang', attrs: { lang: 5 } }] }] }] }) });
  eq(formatState(tampered.apply(tampered.tr.setSelection(TextSelection.create(tampered.doc, 1, 2)))).lang, '', 'a non-string tag reads as none');
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
    // A map done the G74 way: short alt that points to the details beside it.
    figure('img-1', 'A map of the garden plots, described below', 'garden map'),
    para('The entrance is on Elm Street. Bring your own gloves. Water and compost are provided at the shed near the entrance.'),
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
  // +1 manual: "Llame al 311 para ayuda" is Spanish, unmarked (3.1.2).
  expect('shelter-faq', { blocker: 1, violation: 1, advisory: 1, manual: 1 });
  // violation 2: the generic "learn more" link and the Gray-on-Blue-highlight contrast run.
  // manual 1: the form's two typed blanks, asked about once (form-blank).
  expect('benefits-guide', { violation: 2, advisory: 1, manual: 1 });
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

check('the health-advisory seed asks about its map, not its alt wording', () => {
  // Its manual count is the same as when the alt was a terse "map", so pin which question it is.
  const stored = mod.store.loadDoc('health-advisory');
  const ids = checkDocument(mod.store.docFromJSON(stored.content), { prose: true }).map((f) => f.id);
  assert(ids.includes('img-long-description:img-1'), 'long-description question fires');
  assert(!ids.some((id) => id.startsWith('img-alt-suspicious')), 'the alt itself is not questioned');
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
  eq(imageIdFloor(doc(para('x')), ['img-long-description:img-9']), 9, 'a dismissed long-description question raises it too');
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
  // The page pins what the contrast rule judges against, rather than trusting browser defaults.
  for (const rule of ['color: #000000', 'background: #ffffff', 'a, a:visited { color: #0000ee; }', 'h2 { font-size: 24px; font-weight: bold; }']) {
    assert(html.includes(rule), `export stylesheet pins ${rule}`);
  }
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
  // 1.4.1 (questions only) no longer appear at all. 1.4.3 is benefits-guide's
  // one contrast violation.
  deepEq(criteria, [
    { id: '2.4.4', name: 'Link Purpose (In Context)', count: 4 },
    { id: '1.1.1', name: 'Non-text Content', count: 3 },
    { id: '1.3.1', name: 'Info and Relationships', count: 2 },
    { id: '1.4.3', name: 'Contrast (Minimum)', count: 1 },
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

await acheck('import: Word colours and sizes arrive as marks, so contrast is checked on imported files', async () => {
  const r = await importDocx(docx({
    body: [
      P(R('grey on white', '<w:color w:val="999999"/>')),
      P(R('on light gray highlight', '<w:color w:val="767676"/><w:highlight w:val="lightGray"/>')),
      P(R('shaded', '<w:shd w:val="clear" w:color="auto" w:fill="CCE0FF"/><w:color w:val="5E6C84"/>')),
      P(R('big grey', '<w:color w:val="888888"/><w:sz w:val="48"/>')),
      P(R('small grey', '<w:color w:val="888888"/><w:sz w:val="22"/>')),
      P(R('automatic', '<w:color w:val="auto"/><w:highlight w:val="none"/>')),
    ].join(''),
  }), 'x.docx', parseXml);
  const marksOf = (i) => r.content.child(i).firstChild.marks.map((m) => `${m.type.name}${m.attrs.color ? `=${m.attrs.color}` : ''}${m.attrs.size ? `=${m.attrs.size}` : ''}`).sort();
  deepEq(marksOf(0), ['textColor=#999999'], 'w:color');
  deepEq(marksOf(1), ['highlight=#c0c0c0', 'textColor=#767676'], 'w:highlight via Word\'s palette');
  deepEq(marksOf(2), ['highlight=#cce0ff', 'textColor=#5e6c84'], 'w:shd fill as background');
  deepEq(marksOf(3), ['fontSize=32', 'textColor=#888888'], 'w:sz half-points to px (24pt = 32px)');
  deepEq(marksOf(4), ['fontSize=14.67', 'textColor=#888888'], '11pt = 14.67px');
  deepEq(marksOf(5), [], '"auto" and "none" add nothing');
  const flagged = mod.check.checkDocument(r.content, { prose: false }).filter((f) => f.id.startsWith('contrast-minimum')).map((f) => f.id);
  // #999999 is 2.85:1; #767676 on Word's lightGray 2.50:1; the shaded pair 3.96:1.
  // #888888 is 3.54:1: it passes at 24pt (large text, 3:1) and fails at 11pt.
  deepEq(flagged, ['contrast-minimum:grey on white|#999999 on #ffffff', 'contrast-minimum:on light gray highlight|#767676 on #c0c0c0',
    'contrast-minimum:shaded|#5e6c84 on #cce0ff', 'contrast-minimum:small grey|#888888 on #ffffff'], 'size decides for #888888');
});

await acheck('import: Word run languages arrive as lang marks, by the characters in the run', async () => {
  const L = (attrs) => `<w:lang ${attrs}/>`;
  const r = await importDocx(docx({
    body: [
      P(R('Llame al 311 para ayuda', L('w:val="es-ES"'))),
      P(R('English text', L('w:val="en-US" w:eastAsia="zh-CN" w:bidi="ar-SA"'))),
      P(R('中文服务', L('w:val="en-US" w:eastAsia="zh-CN"'))),
      P(R('خدمات', L('w:val="en-US" w:bidi="ar-SA"'))),
      P(R('junk', L('w:val="x&lt;y"'))),
      P(R('no language')),
      P(R('שלום לכולם', L('w:val="en-US" w:bidi="ar-SA"'))),
      P(R('สวัสดีครับ', L('w:val="en-US" w:bidi="th-TH"'))),
      P(R('Привет всем', L('w:val="ru-RU"'))),
      P(R('Llamar', L('w:val="en-US" w:eastAsia="ja-JP" w:bidi="he-IL"'))),
      P(R('අවධානය ඔබ සිංහල', L('w:val="es-ES" w:bidi="si-LK"'))),
      P(R('අවධානය ඔබ සිංහල', L('w:val="es-ES" w:bidi="ar-SA"'))),
    ].join(''),
  }), 'x.docx', parseXml);
  const langOf = (i) => M.lang.isInSet(r.content.child(i).firstChild.marks)?.attrs.lang ?? null;
  eq(langOf(0), 'es-ES', 'w:val');
  eq(langOf(1), null, 'English is the page language (Word writes en-US on nearly every run)');
  eq(langOf(2), 'zh-CN', 'East Asian characters read w:eastAsia');
  eq(langOf(3), 'ar-SA', 'right-to-left characters read w:bidi');
  eq(langOf(4), null, 'a malformed tag is dropped');
  eq(langOf(5), null, 'no w:lang, no mark');
  eq(langOf(6), null, 'Hebrew text is never marked with Word\'s default "ar-SA"');
  eq(langOf(7), 'th-TH', 'Thai reads whichever attribute holds a Thai tag');
  eq(langOf(8), 'ru-RU', 'Cyrillic in w:val');
  eq(langOf(9), null, 'Latin text reads w:val only');
  eq(langOf(10), 'si-LK', 'an alphabet the detector doesn\'t list keeps Word\'s complex-script tag, not w:val\'s Spanish');
  eq(langOf(11), null, 'but never a tag for a language of another alphabet');
  const flagged = mod.check.checkDocument(r.content, { prose: true }).filter((f) => f.id.startsWith('language-of-parts'));
  // Word's Spanish arrives marked, so it isn't flagged; the second Sinhala run
  // took no tag, so it arrives unmarked and is (the only one long enough to be).
  deepEq(flagged.map((f) => f.excerpt), ['අවධානය ඔබ සිංහල'], 'only the untagged alphabet is flagged');
});

await acheck('import (review regressions): colours arrive with the background they sit on, never invisible', async () => {
  const cell = (fill, runs) => `<w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/></w:tcPr>${P(runs)}</w:tc>`;
  const r = await importDocx(docx({
    body: [
      // White text in a dark table header cell: readable in Word, must stay readable.
      `<w:tbl><w:tr>${cell('1F3864', R('Header', '<w:color w:val="FFFFFF"/>'))}</w:tr></w:tbl>`,
      // Automatic colour on dark paragraph shading is drawn white by Word.
      P(R('auto on dark'), '<w:shd w:val="clear" w:color="auto" w:fill="1F3864"/>'),
      // A solid pattern shows its pattern colour, not its fill.
      P(R('solid', '<w:color w:val="FFFFFF"/><w:shd w:val="solid" w:color="000000" w:fill="FFFFFF"/>')),
      // A blended pattern can't be resolved: no colours at all rather than white on white.
      P(R('pattern', '<w:color w:val="FFFFFF"/><w:shd w:val="pct25" w:color="000000" w:fill="1F3864"/>')),
    ].join(''),
  }), 'x.docx', parseXml);
  const marks = (i) => r.content.child(i).firstChild.marks.map((m) => `${m.type.name}=${m.attrs.color}`).sort();
  deepEq(marks(0), ['highlight=#1f3864', 'textColor=#ffffff'], 'cell fill kept behind the white text');
  deepEq(marks(1), ['highlight=#1f3864', 'textColor=#ffffff'], 'automatic text resolved to white on dark');
  deepEq(marks(2), ['highlight=#000000', 'textColor=#ffffff'], 'solid shading shows its pattern colour');
  deepEq(marks(3), [], 'an unresolvable pattern imports no colours');
  eq(mod.check.checkDocument(r.content, { prose: false }).filter((f) => f.id.startsWith('contrast-minimum')).length, 0, 'nothing readable in Word is flagged');
});

await acheck('import: Word form fields keep their check boxes and are named in the notes', async () => {
  const W14 = 'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"';
  const field = (ffData, instr, result = '') => `<w:r><w:fldChar w:fldCharType="begin"><w:ffData>${ffData}</w:ffData></w:fldChar></w:r>`
    + `<w:r><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r>`
    + (result ? `<w:r><w:fldChar w:fldCharType="separate"/></w:r>${result}` : '') + '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
  const box = (inner) => field(`<w:name w:val="Check"/><w:checkBox><w:sizeAuto/>${inner}</w:checkBox>`, 'FORMCHECKBOX');
  const r = await importDocx(docx({
    body: [
      P(box('<w:default w:val="0"/>') + R(' Unchecked')),
      P(box('<w:default w:val="0"/><w:checked/>') + R(' Checked by w:checked')),
      P(box('<w:default w:val="1"/>') + R(' Checked by default')),
      P(field('<w:checkBox><w:default w:val="0"/></w:checkBox>', 'FORMCHECKBOX', R('X')) + R(' Result written by the producer')),
      P(R('Name: ') + field('<w:textInput/>', 'FORMTEXT', R('\u2002'.repeat(5)))),
      P(field('<w:ddList><w:listEntry w:val="Red"/></w:ddList>', 'FORMDROPDOWN', R('Red'))),
      P('<w:r><w:sym w:font="Wingdings" w:char="F06F"/><w:t xml:space="preserve"> Typed Wingdings box</w:t></w:r>'),
      P(`<w:sdt ${W14}><w:sdtPr><w14:checkbox><w14:checked w14:val="0"/></w14:checkbox></w:sdtPr><w:sdtContent>${R('\u2610')}</w:sdtContent></w:sdt>` + R(' Content-control box')),
      P(`<w:sdt><w:sdtPr><w:text/><w:showingPlcHdr/></w:sdtPr><w:sdtContent>${R('Click or tap here to enter text.')}</w:sdtContent></w:sdt>`),
      // Review regressions: exact symbol fonts, both w:char spellings; a cover-page
      // property control; a field ending in a hidden run; an underlined tab.
      P('<w:r><w:sym w:font="Wingdings" w:char="F071"/><w:sym w:font="Wingdings" w:char="6F"/><w:sym w:font="Wingdings 2" w:char="52"/><w:sym w:font="Wingdings 3" w:char="F0FE"/><w:t>!</w:t></w:r>'),
      P(`<w:sdt><w:sdtPr><w:dataBinding w:xpath="/ns1:coreProperties[1]/ns0:title[1]"/><w:text/></w:sdtPr><w:sdtContent>${R('Annual report')}</w:sdtContent></w:sdt>`),
      P('<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:rPr><w:vanish/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>' + R('After a hidden field end')),
      P(R('Signature:') + '<w:r><w:rPr><w:u w:val="single"/></w:rPr><w:tab/></w:r>'),
      P(R('Visible') + '<w:r><w:rPr><w:vanish/></w:rPr><mc:AlternateContent><mc:Choice Requires="wps"><w:t>hidden choice</w:t></mc:Choice></mc:AlternateContent></w:r>'),
    ].join(''),
  }), 'form.docx', parseXml);
  const line = (i) => r.content.child(i).textContent;
  eq(line(0), '\u2610 Unchecked', 'an unchecked legacy check box no longer vanishes');
  eq(line(1), '\u2612 Checked by w:checked', 'w:checked wins');
  eq(line(2), '\u2612 Checked by default', 'w:default when never changed');
  eq(line(3), 'X Result written by the producer', 'no second glyph when the field wrote its own result');
  eq(line(6), '\u2610 Typed Wingdings box', 'a Wingdings box survives the private-use filter');
  eq(line(7), '\u2610 Content-control box', 'a content-control box keeps its glyph');
  eq(line(8), 'Click or tap here to enter text.', 'placeholder text is what a screen reader announces, so it is kept');
  eq(line(9), '\u2751\u2610\u2611!', 'Wingdings q and o (with or without F0), Wingdings 2 R; a Wingdings 3 arrow is not a box');
  eq(line(10), 'Annual report', 'a bound cover-page control keeps its text');
  eq(line(11), 'After a hidden field end', 'a field ending in a hidden run does not swallow what follows');
  eq(line(12), 'Signature:\t', 'an underlined tab stays a tab');
  eq(line(13), 'Visible', 'hidden text inside AlternateContent stays hidden');
  const nameField = r.content.child(4).lastChild;
  assert(nameField.text === '\u2002'.repeat(5) && nameField.marks.some((m) => m.type.name === 'underline'), 'an empty text field imports as an underlined line');
  assert(r.notes.includes('8 Word form fields imported as plain text; they are not fillable here.'), `bound controls are not counted: ${JSON.stringify(r.notes)}`);
  const found = mod.check.checkDocument(r.content, { prose: false }).filter((f) => f.id.startsWith('form-blank'));
  eq(found.length, 1, 'one question for the form');
  // ☐ (legacy box), the empty text field, ☐ (Wingdings), ☐ (content control),
  // ❑ and ☐ (typed Wingdings, adjacent: one blank), the signature tab. Checked boxes don't count.
  eq(found[0].title, 'Document has 6 fill-in blanks', 'every empty box and line, checked boxes excluded');
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
  // An h2 with no h1: document-no-h1 is 2.4.10, which is AAA, so it is not an AA failure either.
  const noH1 = doc(heading(2, 'Section'), para('Body.'));
  mockStorage(JSON.stringify([storedDocJSON('q', { content: questionsOnly.toJSON() }), storedDocJSON('f', { content: failing.toJSON() }), storedDocJSON('h', { content: noH1.toJSON() })]));
  try {
    const { criteria, docs } = store.loadDashboardData();
    const q = docs.find((d) => d.id === 'q');
    eq(docs.find((d) => d.id === 'h').counts.advisory, 1, 'the no-h1 fixture really produces its advisory');
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
