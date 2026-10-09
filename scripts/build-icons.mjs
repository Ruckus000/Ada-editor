#!/usr/bin/env node
/**
 * Generates the app's icons and social card from the Caret mark's sources in
 * design-system/brand/. The SVGs there are the only source of truth — never
 * hand-edit the generated files. The rules for the mark are in
 * docs/audit/logo-2026-10.md.
 *
 *   node scripts/build-icons.mjs
 *
 * Writes app/icon.svg, app/favicon.ico, app/apple-icon.png,
 * app/opengraph-image.png and app/twitter-image.png (with their alt text), and
 * public/icons/icon-{192,512}.png and icon-maskable-512.png for the manifest.
 * Text on the social card is set as outlines from the shipped Atkinson
 * Hyperlegible Next files, so the card never depends on a system font.
 */

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as fontkit from 'fontkit';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const BRAND = resolve(ROOT, 'design-system/brand');
const APP = resolve(ROOT, 'app');
const ICONS = resolve(ROOT, 'public/icons');
const FONTS = resolve(ROOT, 'public/fonts/atkinson-hyperlegible-next');

const mark = readFileSync(resolve(BRAND, 'mark.svg'), 'utf8');
const mark16 = readFileSync(resolve(BRAND, 'mark-16.svg'), 'utf8');
// Home-screen files are square and full-bleed: each platform applies its own mask.
const markSquare = mark.replace(' rx="8"', '');
if (markSquare === mark) throw new Error('mark.svg: expected the tile to carry rx="8"');

/** Rasterises an SVG at exactly size × size by giving it that intrinsic size. */
const png = (svg, size) =>
  sharp(Buffer.from(svg.replace('<svg ', `<svg width="${size}" height="${size}" `)))
    .png({ compressionLevel: 9 })
    .toBuffer();

/** An .ico holding PNG entries (supported by every browser that reads .ico). */
function ico(entries) {
  const header = Buffer.alloc(6 + 16 * entries.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  entries.forEach(({ size, data }, i) => {
    const at = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, at);
    header.writeUInt8(size >= 256 ? 0 : size, at + 1);
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(data.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...entries.map((e) => e.data)]);
}

// ---------- Social card ----------

const bold = fontkit.openSync(resolve(FONTS, 'bold.ttf'));
const regular = fontkit.openSync(resolve(FONTS, 'regular.ttf'));

/** One line of text as an SVG path: kerned by fontkit, tracking in em. */
function line(font, text, size, x, baseline, tracking = 0) {
  const scale = size / font.unitsPerEm;
  const { glyphs, positions } = font.layout(text);
  let pen = 0;
  const parts = glyphs.map((glyph, i) => {
    const d = glyph.path
      .scale(scale, -scale)
      .translate(x + pen + positions[i].xOffset * scale, baseline - positions[i].yOffset * scale)
      .toSVG();
    pen += positions[i].xAdvance * scale + tracking * size;
    return d;
  });
  return { d: parts.join(''), width: pen - tracking * size };
}

/** Baseline of a CSS line box: half-leading plus the font's ascent. */
const baselineOf = (font, size, lineTop, lineHeight) =>
  lineTop + (lineHeight - ((font.ascent - font.descent) / font.unitsPerEm) * size) / 2 + (font.ascent / font.unitsPerEm) * size;

const W = 1200, H = 630, PAD_X = 80, PAD_Y = 72, COLUMN = 1040;
const INK = '#161C24', BLUE = '#1A4FBF', SECONDARY = '#4E5B6E', FOOTER = '#3A4553', RULE = '#C2CCDA', GROUND = '#F7F9FC';
const HEADLINE = ['Write documents that meet', 'WCAG 2.1 AA and Section 508.'];
const SUBLINE = ['Checks as you write, and is honest about the limits', 'of what a checker can know.'];
const ALT = 'Ada Editor: write documents that meet WCAG 2.1 AA and Section 508.';

function card() {
  const paths = [];
  const fill = (color, d) => paths.push(`<path fill="${color}" d="${d}"/>`);
  const fits = (what, width) => {
    if (width > COLUMN) throw new Error(`social card: "${what}" is ${Math.round(width)} px, wider than the ${COLUMN} px column`);
  };

  // Lockup: 48 px mark, name at 0.6 × the mark, 0.3 × gap, centred on the mark.
  const markSize = 48;
  const markInner = mark.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  paths.push(`<g transform="translate(${PAD_X} ${PAD_Y}) scale(${markSize / 64})">${markInner}</g>`);
  const nameSize = 29;
  const nameBaseline = PAD_Y + markSize / 2 + ((bold.capHeight / bold.unitsPerEm) * nameSize) / 2;
  fill(INK, line(bold, 'Ada Editor', nameSize, PAD_X + markSize + 14, nameBaseline).d);

  // Footer: a hairline, then the domain and one plain fact.
  const footSize = 22, footLine = footSize * 1.2, footTop = H - PAD_Y - footLine;
  const ruleY = footTop - 24;
  paths.push(`<rect x="${PAD_X}" y="${ruleY}" width="${W - 2 * PAD_X}" height="1" fill="${RULE}"/>`);
  const footBase = baselineOf(regular, footSize, footTop, footLine);
  fill(FOOTER, line(regular, 'adaedit.com', footSize, PAD_X, footBase).d);
  const right = line(regular, 'Works with or without an account', footSize, 0, footBase);
  fill(FOOTER, line(regular, 'Works with or without an account', footSize, W - PAD_X - right.width, footBase).d);

  // Headline and subline, centred between the lockup and the hairline.
  const headSize = 68, headLine = headSize * 1.08, subSize = 28, subLine = subSize * 1.4, gap = 24;
  const block = HEADLINE.length * headLine + gap + SUBLINE.length * subLine;
  let top = PAD_Y + markSize + (ruleY - (PAD_Y + markSize) - block) / 2;
  HEADLINE.forEach((text, i) => {
    const base = baselineOf(bold, headSize, top, headLine);
    const set = line(bold, text, headSize, PAD_X, base, -0.015);
    fits(text, set.width);
    fill(INK, set.d);
    if (i === HEADLINE.length - 1) {
      // The caret after the last word, as on the canvas: 6 × 64, 10 px in, 10 px below the baseline.
      paths.push(`<rect x="${PAD_X + set.width + 10}" y="${base + 10 - 64}" width="6" height="64" fill="${BLUE}"/>`);
    }
    top += headLine;
  });
  top += gap;
  SUBLINE.forEach((text) => {
    const set = line(regular, text, subSize, PAD_X, baselineOf(regular, subSize, top, subLine));
    fits(text, set.width);
    fill(SECONDARY, set.d);
    top += subLine;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${GROUND}"/>${paths.join('')}</svg>`;
}

// ---------- Write everything ----------

mkdirSync(ICONS, { recursive: true });

copyFileSync(resolve(BRAND, 'mark-16.svg'), resolve(APP, 'icon.svg'));
writeFileSync(resolve(APP, 'favicon.ico'), ico([
  { size: 16, data: await png(mark16, 16) },
  { size: 32, data: await png(mark, 32) },
  { size: 48, data: await png(mark, 48) },
]));
writeFileSync(resolve(APP, 'apple-icon.png'), await png(markSquare, 180));
writeFileSync(resolve(ICONS, 'icon-192.png'), await png(mark, 192));
writeFileSync(resolve(ICONS, 'icon-512.png'), await png(mark, 512));
writeFileSync(resolve(ICONS, 'icon-maskable-512.png'), await png(markSquare, 512));

const social = await sharp(Buffer.from(card())).png({ compressionLevel: 9 }).toBuffer();
for (const name of ['opengraph-image', 'twitter-image']) {
  writeFileSync(resolve(APP, `${name}.png`), social);
  writeFileSync(resolve(APP, `${name}.alt.txt`), ALT);
}

console.log('wrote app/icon.svg, favicon.ico, apple-icon.png, opengraph-image.png, twitter-image.png and public/icons/');
