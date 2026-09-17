#!/usr/bin/env node
/**
 * Ada-editor design token verifier.
 *
 * Grammarly shipped a suggestion UI whose four categories are distinguished by
 * underline colour alone, on a brand colour that measures 2.26:1 against white.
 * Nothing in their pipeline said no. This script is the thing that says no.
 *
 * It fails the build when:
 *   1. any token's declared contrast assertion is not met;
 *   2. any severity relies on fewer than two non-colour channels;
 *   3. a severity pair is indistinguishable under simulated dichromacy AND
 *      has not declared a non-colour channel to fall back on.
 *
 * Usage:
 *   node scripts/verify-tokens.mjs                  verify design-system/tokens.json
 *   node scripts/verify-tokens.mjs --pair #15C39A #FFFFFF   ad-hoc contrast check
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOKENS = resolve(HERE, '../design-system/tokens.json');

/* ---------- colour maths (WCAG 2.x relative luminance) ---------- */

const srgbToLinear = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

const parseHex = (hex) => {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`not a hex colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};

const luminance = (hex) => {
  const [r, g, b] = parseHex(hex).map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrast = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

/* ---------- Vienot (1999) dichromat simulation ---------- */

const encode = (v) => {
  const c = Math.max(0, Math.min(1, v));
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(s * 255).toString(16).padStart(2, '0');
};

export const simulate = (hex, kind) => {
  const [r, g, b] = parseHex(hex).map(srgbToLinear);
  let l = 0.31399 * r + 0.63951 * g + 0.04649 * b;
  let m = 0.15537 * r + 0.75789 * g + 0.08670 * b;
  let s = 0.01775 * r + 0.10945 * g + 0.87247 * b;
  if (kind === 'protanopia') l = 1.05118 * m - 0.05116 * s;
  if (kind === 'deuteranopia') m = 0.9513092 * l + 0.04866992 * s;
  if (kind === 'tritanopia') s = -0.86744736 * l + 1.86727089 * m;
  const R = 5.47221206 * l - 4.64196010 * m + 0.16963708 * s;
  const G = -1.12524190 * l + 2.29317094 * m - 0.16789520 * s;
  const B = 0.02980165 * l - 0.19318073 * m + 1.16364789 * s;
  return `#${encode(R)}${encode(G)}${encode(B)}`.toUpperCase();
};

/* ---------- token graph ---------- */

const getPath = (obj, path) =>
  path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), obj);

const resolveValue = (doc, value, seen = new Set()) => {
  if (typeof value !== 'string') return value;
  const match = value.match(/^\{(.+)\}$/);
  if (!match) return value;
  const ref = match[1];
  if (seen.has(ref)) throw new Error(`circular token reference: ${ref}`);
  seen.add(ref);
  const target = getPath(doc, ref);
  if (!target) throw new Error(`unresolved token reference: {${ref}}`);
  return resolveValue(doc, target.$value, seen);
};

const walkTokens = function* (node, trail = []) {
  if (node && typeof node === 'object') {
    if ('$value' in node) {
      yield { path: trail.join('.'), token: node };
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      if (key.startsWith('$')) continue;
      yield* walkTokens(child, [...trail, key]);
    }
  }
};

/* ---------- checks ---------- */

const failures = [];
const notes = [];
const fail = (msg) => failures.push(msg);

function checkContrastAssertions(doc) {
  for (const { path, token } of walkTokens(doc)) {
    const ada = token.$extensions?.ada;
    if (!ada?.contrast) continue;
    const fg = resolveValue(doc, token.$value);
    // A token may render against more than one background — a severity colour
    // is both an underline on the canvas and badge text on its own tint. Each
    // usage gets its own assertion; missing one is how silent regressions start.
    const assertions = Array.isArray(ada.contrast) ? ada.contrast : [ada.contrast];
    for (const a of assertions) {
      const againstToken = getPath(doc, a.against);
      if (!againstToken) { fail(`${path}: contrast.against "${a.against}" does not resolve`); continue; }
      const bg = resolveValue(doc, againstToken.$value);
      const ratio = contrast(fg, bg);
      const label = a.usage ? `${path} [${a.usage}]` : path;
      const line = `${label.padEnd(46)} ${fg} on ${bg}  ${ratio.toFixed(2)}:1 (min ${a.min})`;
      if (ratio + 1e-9 < a.min) fail(`CONTRAST  ${line}`);
      else notes.push(`  ok  ${line}`);
    }
  }
}

function checkEncodingChannels(doc) {
  const encoding = doc.encoding ?? {};
  for (const [name, spec] of Object.entries(encoding)) {
    if (name.startsWith('$')) continue;
    const nonColour = (spec.channels ?? []).filter((c) => c !== 'colour' && c !== 'color');
    const usable = nonColour.filter((c) => spec[c] && spec[c] !== 'none');
    if (usable.length < 2) {
      fail(`ENCODING  severity "${name}" has ${usable.length} usable non-colour channel(s) (need >= 2). ` +
           `Colour alone is an SC 1.4.1 failure.`);
    } else {
      notes.push(`  ok  severity ${name.padEnd(10)} carried by [${usable.join(', ')}] + colour (redundant)`);
    }
  }
}

function checkDichromatSeparation(doc) {
  const severities = ['blocker', 'violation', 'advisory', 'manual'];
  for (const theme of ['light', 'dark']) {
    const colours = {};
    for (const s of severities) {
      const t = getPath(doc, `semantic.${theme}.severity.${s}.fg`);
      if (t) colours[s] = resolveValue(doc, t.$value);
    }
    for (const kind of ['deuteranopia', 'protanopia']) {
      for (let i = 0; i < severities.length; i++) {
        for (let j = i + 1; j < severities.length; j++) {
          const [a, b] = [severities[i], severities[j]];
          if (!colours[a] || !colours[b]) continue;
          const ratio = contrast(simulate(colours[a], kind), simulate(colours[b], kind));
          if (ratio < 1.5) {
            const chA = (doc.encoding?.[a]?.channels ?? []).filter((c) => c !== 'colour').length;
            const chB = (doc.encoding?.[b]?.channels ?? []).filter((c) => c !== 'colour').length;
            if (chA < 2 || chB < 2) {
              fail(`CVD  ${theme}/${kind}: ${a} vs ${b} = ${ratio.toFixed(2)}:1 and no non-colour fallback`);
            } else {
              notes.push(`  ok  ${theme}/${kind}: ${a} vs ${b} = ${ratio.toFixed(2)}:1 ` +
                         `(indistinguishable by colour, as expected — shape+glyph+label carry it)`);
            }
          }
        }
      }
    }
  }
}

function checkCssVarIntegrity() {
  // Catches the generated CSS referencing a custom property nothing defines —
  // e.g. a renamed token leaving a dangling var(). Silent in the browser,
  // which is exactly why it needs to be loud here.
  const SOURCES = [
    '../design-system/tokens.css',
    '../design-system/tailwind-theme.css',
    '../design-system/primitives/primitives.css',
  ];
  let tokensCss;
  try {
    tokensCss = readFileSync(resolve(HERE, SOURCES[0]), 'utf8');
  } catch {
    notes.push('  --  tokens.css not built yet; skipping var-integrity check');
    return;
  }
  // Only tokens.css may DEFINE an --ada-* custom property.
  const defined = new Set([...tokensCss.matchAll(/^\s*(--ada-[\w-]+)\s*:/gm)].map((m) => m[1]));

  const referenced = new Map();
  for (const rel of SOURCES) {
    let text;
    try { text = readFileSync(resolve(HERE, rel), 'utf8'); } catch { continue; }
    for (const m of text.matchAll(/var\((--ada-[\w-]+)/g)) {
      if (!referenced.has(m[1])) referenced.set(m[1], rel.replace('../', ''));
    }
  }
  for (const [ref, where] of referenced) {
    if (!defined.has(ref)) fail(`CSS-VAR  ${ref} is used in ${where} but never defined in tokens.css`);
  }
  const dangling = [...defined].filter((d) => /^--ada--/.test(d));
  for (const d of dangling) fail(`CSS-VAR  ${d} has a malformed name (double dash)`);
  if (!failures.length) {
    notes.push(`  ok  css vars: ${defined.size} defined in tokens.css, ${referenced.size} referenced across ${SOURCES.length} files, 0 dangling`);
  }
}

/* ---------- entry ---------- */

const argv = process.argv.slice(2);

if (argv[0] === '--pair') {
  const [, fg, bg] = argv;
  const ratio = contrast(fg, bg);
  const verdict = (min) => (ratio >= min ? 'PASS' : 'FAIL');
  console.log(`${fg} on ${bg} = ${ratio.toFixed(2)}:1`);
  console.log(`  text AA  (4.5:1) ${verdict(4.5)}`);
  console.log(`  text AAA (7.0:1) ${verdict(7)}`);
  console.log(`  non-text (3.0:1) ${verdict(3)}`);
  process.exit(ratio >= 3 ? 0 : 1);
}

const doc = JSON.parse(readFileSync(TOKENS, 'utf8'));
checkContrastAssertions(doc);
checkEncodingChannels(doc);
checkDichromatSeparation(doc);
checkCssVarIntegrity();

const verbose = argv.includes('--verbose');
console.log('Ada-editor token verification\n');
if (verbose) console.log(notes.join('\n') + '\n');

if (failures.length) {
  console.error(`FAILED (${failures.length})\n`);
  for (const f of failures) console.error('  ' + f);
  console.error('\nFix the tokens. Do not lower the assertion.');
  process.exit(1);
}
console.log(`PASSED — ${notes.length} checks, 0 failures.`);
console.log('Run with --verbose to see every measured ratio.');
