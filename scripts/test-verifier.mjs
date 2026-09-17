#!/usr/bin/env node
/**
 * Tests for the verifier.
 *
 * Principle 4 says constraints are enforced by code rather than documentation.
 * That principle applies to the enforcer: a verifier that silently stops
 * verifying is worse than none, because it produces a passing build and a false
 * sense of safety. These tests assert it still rejects each thing it must.
 *
 *   node scripts/test-verifier.mjs
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { contrast, simulate, deltaE } from './verify-tokens.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOKENS = resolve(HERE, '../design-system/tokens.json');
const BACKUP = resolve(HERE, '../design-system/.tokens.backup.json');
const VERIFY = resolve(HERE, 'verify-tokens.mjs');

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

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const close = (actual, expected, tol = 0.01) =>
  assert(Math.abs(actual - expected) <= tol, `expected ~${expected}, got ${actual.toFixed(4)}`);

/** Run the verifier against the current tokens.json; return its exit code. */
const runVerifier = () => {
  try {
    execFileSync('node', [VERIFY], { stdio: 'pipe' });
    return 0;
  } catch (error) {
    return error.status ?? 1;
  }
};

/** Mutate tokens.json, assert the verifier rejects it, then restore. */
const rejects = (name, mutate) =>
  check(name, () => {
    copyFileSync(TOKENS, BACKUP);
    try {
      const doc = JSON.parse(readFileSync(TOKENS, 'utf8'));
      mutate(doc);
      writeFileSync(TOKENS, JSON.stringify(doc, null, 2));
      assert(runVerifier() !== 0, 'verifier accepted tokens it should have rejected');
    } finally {
      copyFileSync(BACKUP, TOKENS);
      rmSync(BACKUP, { force: true });
    }
  });

console.log('Verifier tests\n');

/* ---------- the colour maths itself ---------- */

check('contrast: white on black is 21:1', () => close(contrast('#FFFFFF', '#000000'), 21));
check('contrast: identical colours are 1:1', () => close(contrast('#1F5EA8', '#1F5EA8'), 1));
check('contrast: is symmetric', () =>
  close(contrast('#B3261E', '#FFFFFF'), contrast('#FFFFFF', '#B3261E')));
check("contrast: Grammarly's #15C39A on white is 2.26:1", () =>
  close(contrast('#15C39A', '#FFFFFF'), 2.26));
check('contrast: accepts shorthand hex', () => close(contrast('#FFF', '#000'), 21));
// This test previously used `contrast` and failed — correctly. It exposed that
// WCAG contrast cannot measure hue, which had invalidated the whole CVD check.
// Kept, now asserting the property that actually matters.
check('deltaE: red and green are far apart normally, close under deuteranopia', () => {
  const normal = deltaE('#B3261E', '#1B6B4A');
  const cvd = deltaE(simulate('#B3261E', 'deuteranopia'), simulate('#1B6B4A', 'deuteranopia'));
  assert(normal > 30, `red/green should be far apart normally, got dE ${normal.toFixed(1)}`);
  assert(cvd < normal / 2, `deuteranopia should collapse red/green, got dE ${cvd.toFixed(1)}`);
});

check('deltaE: contrast cannot substitute for it (the bug this suite caught)', () => {
  // Pure red vs pure green: obviously different, yet contrast scores it low.
  assert(contrast('#FF0000', '#00FF00') < 3, 'expected contrast to under-report hue difference');
  assert(deltaE('#FF0000', '#00FF00') > 50, 'expected deltaE to report a large difference');
});

check('deltaE: identical colours are 0, white/black is ~100', () => {
  close(deltaE('#1F5EA8', '#1F5EA8'), 0, 0.001);
  close(deltaE('#FFFFFF', '#000000'), 100, 0.5);
});

check('rejects a palette whose severities match in NORMAL vision', () => {
  copyFileSync(TOKENS, BACKUP);
  try {
    const doc = JSON.parse(readFileSync(TOKENS, 'utf8'));
    // Two severities set to near-identical colours that both still pass contrast.
    doc.primitive.violet['600'].$value = '#1F5FA8';
    writeFileSync(TOKENS, JSON.stringify(doc, null, 2));
    assert(runVerifier() !== 0, 'verifier accepted two severities that are the same colour');
  } finally {
    copyFileSync(BACKUP, TOKENS);
    rmSync(BACKUP, { force: true });
  }
});
check('simulate: returns a parseable hex', () =>
  assert(/^#[0-9A-F]{6}$/.test(simulate('#1F5EA8', 'protanopia')), 'malformed output'));

check('simulate: severity 0 is a no-op (identity transform)', () => {
  close(deltaE('#B3261E', simulate('#B3261E', 'deuteranopia', 0)), 0, 0.5);
});

check('simulate: severity is monotonic — more deficiency, more distortion', () => {
  const mild = deltaE('#B3261E', simulate('#B3261E', 'deuteranopia', 0.4));
  const full = deltaE('#B3261E', simulate('#B3261E', 'deuteranopia', 1));
  assert(full > mild, `expected full dichromacy to distort more (mild ${mild.toFixed(1)}, full ${full.toFixed(1)})`);
});

check('simulate: white is preserved under every deficiency', () => {
  for (const kind of ['deuteranopia', 'protanopia', 'tritanopia']) {
    close(deltaE('#FFFFFF', simulate('#FFFFFF', kind)), 0, 1.0);
  }
});

check('simulate: rejects an unknown deficiency rather than silently passing through', () => {
  let threw = false;
  try { simulate('#B3261E', 'not-a-deficiency'); } catch { threw = true; }
  assert(threw, 'unknown deficiency should throw');
});

check('rejects a translucent token with no declared backdrop', () => {
  copyFileSync(TOKENS, BACKUP);
  try {
    const doc = JSON.parse(readFileSync(TOKENS, 'utf8'));
    doc.semantic.light.surface.overlay = { $type: 'color', $value: 'rgba(0,0,0,0.6)' };
    writeFileSync(TOKENS, JSON.stringify(doc, null, 2));
    assert(runVerifier() !== 0, 'verifier accepted a translucent token with no backdrop');
  } finally {
    copyFileSync(BACKUP, TOKENS);
    rmSync(BACKUP, { force: true });
  }
});

/* ---------- the guarantees ---------- */

check('baseline: the committed tokens pass', () =>
  assert(runVerifier() === 0, 'committed tokens.json does not pass its own verifier'));

rejects('rejects a foreground below its declared contrast minimum', (doc) => {
  doc.semantic.light.text.primary.$value = '#BBBBBB';
});

rejects("rejects Grammarly's brand green as a severity colour", (doc) => {
  doc.semantic.light.severity.advisory.fg.$value = '#15C39A';
});

rejects('rejects a severity that drops to one non-colour channel', (doc) => {
  doc.encoding.blocker.underline = 'none';
  delete doc.encoding.blocker.glyph;
});

rejects('rejects an unresolvable token reference', (doc) => {
  doc.semantic.light.text.primary.$value = '{primitive.neutral.does-not-exist}';
});

rejects('rejects a contrast assertion pointing at a missing token', (doc) => {
  doc.semantic.light.text.primary.$extensions.ada.contrast.against = 'semantic.light.surface.nope';
});

check('rejects a dangling CSS custom property', () => {
  const css = resolve(HERE, '../design-system/tokens.css');
  const original = readFileSync(css, 'utf8');
  try {
    writeFileSync(css, original.replace('var(--ada-focus-ring)', 'var(--ada-focus-ring-nope)'));
    assert(runVerifier() !== 0, 'verifier accepted a dangling var()');
  } finally {
    writeFileSync(css, original);
  }
});

check('--pair exits non-zero for a colour below 3:1', () => {
  let code = 0;
  try {
    execFileSync('node', [VERIFY, '--pair', '#15C39A', '#FFFFFF'], { stdio: 'pipe' });
  } catch (error) {
    code = error.status ?? 1;
  }
  assert(code !== 0, '--pair accepted a 2.26:1 pair');
});

console.log();
if (failures.length) {
  console.error(`FAILED — ${failures.length} of ${passed + failures.length}\n`);
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
console.log(`PASSED — ${passed} tests.`);
