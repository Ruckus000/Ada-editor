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

let mod;
try {
  mod = await import(pathToFileURL(TMP).href);
} finally {
  rmSync(TMP, { force: true });
}

/* ---------- textHelpers ---------- */

const {
  GENERIC_LINK_TEXT,
  COLOUR_WORDS,
  COLOUR_REFERENCE,
  REDUNDANT_ALT_PREFIX,
  syllables,
  gradeLevel,
  splitSentences,
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

check('splitSentences keeps terminators without lookbehind (§9.10)', () => {
  deepEq(splitSentences('A. B! C? D'), ['A.', 'B!', 'C?', 'D'], 'four sentences');
  deepEq(splitSentences('Only one sentence.'), ['Only one sentence.'], 'single sentence');
  deepEq(splitSentences('No terminator here'), ['No terminator here'], 'unterminated text');
  deepEq(splitSentences('A.  B'), ['A.', 'B'], 'multiple spaces after a terminator');
  deepEq(splitSentences(''), [], 'empty string');
  // The lookbehind split the spike used would treat "3.5" mid-text the same way
  // this does: a terminator only splits when whitespace follows it.
  deepEq(splitSentences('Version 3.5 is out. Upgrade now.'), ['Version 3.5 is out.', 'Upgrade now.'], 'decimal points do not split');
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

check('no lookbehind regexes in app/_engine (§9.10, Safari 12)', () => {
  const dir = resolve(ROOT, 'app/_engine');
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.ts')) continue;
    const src = readFileSync(resolve(dir, name), 'utf8');
    assert(!src.includes('(?<'), `${name} contains a lookbehind — it breaks Safari 12 at module parse`);
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
