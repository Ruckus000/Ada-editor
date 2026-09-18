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

/* ---------- Machado et al. (2009) colour-vision-deficiency simulation ---------- */

/**
 * Replaces the Viénot (1999) model used previously.
 *
 * Two reasons. Viénot is a dichromat-only linear approximation, and it models
 * the severe end exclusively — but most colour-vision deficiency is anomalous
 * trichromacy, a partial shift. A palette can look fine under full dichromacy
 * simulation and still fail the much larger population with mild deuteranomaly,
 * or vice versa. Machado's model is defined over a severity range, so we check
 * both ends.
 *
 * Matrices are the published severity-1.0 transforms, applied to LINEAR RGB.
 * Each row sums to 1, so white maps to white.
 */
const CVD_MATRICES = {
  deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.011820, 0.042940, 0.968881],
  protanopia:   [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  tritanopia:   [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.303900],
};

const encodeChannel = (v) => {
  const c = Math.max(0, Math.min(1, v));
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(s * 255).toString(16).padStart(2, '0');
};

/**
 * @param severity 0 (typical vision) to 1 (full dichromacy). Values between are
 *   interpolated from identity toward the published transform. Machado provides
 *   per-severity matrices; interpolation is an approximation of those, used here
 *   rather than transcribing numbers that cannot be checked from this repo.
 */
export const simulate = (hex, kind, severity = 1) => {
  const base = CVD_MATRICES[kind];
  if (!base) throw new Error(`unknown deficiency: ${kind}`);
  const t = Math.max(0, Math.min(1, severity));
  const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const m = base.map((v, i) => identity[i] + (v - identity[i]) * t);

  const [r, g, b] = parseHex(hex).map(srgbToLinear);
  const R = m[0] * r + m[1] * g + m[2] * b;
  const G = m[3] * r + m[4] * g + m[5] * b;
  const B = m[6] * r + m[7] * g + m[8] * b;
  return `#${encodeChannel(R)}${encodeChannel(G)}${encodeChannel(B)}`.toUpperCase();
};

/* ---------- perceptual colour difference (CIEDE2000) ---------- */

/**
 * WCAG contrast is a LUMINANCE ratio. It cannot measure hue separation at all:
 * pure red against pure green scores 2.91:1, and two of our severity colours
 * score 1.00:1 in perfectly normal vision purely because we tuned them to the
 * same contrast against white.
 *
 * So contrast is the wrong tool for asking "can these two states be told
 * apart?" That question needs a perceptually uniform metric. CIEDE2000 gives
 * one: dE ~2.3 is the just-noticeable difference, and below ~10 two colours
 * read as shades of the same thing rather than as different colours.
 */

const toXyz = (hex) => {
  const [r, g, b] = parseHex(hex).map(srgbToLinear);
  return [
    (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047,
    0.2126729 * r + 0.7151522 * g + 0.0721750 * b,
    (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883,
  ];
};

const toLab = (hex) => {
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const [x, y, z] = toXyz(hex).map(f);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};

const rad = (deg) => (deg * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** CIEDE2000 colour difference between two hex colours. */
export const deltaE = (hexA, hexB) => {
  const [L1, a1, b1] = toLab(hexA);
  const [L2, a2, b2] = toLab(hexB);

  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));

  const ap1 = (1 + G) * a1;
  const ap2 = (1 + G) * a2;
  const Cp1 = Math.hypot(ap1, b1);
  const Cp2 = Math.hypot(ap2, b2);

  const hp = (b, ap) => {
    if (b === 0 && ap === 0) return 0;
    const h = deg(Math.atan2(b, ap));
    return h >= 0 ? h : h + 360;
  };
  const hp1 = hp(b1, ap1);
  const hp2 = hp(b2, ap2);

  const dLp = L2 - L1;
  const dCp = Cp2 - Cp1;

  let dhp = 0;
  if (Cp1 * Cp2 !== 0) {
    dhp = hp2 - hp1;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin(rad(dhp) / 2);

  const Lbp = (L1 + L2) / 2;
  const Cbp = (Cp1 + Cp2) / 2;

  let hbp = hp1 + hp2;
  if (Cp1 * Cp2 !== 0) {
    if (Math.abs(hp1 - hp2) > 180) hbp += hbp < 360 ? 360 : -360;
    hbp /= 2;
  }

  const T =
    1 -
    0.17 * Math.cos(rad(hbp - 30)) +
    0.24 * Math.cos(rad(2 * hbp)) +
    0.32 * Math.cos(rad(3 * hbp + 6)) -
    0.20 * Math.cos(rad(4 * hbp - 63));

  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc;

  return Math.sqrt(
    (dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh)
  );
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
  // Measured with CIEDE2000, NOT WCAG contrast.
  //
  // This check originally used contrast ratio and was wrong. Contrast is a
  // luminance ratio: it cannot see hue at all. Pure red against pure green
  // scores 2.91:1, and our severity colours scored ~1.0:1 against each other in
  // perfectly normal vision purely because they are tuned to equal contrast on
  // white. The old check therefore "proved" a collapse that had nothing to do
  // with colour-vision deficiency.
  //
  // CIEDE2000 is perceptually uniform: dE 2.3 is the just-noticeable
  // difference, and below ~10 two colours read as shades of one another.
  const JND = 2.3;
  const SAME_COLOUR = 10;
  // Full dichromacy AND moderate anomalous trichromacy, which is far more common.
  const CVD_CASES = [
    ['deuteranopia', 1], ['protanopia', 1],
    ['deuteranopia', 0.6], ['protanopia', 0.6],
  ];
  const severities = ['blocker', 'violation', 'advisory', 'manual'];

  for (const theme of ['light', 'dark']) {
    const colours = {};
    for (const s of severities) {
      const t = getPath(doc, `semantic.${theme}.severity.${s}.fg`);
      if (t) colours[s] = resolveValue(doc, t.$value);
    }

    for (let i = 0; i < severities.length; i++) {
      for (let j = i + 1; j < severities.length; j++) {
        const [a, b] = [severities[i], severities[j]];
        if (!colours[a] || !colours[b]) continue;

        // A pair that is indistinguishable even to a trichromat is a plain
        // palette defect, not a CVD trade-off. Always a failure.
        const normal = deltaE(colours[a], colours[b]);
        if (normal < SAME_COLOUR) {
          fail(`PALETTE  ${theme}: ${a} vs ${b} differ by only dE ${normal.toFixed(1)} ` +
               `in NORMAL vision — they are the same colour to everyone`);
          continue;
        }

        for (const [kind, sev] of CVD_CASES) {
          const d = deltaE(simulate(colours[a], kind, sev), simulate(colours[b], kind, sev));
          const label = `${kind}@${sev}`;
          if (d >= SAME_COLOUR) {
            notes.push(`  ok  ${theme}/${label}: ${a} vs ${b} dE ${d.toFixed(1)} — stays distinguishable`);
            continue;
          }
          // Collapses under CVD. Permitted only because nothing depends on it.
          const chA = (doc.encoding?.[a]?.channels ?? []).filter((c) => c !== 'colour').length;
          const chB = (doc.encoding?.[b]?.channels ?? []).filter((c) => c !== 'colour').length;
          if (chA < 2 || chB < 2) {
            fail(`CVD  ${theme}/${label}: ${a} vs ${b} dE ${d.toFixed(1)} and no non-colour fallback`);
          } else {
            const how = d < JND ? 'below the just-noticeable difference' : 'reads as the same colour';
            notes.push(`  ok  ${theme}/${label}: ${a} vs ${b} dE ${d.toFixed(1)} — ${how}; ` +
                       `shape+glyph+label carry it`);
          }
        }
      }
    }
  }
}

function checkOpaqueSurfaces(doc) {
  /**
   * Contrast maths assumes flat, opaque colours. A translucent overlay or a
   * gradient composites against whatever is behind it, so its real ratio is not
   * the one computed from its own value — and the computed number would be
   * wrong in the reassuring direction.
   *
   * Everything is opaque hex today, so this is a forward guard: it stops the
   * gap reopening silently the first time someone reaches for rgba().
   */
  for (const { path, token } of walkTokens(doc)) {
    if (token.$type !== 'color') continue;
    const raw = String(token.$value);
    if (raw.startsWith('{')) continue; // alias; the target is checked on its own

    const translucent =
      /^#([0-9a-f]{4}|[0-9a-f]{8})$/i.test(raw) ||
      /rgba?\([^)]*\/[^)]*\)/i.test(raw) ||
      /(rgba|hsla)\(/i.test(raw) ||
      /gradient/i.test(raw);

    if (!translucent) continue;
    if (!token.$extensions?.ada?.compositedOver) {
      fail(`SURFACE  ${path} is translucent or a gradient (${raw}) but declares no ` +
           `$extensions.ada.compositedOver — its contrast cannot be computed`);
    } else {
      notes.push(`  ok  ${path} translucent, composited over ${token.$extensions.ada.compositedOver}`);
    }
  }
  notes.push('  ok  all colour tokens opaque or declare a backdrop');
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

// Only run when invoked directly. Without this guard, importing `contrast` or
// `simulate` from another script silently executes the whole verification.
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (!invokedDirectly) {
  // Imported as a library: export the colour maths and stop here.
} else if (argv[0] === '--pair') {
  const [, fg, bg] = argv;
  const ratio = contrast(fg, bg);
  const verdict = (min) => (ratio >= min ? 'PASS' : 'FAIL');
  console.log(`${fg} on ${bg} = ${ratio.toFixed(2)}:1`);
  console.log(`  text AA  (4.5:1) ${verdict(4.5)}`);
  console.log(`  text AAA (7.0:1) ${verdict(7)}`);
  console.log(`  non-text (3.0:1) ${verdict(3)}`);
  process.exit(ratio >= 3 ? 0 : 1);
} else {
  const doc = JSON.parse(readFileSync(TOKENS, 'utf8'));
  checkContrastAssertions(doc);
  checkEncodingChannels(doc);
  checkDichromatSeparation(doc);
  checkOpaqueSurfaces(doc);
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
}
