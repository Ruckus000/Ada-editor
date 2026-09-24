/**
 * WCAG 2.x contrast for the contrast-minimum rule (SC 1.4.3).
 *
 * The same relative-luminance maths as scripts/verify-tokens.mjs, which gates
 * the design tokens; the app cannot import a Node script, so this is a copy
 * pinned to the same reference values by scripts/verify-rules.mjs.
 */

export type RGB = readonly [number, number, number];

// The 16 basic CSS colour names, plus nothing else: `yellow` is the highlight
// mark's own default, and anything a browser pastes arrives as rgb() or hex.
const NAMED: Readonly<Record<string, string>> = {
  black: '#000000', silver: '#c0c0c0', gray: '#808080', grey: '#808080', white: '#ffffff',
  maroon: '#800000', red: '#ff0000', purple: '#800080', fuchsia: '#ff00ff',
  green: '#008000', lime: '#00ff00', olive: '#808000', yellow: '#ffff00',
  navy: '#000080', blue: '#0000ff', teal: '#008080', aqua: '#00ffff',
};

/**
 * Parse a CSS colour as authored in a mark, or null when it can't be judged.
 *
 * ponytail: accepts #rgb, #rrggbb, rgb()/rgba() with alpha 1, and the basic
 * names. Anything else — alpha below 1, `transparent`, `var()`, hsl(), other
 * names — returns null and the text is not judged. Upgrade trigger: a real
 * document whose colours are skipped.
 */
export function parseColour(css: string): RGB | null {
  const value = css.trim().toLowerCase();
  const hex = NAMED[value] ?? value;
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(hex);
  if (m) {
    const h = m[1]!.length === 3 ? m[1]!.split('').map((c) => c + c).join('') : m[1]!;
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as unknown as RGB;
  }
  m = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/.exec(value);
  if (m) {
    const alpha = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    const rgb = [m[1], m[2], m[3]].map(Number);
    if (alpha !== 1 || rgb.some((c) => c > 255)) return null;
    return rgb as unknown as RGB;
  }
  return null;
}

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: RGB) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

export function contrastRatio(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** '#5e6c84' form, for explanations and the fix's diff. */
export const hexOf = (c: RGB): string => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
