#!/usr/bin/env node
/**
 * Is a four-colour severity palette that survives colour-vision deficiency
 * actually achievable?
 *
 * This script exists because the first answer given here was wrong. An earlier
 * draft measured severity separation with WCAG contrast and concluded that no
 * palette could work. Contrast is a luminance ratio and cannot see hue at all,
 * so that conclusion was an artefact of the metric. Measured properly with
 * CIEDE2000, a CVD-safe four-colour palette exists comfortably.
 *
 * The design still does not rely on colour — WCAG 1.4.1 requires a non-colour
 * channel regardless — but the honest reason is a trade-off, not impossibility.
 *
 *   node scripts/palette-ceiling.mjs [iterations]
 */

import { contrast, simulate, deltaE } from './verify-tokens.mjs';

const ITERATIONS = Number(process.argv[2] ?? 200_000);
const MIN_ON_WHITE = 4.5;
/** Below this, two colours read as shades of one another. JND is 2.3. */
const SAME_COLOUR = 10;

const randomHex = () =>
  '#' + Array.from({ length: 3 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');

const pool = [];
while (pool.length < 6000) {
  const c = randomHex();
  if (contrast(c, '#FFFFFF') >= MIN_ON_WHITE) pool.push(c);
}

/** Full dichromacy and moderate anomalous trichromacy, which is far more common. */
const CASES = [['deuteranopia', 1], ['protanopia', 1], ['deuteranopia', 0.6], ['protanopia', 0.6]];

/** Worst pairwise CIEDE2000 across all pairs, across every deficiency case. */
const worstPair = (set) => {
  let min = Infinity;
  for (const [kind, severity] of CASES) {
    for (let i = 0; i < set.length; i++) {
      for (let j = i + 1; j < set.length; j++) {
        min = Math.min(min, deltaE(simulate(set[i], kind, severity), simulate(set[j], kind, severity)));
      }
    }
  }
  return min;
};

let best = null;
let bestScore = 0;
for (let n = 0; n < ITERATIONS; n++) {
  const set = Array.from({ length: 4 }, () => pool[(Math.random() * pool.length) | 0]);
  const score = worstPair(set);
  if (score > bestScore) { bestScore = score; best = set; }
}

const shipped = ['#B3261E', '#8A4B00', '#1F5EA8', '#6B3FA0'];

console.log(`Searched ${ITERATIONS.toLocaleString()} four-colour sets, each >= ${MIN_ON_WHITE}:1 on white.`);
console.log('Metric: CIEDE2000 over Machado 2009, at severity 1.0 and 0.6.');
console.log('JND = 2.3; below 10 two colours read as the same.\n');
console.log(`Unconstrained best:  ${best.join(' ')}`);
console.log(`  worst pair:        dE ${bestScore.toFixed(1)} under dichromacy`);
console.log(`Our shipped palette: ${shipped.join(' ')}`);
console.log(`  worst pair:        dE ${worstPair(shipped).toFixed(1)} under dichromacy\n`);

if (bestScore >= SAME_COLOUR) {
  console.log('A CVD-safe four-colour palette EXISTS, so colour separation is achievable.');
  console.log('We do not use one. Reaching it means giving up the conventional red =');
  console.log('blocker / amber = violation ramp, whose two colours sit on the exact axis');
  console.log('red-green deficiency removes — and that convention is worth a great deal');
  console.log('to the ~92% of users with typical colour vision. We keep the convention');
  console.log('and carry meaning in shape, glyph and text, which 1.4.1 requires anyway.');
} else {
  console.log('No CVD-safe four-colour palette found in this search.');
}
