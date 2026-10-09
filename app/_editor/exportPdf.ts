import PDFDocument from 'pdfkit';
import { toBytes } from 'pdfkit/output';
import type { Mark, Node as PMNode } from 'prosemirror-model';
import { TableMap } from 'prosemirror-tables';
import type { Rect } from 'prosemirror-tables';
import { ALIGN_FRACTION, SIZE_FRACTION, documentLanguage, figureAlign, figureSize, safeHref } from './editorSchema';
import { headerScope, leadingHeaderRows } from './tableHeaders';
import { validImageKey } from '../_data/imageFormat';
import { isForeignTo, isUsableLangTag } from '../_engine/textHelpers';
import { BODY_PX, HEADING_PX, LINK_TEXT, PAGE_TEXT, parseColour } from '../_engine/contrast';
import type { RGB } from '../_engine/contrast';

/**
 * The document as a tagged PDF (PDF/UA-1, ISO 14289-1), built in the browser.
 *
 * The HTML export hands layout to a browser; a PDF has to be laid out here.
 * So this module does its own line breaking and pagination, and builds the
 * structure tree (what a screen reader reads) from the same ProseMirror
 * document in the same pass — every tag comes from the document's own
 * structure, never inferred from how the page looks.
 *
 * The same promise as the HTML export: the PDF is exactly as accessible as
 * the findings say. A figure without alt text is exported without alt text,
 * and the veraPDF gate (scripts/verify-pdf.mjs) proves both halves — clean
 * documents pass PDF/UA-1, flagged ones fail on what was flagged.
 */

/** The four faces of the one embedded family. PDF/UA forbids relying on a
 *  reader's fonts, so every glyph drawn comes from these bytes. */
export interface PdfFonts {
  regular: Uint8Array;
  bold: Uint8Array;
  italic: Uint8Array;
  boldItalic: Uint8Array;
}

/** Where the app serves the fonts (public/). OFL-licensed; see OFL.txt there. */
export const PDF_FONT_FILES: Readonly<Record<keyof PdfFonts, string>> = {
  regular: '/fonts/atkinson-hyperlegible-next/regular.ttf',
  bold: '/fonts/atkinson-hyperlegible-next/bold.ttf',
  italic: '/fonts/atkinson-hyperlegible-next/italic.ttf',
  boldItalic: '/fonts/atkinson-hyperlegible-next/bold-italic.ttf',
};

export type PdfResult =
  | { ok: true; bytes: Uint8Array; pages: number }
  /** Characters the embedded font has no glyph for, in document order. */
  | { ok: false; missing: string[] };

type Face = keyof PdfFonts;

// CSS px → PDF points. The contrast rule judges sizes in CSS px; drawing them
// at the same physical size keeps its large-text verdicts true for the PDF.
const PT = 0.75;
const BODY = BODY_PX * PT;
/** Same line height as the HTML export's stylesheet. */
const LEADING = 1.6;
const PAGE_W = 612; // US Letter
const PAGE_H = 792;
const MARGIN = 72;
/** A list's content inset (a browser's 40px) and the gap before its label. */
const LIST_INSET = 40 * PT;
const LABEL_GAP = 6;
/** Browsers' default top/bottom margins for h1–h6, in em. */
const HEADING_MARGIN_EM: Readonly<Record<number, number>> = { 1: 0.67, 2: 0.83, 3: 1, 4: 1.33, 5: 1.67, 6: 2.33 };
/** The export stylesheet's figure placeholder: 1.5rem margin, 3rem padding, 2px dashed border. */
const FIGURE_MARGIN = 24 * PT;
const FIGURE_PAD = 48 * PT;
const FIGURE_BORDER = 2 * PT;
const BULLET = '•';
/** The export stylesheet's table: 0.25rem × 0.5rem cell padding, 1px rules. */
const CELL_PAD_X = 8 * PT;
const CELL_PAD_Y = 4 * PT;
const CELL_RULE = 1 * PT;

interface Style {
  face: Face;
  size: number;
  color: RGB;
  highlight: RGB | null;
  underline: boolean;
}

/** One run of text with one style, inside one structure group. */
interface Run {
  text: string;
  style: Style;
  group: number;
}

/** A structure group inside a block: plain text, a link, a language span, or both. */
interface Group {
  href: string | null;
  lang: string | null;
}

/** Positioned text on one page: `y` is the baseline, `top`/`height` the line box. */
interface Frag {
  page: number;
  x: number;
  y: number;
  top: number;
  height: number;
  width: number;
  text: string;
  style: Style;
  group: number;
}

/** Drawn content under one structure element, in reading order. */
type Content =
  | { kind: 'text'; frags: Frag[] }
  | { kind: 'figure'; page: number; x: number; top: number; width: number; height: number; label: Frag }
  /** A picture: PDFKit's opened image, drawn at this box. */
  | { kind: 'image'; page: number; x: number; top: number; width: number; height: number; image: PdfImageObject };

/** What PDFKit's openImage returns; image() accepts it back. */
interface PdfImageObject { width: number; height: number; orientation?: number }

/** The document's pictures as PNG or JPEG bytes, by key (exportImages.ts
 *  fetches them in the browser; the gate passes its own). */
export type PdfImages = ReadonlyMap<string, { data: Uint8Array }>;

/** A header or footer image (store.ts SectionImage). */
export interface BandImage { alt: string; image: string | null; width: number | null; height: number | null }
/** A band image is logo-sized: never taller than this. */
const BAND_IMAGE_MAX = 48;
const BAND_GAP = 4;

interface Elem {
  type: string;
  options: { alt?: string; lang?: string; bbox?: [number, number, number, number] };
  /** Extra attribute dictionary (/A), e.g. a list's numbering or a header's scope.
   *  PDFKit writes strings as PDF names and numbers as numbers. */
  attributes?: Record<string, string | number>;
  href?: string;
  children: (Elem | Content)[];
}

/** The fontkit font behind an embedded face: what coverage and metrics need. */
interface FontkitFont {
  hasGlyphForCodePoint(codePoint: number): boolean;
  ascent: number;
  descent: number;
  unitsPerEm: number;
}

const hex = (css: string, fallback: RGB): RGB => parseColour(css) ?? fallback;

/**
 * Build the PDF. `fonts` are the TTF bytes (the browser fetches
 * PDF_FONT_FILES; the Node gate reads them from public/).
 */
export async function exportPdf(doc: PMNode, meta: { title: string; header: string; footer: string; headerImage?: BandImage | null; footerImage?: BandImage | null }, fonts: PdfFonts, images: PdfImages = new Map()): Promise<PdfResult> {
  const lang = documentLanguage(doc);
  const title = meta.title.trim() || 'Untitled document';
  const pdf = new PDFDocument({
    size: [PAGE_W, PAGE_H],
    margin: 0,
    pdfVersion: '1.7',
    // @types/pdfkit predates PDFKit's PDF/UA subset.
    subset: 'PDF/UA' as PDFKit.Mixins.PDFSubsets,
    tagged: true,
    displayTitle: true,
    lang,
    info: { Title: title, Creator: 'Ada Editor' },
    // The default face, so PDFKit never touches an unembedded standard font.
    font: fonts.regular as unknown as string,
  });
  const faces = Object.keys(fonts) as Face[];
  for (const face of faces) pdf.registerFont(face, fonts[face] as unknown as string);
  omitCidSets(pdf);
  escapeXmpInfo(pdf);

  /* ---------- measuring ---------- */

  const fontkitFor = (face: Face): FontkitFont => {
    pdf.font(face);
    // ponytail: PDFKit exposes no glyph-coverage call; `_font.font` is the
    // fontkit font behind an embedded face.
    return (pdf as unknown as { _font: { font: FontkitFont } })._font.font;
  };
  const metrics = fontkitFor('regular');
  const ASCENT = metrics.ascent / metrics.unitsPerEm;
  const DESCENT = -metrics.descent / metrics.unitsPerEm;
  const widthOf = (text: string, style: Style) => pdf.font(style.face).fontSize(style.size).widthOfString(text);

  // ponytail: one Latin family (Latin-1 and Latin Extended-A). A document with
  // Greek, Cyrillic, Hebrew, Arabic or CJK text is refused, never drawn as
  // empty boxes; right-to-left layout would be needed for the last three as
  // well. Upgrade trigger: a user who needs one of those scripts in a PDF.
  const missing = new Set<string>();
  const coverage = new Map<Face, FontkitFont>(faces.map((f) => [f, fontkitFor(f)]));
  const needGlyphs = (text: string, face: Face) => {
    for (const ch of text) {
      if (/\s/.test(ch)) continue;
      if (!coverage.get(face)!.hasGlyphForCodePoint(ch.codePointAt(0)!)) missing.add(ch);
    }
  };

  /* ---------- inline content → runs ---------- */

  const baseStyle = (size: number, bold: boolean): Style => ({ face: bold ? 'bold' : 'regular', size, color: hex(PAGE_TEXT, [0, 0, 0]), highlight: null, underline: false });

  const styleFor = (base: Style, marks: readonly Mark[]): Style => {
    let bold = base.face === 'bold' || base.face === 'boldItalic';
    let italic = false;
    const style = { ...base };
    for (const mark of marks) {
      const attrs = mark.attrs as Record<string, unknown>;
      switch (mark.type.name) {
        case 'strong': bold = true; break;
        case 'em': italic = true; break;
        case 'underline': style.underline = true; break;
        case 'textColor': style.color = hex(String(attrs.color), style.color); break;
        // A highlight the parser can't read ('transparent', hsl()) is left out,
        // exactly as the contrast rule leaves it unjudged.
        case 'highlight': style.highlight = parseColour(String(attrs.color)); break;
        case 'fontSize': style.size = (Number(attrs.size) || BODY_PX) * PT; break;
        case 'link':
          if (safeHref(String(attrs.href))) {
            style.color = hex(LINK_TEXT, style.color);
            style.underline = true;
          }
          break;
        // ponytail: fontFamily marks are not honoured; the PDF embeds one
        // family. Upgrade trigger: a user who needs a document's own fonts.
        default: break;
      }
    }
    style.face = bold ? (italic ? 'boldItalic' : 'bold') : italic ? 'italic' : 'regular';
    return style;
  };

  /** A block's inline content as runs, and the groups they belong to. */
  const inline = (block: PMNode, base: Style): { runs: Run[]; groups: Group[] } => {
    const runs: Run[] = [];
    const groups: Group[] = [];
    const groupOf = (href: string | null, spanLang: string | null) => {
      const last = groups[groups.length - 1];
      if (last && last.href === href && last.lang === spanLang) return groups.length - 1;
      groups.push({ href, lang: spanLang });
      return groups.length - 1;
    };
    block.forEach((child) => {
      const linkMark = child.marks.find((m) => m.type.name === 'link');
      const href = linkMark ? safeHref(String(linkMark.attrs.href)) : null;
      const langMark = child.marks.find((m) => m.type.name === 'lang');
      const spanLang = langMark ? String(langMark.attrs.lang) : null;
      // Only a usable tag that differs from the page's is a language change,
      // the same test the HTML export and the language rules apply.
      const partLang = spanLang && isUsableLangTag(spanLang) && isForeignTo(spanLang, lang) ? spanLang : null;
      const group = groupOf(href, partLang);
      if (child.type.name === 'hard_break') {
        runs.push({ text: '\n', style: base, group });
      } else if (child.isText) {
        const style = styleFor(base, child.marks);
        const text = child.text!.replace(/[\t\r\n\f\v]+/g, ' ');
        needGlyphs(text, style.face);
        runs.push({ text, style, group });
      }
    });
    return { runs, groups };
  };

  /* ---------- line breaking ---------- */

  interface Atom { text: string; style: Style; group: number; width: number }
  interface Line { atoms: Atom[]; size: number }

  /** Greedy line breaking at spaces; a word wider than the line breaks between characters. */
  const breakLines = (runs: Run[], width: number, emptySize: number): Line[] => {
    const lines: Line[] = [];
    let current: Atom[] = [];
    let used = 0;
    let spaces: Atom[] = [];
    let word: Atom[] = [];
    const finishLine = (keepSpaces: boolean) => {
      // A line's trailing space stays in the text (invisible, past the edge),
      // so text extraction and screen readers still hear a word boundary.
      const atoms = keepSpaces ? [...current, ...spaces] : current;
      lines.push({ atoms, size: atoms.reduce((m, a) => Math.max(m, a.style.size), 0) || emptySize });
      current = [];
      used = 0;
      spaces = [];
    };
    const place = (atoms: Atom[]) => {
      const w = atoms.reduce((s, a) => s + a.width, 0);
      const gap = spaces.reduce((s, a) => s + a.width, 0);
      if (current.length && used + gap + w > width) finishLine(true);
      if (!current.length) spaces = [];
      if (!current.length && w > width) {
        // Split the word itself (a long URL) character by character.
        for (const atom of atoms) {
          for (const ch of atom.text) {
            const piece = { ...atom, text: ch, width: widthOf(ch, atom.style) };
            if (current.length && used + piece.width > width) finishLine(false);
            current.push(piece);
            used += piece.width;
          }
        }
        return;
      }
      current.push(...spaces, ...atoms);
      used += gap + w;
      spaces = [];
    };
    const flushWord = () => {
      if (word.length) place(word);
      word = [];
    };
    for (const run of runs) {
      if (run.text === '\n') {
        flushWord();
        finishLine(true);
        continue;
      }
      for (const token of run.text.match(/ +|[^ ]+/g) ?? []) {
        if (token.startsWith(' ')) {
          flushWord();
          // Collapsed like HTML: one space, and none at the start of a line.
          if (current.length && !spaces.length) spaces.push({ text: ' ', style: run.style, group: run.group, width: widthOf(' ', run.style) });
        } else {
          word.push({ text: token, style: run.style, group: run.group, width: widthOf(token, run.style) });
        }
      }
    }
    flushWord();
    if (current.length || !lines.length) finishLine(false);
    return lines;
  };

  /* ---------- pictures ---------- */

  /** A picture by key, opened by PDFKit, or null: no key, no bytes, or bytes
   *  PDFKit can't read (a figure is then the placeholder it is in the editor). */
  const opened = new Map<string, PdfImageObject | null>();
  const openPicture = (raw: unknown): { image: PdfImageObject; displayW: number; displayH: number } | null => {
    const key = validImageKey(raw);
    const source = key ? images.get(key) : undefined;
    if (!key || !source) return null;
    if (!opened.has(key)) {
      try {
        opened.set(key, (pdf as unknown as { openImage(src: Uint8Array): PdfImageObject }).openImage(source.data));
      } catch {
        opened.set(key, null);
      }
    }
    const image = opened.get(key);
    if (!image) return null;
    const turned = (image.orientation ?? 1) > 4;
    return { image, displayW: turned ? image.height : image.width, displayH: turned ? image.width : image.height };
  };

  /** A band's picture at logo size, or null. */
  const bandPicture = (band: BandImage | null | undefined) => {
    const picture = band ? openPicture(band.image) : null;
    if (!band || !picture) return null;
    const natW = (band.width ?? picture.displayW) * PT;
    const natH = (band.height ?? picture.displayH) * PT;
    let h = Math.min(natH, BAND_IMAGE_MAX);
    let w = (h * natW) / natH;
    if (w > PAGE_W - 2 * MARGIN) { w = PAGE_W - 2 * MARGIN; h = (w * natH) / natW; }
    return { image: picture.image, w, h, alt: band.alt.trim() };
  };

  /* ---------- pagination ---------- */

  const lineHeight = (size: number) => size * LEADING;
  /** Header or footer text: its own line breaks kept, at body size across the full width. */
  const bandLines = (text: string): Line[] => {
    if (!text.trim()) return [];
    const style = baseStyle(BODY, false);
    needGlyphs(text, 'regular');
    const runs = text.trim().split(/\s*\n\s*/).flatMap((part, i): Run[] => [...(i ? [{ text: '\n', style, group: 0 }] : []), { text: part, style, group: 0 }]);
    return breakLines(runs, PAGE_W - 2 * MARGIN, BODY);
  };
  const headerLines = bandLines(meta.header);
  const footerLines = bandLines(meta.footer);
  const headerPic = bandPicture(meta.headerImage);
  const footerPic = bandPicture(meta.footerImage);
  const bandHeight = (lines: Line[]) => lines.reduce((h, l) => h + lineHeight(l.size), 0);
  /** A band's picture, then its text below it. */
  const bandTotal = (lines: Line[], pic: { h: number } | null) => (pic ? pic.h + (lines.length ? BAND_GAP : 0) : 0) + bandHeight(lines);
  const headerH = bandTotal(headerLines, headerPic);
  const footerH = bandTotal(footerLines, footerPic);
  const contentTop = MARGIN + (headerH ? headerH + BODY : 0);
  const contentBottom = PAGE_H - MARGIN - (footerH ? footerH + BODY : 0);

  let page = 0;
  let y = contentTop;
  let pendingMargin = 0;
  // A table cell is laid out in a frame (inFrame): at the origin, with no page
  // breaks, so its height is known before its row is placed on a page.
  let frameTop = contentTop;
  let breaks = true;
  const atTop = () => y === frameTop;
  const newPage = () => {
    page++;
    y = contentTop;
    pendingMargin = 0;
  };
  const openBlock = (marginTop: number) => {
    if (!atTop()) y += Math.max(pendingMargin, marginTop);
    pendingMargin = 0;
  };

  /** Place lines at `left`; each line becomes positioned fragments (same style and group merged). */
  const placeLines = (lines: Line[], left: number, flow: boolean, onPage = page, top = y): Frag[] => {
    const frags: Frag[] = [];
    let lineTop = top;
    for (const line of lines) {
      const height = lineHeight(line.size);
      if (flow) {
        if (breaks && y + height > contentBottom && !atTop()) newPage();
        lineTop = y;
        onPage = page;
      }
      const baseline = lineTop + (height - (ASCENT + DESCENT) * line.size) / 2 + ASCENT * line.size;
      let x = left;
      for (const atom of line.atoms) {
        const last = frags[frags.length - 1];
        if (last && last.page === onPage && last.y === baseline && last.group === atom.group && sameStyle(last.style, atom.style)) {
          last.text += atom.text;
          last.width += atom.width;
        } else {
          frags.push({ page: onPage, x, y: baseline, top: lineTop, height, width: atom.width, text: atom.text, style: atom.style, group: atom.group });
        }
        x += atom.width;
      }
      if (flow) y += height;
      else lineTop += height;
    }
    return frags;
  };

  /** A paragraph or heading as an element: text in groups, links and language spans as child elements. */
  const textBlock = (type: string, groups: Group[], frags: Frag[]): Elem => {
    const elem: Elem = { type, options: {}, children: [] };
    groups.forEach((group, index) => {
      const own = frags.filter((f) => f.group === index);
      if (!own.length) return;
      const content: Content = { kind: 'text', frags: own };
      if (group.href) {
        const link: Elem = { type: 'Link', options: group.lang ? { lang: group.lang } : {}, href: group.href, children: [content] };
        elem.children.push(link);
      } else if (group.lang) {
        elem.children.push({ type: 'Span', options: { lang: group.lang }, children: [content] });
      } else {
        elem.children.push(content);
      }
    });
    return elem;
  };

  /** Lay out `fn` in a frame at the origin with no page breaks: its height,
   *  and elements that `shift` then moves into place. */
  const inFrame = <T,>(fn: () => T): { result: T; height: number } => {
    const saved = { y, page, pendingMargin, frameTop, breaks };
    y = 0;
    page = 0;
    pendingMargin = 0;
    frameTop = 0;
    breaks = false;
    try {
      const result = fn();
      return { result, height: y };
    } finally {
      ({ y, page, pendingMargin, frameTop, breaks } = saved);
    }
  };

  /** Move laid-out elements down by `dy` onto page `onPage`. */
  const shift = (items: (Elem | Content)[], dy: number, onPage: number) => {
    for (const item of items) {
      if ('type' in item) {
        const b = item.options.bbox;
        if (b) item.options.bbox = [b[0], b[1] + dy, b[2], b[3] + dy];
        shift(item.children, dy, onPage);
      } else if (item.kind === 'text') {
        for (const f of item.frags) { f.y += dy; f.top += dy; f.page = onPage; }
      } else if (item.kind === 'image') {
        item.top += dy;
        item.page = onPage;
      } else {
        item.top += dy;
        item.page = onPage;
        item.label.y += dy;
        item.label.top += dy;
        item.label.page = onPage;
      }
    }
  };

  /** Cell rules, and header rows redrawn on each later page a table reaches. */
  const cellBoxes: { page: number; x: number; top: number; w: number; h: number }[] = [];
  const repeatedHeaders: Frag[] = [];

  const pictureOf = (node: PMNode) => openPicture(node.attrs.image);

  const blockNode = (node: PMNode, left: number, width: number, depth: number, label?: (firstLine: Frag | undefined) => Elem, bold = false): Elem[] => {
    const name = node.type.name;
    if (name === 'paragraph' || name === 'heading') {
      const level = name === 'heading' ? Math.min(6, Math.max(1, Number(node.attrs.level) || 1)) : 0;
      const size = level ? (HEADING_PX[level] ?? BODY_PX) * PT : BODY;
      const margin = level ? (HEADING_MARGIN_EM[level] ?? 1) * size : size;
      const inset = (Number(node.attrs.indent) || 0) * 2 * size;
      const { runs, groups } = inline(node, baseStyle(size, level > 0 || bold));
      const lines = breakLines(runs, width - inset, size);
      openBlock(margin);
      if (level && !atTop()) {
        // Keep a heading with the first line after it.
        const need = lines.reduce((h, l) => h + lineHeight(l.size), 0) + margin + lineHeight(BODY);
        if (breaks && y + need > contentBottom) newPage();
      }
      const frags = placeLines(lines, left + inset, true);
      pendingMargin = margin;
      const elem = textBlock(level ? `H${level}` : 'P', groups, frags);
      return label ? [label(frags[0]), elem] : [elem];
    }
    if (name === 'figure') {
      const alt = String(node.attrs.alt ?? '');
      const picture = pictureOf(node);
      if (picture) {
        // Its chosen share of the column, or its own size (CSS px) no wider
        // than the column; no taller than a page (half a page in a table
        // cell, whose row can't break); placed as aligned.
        const natW = (Number(node.attrs.width) || picture.displayW) * PT;
        const natH = (Number(node.attrs.height) || picture.displayH) * PT;
        const size = figureSize(node.attrs.size);
        let w = size ? width * SIZE_FRACTION[size] : Math.min(natW, width);
        let h = (w * natH) / natW;
        const maxH = (contentBottom - contentTop) / (breaks ? 1 : 2);
        if (h > maxH) { h = maxH; w = (h * natW) / natH; }
        openBlock(FIGURE_MARGIN);
        if (breaks && y + h > contentBottom && !atTop()) newPage();
        const top = y;
        const x = left + (width - w) * ALIGN_FRACTION[figureAlign(node.attrs.align)];
        y += h;
        pendingMargin = FIGURE_MARGIN;
        // No alt means no /Alt, exactly as the checker reported.
        const figure: Elem = { type: 'Figure', options: { bbox: [x, top, x + w, top + h], ...(alt.trim() ? { alt } : {}) }, children: [] };
        figure.children.push({ kind: 'image', page, x, top, width: w, height: h, image: picture.image });
        return [figure];
      }
      const text = `Image: ${String(node.attrs.label ?? '')}`;
      const style = baseStyle(BODY, false);
      needGlyphs(text, 'regular');
      const lines = breakLines([{ text, style, group: 0 }], width - 2 * FIGURE_PAD, BODY);
      const height = 2 * (FIGURE_PAD + FIGURE_BORDER) + bandHeight(lines);
      openBlock(FIGURE_MARGIN);
      if (breaks && y + height > contentBottom && !atTop()) newPage();
      const top = y;
      const labelFrags = placeLines(lines, left, false, page, top + FIGURE_BORDER + FIGURE_PAD);
      // Centred, like the placeholder's text-align.
      for (const f of labelFrags) f.x += (width - f.width) / 2;
      y += height;
      pendingMargin = FIGURE_MARGIN;
      // No alt means no /Alt: the figure is exactly as unlabelled as the
      // checker reported, never papered over with the placeholder label.
      const figure: Elem = { type: 'Figure', options: { bbox: [left, top, left + width, top + height], ...(alt.trim() ? { alt } : {}) }, children: [] };
      figure.children.push({ kind: 'figure', page, x: left, top, width, height, label: labelFrags[0]! });
      return [figure];
    }
    if (name === 'bullet_list' || name === 'ordered_list') {
      const ordered = name === 'ordered_list';
      const start = Number(node.attrs.order ?? 1) || 1;
      // Collapses with the first item's own margin, as CSS margins do.
      pendingMargin = Math.max(pendingMargin, depth ? 0 : BODY);
      const list: Elem = { type: 'L', options: {}, attributes: { O: 'List', ListNumbering: ordered ? 'Decimal' : 'Disc' }, children: [] };
      node.forEach((item, _, index) => {
        const labelText = ordered ? `${start + index}.` : BULLET;
        const li: Elem = { type: 'LI', options: {}, children: [] };
        const body: Elem = { type: 'LBody', options: {}, children: [] };
        const makeLabel = (firstLine: Frag | undefined): Elem => {
          const style = baseStyle(BODY, false);
          const w = widthOf(labelText, style);
          const anchor = firstLine ?? { page, y, top: y, height: lineHeight(BODY) };
          const frag: Frag = { page: anchor.page, x: left + LIST_INSET - LABEL_GAP - w, y: anchor.y, top: anchor.top, height: anchor.height, width: w, text: labelText, style, group: 0 };
          return { type: 'Lbl', options: {}, children: [{ kind: 'text', frags: [frag] }] };
        };
        item.forEach((child, __, childIndex) => {
          const elems = blockNode(child, left + LIST_INSET, width - LIST_INSET, depth + 1, childIndex === 0 ? makeLabel : undefined, bold);
          for (const elem of elems) (elem.type === 'Lbl' ? li : body).children.push(elem);
        });
        li.children.push(body);
        list.children.push(li);
      });
      pendingMargin = Math.max(pendingMargin, depth ? 0 : BODY);
      return [list];
    }
    if (name === 'table') return [tableElem(node, left, width, depth)];
    return [];
  };

  /**
   * A table: Table > [Caption] > TR > TH | TD. Each cell is laid out in a
   * frame to learn its height; a row is as tall as its tallest cell, and rows
   * joined by a rowspan move to a new page together. Header rows the table
   * leads with are drawn again, as pagination artifacts, on every later page.
   * ponytail: a row group taller than a page can't be kept together, so its
   * cells are stacked one after another in the flow instead (tags unchanged,
   * rules left out). Upgrade trigger: a real document that hits it.
   */
  const tableElem = (node: PMNode, left: number, width: number, depth: number): Elem => {
    const map = TableMap.get(node);
    const table: Elem = { type: 'Table', options: {}, children: [] };
    openBlock(BODY);
    const caption = String(node.attrs.caption ?? '').replace(/\s+/g, ' ').trim();
    if (caption) {
      const style = baseStyle(BODY, true);
      needGlyphs(caption, style.face);
      const frags = placeLines(breakLines([{ text: caption, style, group: 0 }], width, BODY), left, true);
      y += CELL_PAD_Y;
      table.children.push({ type: 'Caption', options: {}, children: [{ kind: 'text', frags }] });
    }

    interface Cell { node: PMNode; row: number; rect: Rect; header: boolean }
    const cells: Cell[] = [];
    const px: (number | null)[] = Array.from({ length: map.width }, () => null);
    node.forEach((row, rowOffset, r) => {
      row.forEach((cell, cellOffset) => {
        const rect = map.findCell(rowOffset + 1 + cellOffset);
        cells.push({ node: cell, row: r, rect, header: cell.type.name === 'table_header' });
        const widths = cell.attrs.colwidth as unknown;
        if (Array.isArray(widths)) widths.forEach((w, i) => { if (Number(w) > 0 && px[rect.left + i] == null) px[rect.left + i] = Number(w); });
      });
    });
    // Word's column widths, in proportion, when every column has one; else equal.
    const known = px.every((v) => v != null);
    const total = known ? px.reduce<number>((sum, v) => sum + (v ?? 0), 0) : 0;
    const colX = [left];
    for (const v of px) colX.push(colX[colX.length - 1]! + (known && total > 0 ? ((v ?? 0) / total) * width : width / map.width));

    const cellBox = (c: Cell) => ({ x: colX[c.rect.left]!, w: colX[c.rect.right]! - colX[c.rect.left]! });
    const cellContent = (c: Cell): Elem[] => {
      const { x, w } = cellBox(c);
      const out: Elem[] = [];
      c.node.forEach((child) => out.push(...blockNode(child, x + CELL_PAD_X, w - 2 * CELL_PAD_X, depth + 1, undefined, c.header)));
      return out;
    };
    const laid = cells.map((c) => {
      const { result, height } = inFrame(() => cellContent(c));
      return { ...c, elems: result, height: Math.max(height, lineHeight(BODY)) + 2 * CELL_PAD_Y };
    });

    const rows = map.height;
    const rowH: number[] = Array.from({ length: rows }, () => lineHeight(BODY) + 2 * CELL_PAD_Y);
    const sum = (a: number, b: number) => rowH.slice(a, b + 1).reduce((s2, h) => s2 + h, 0);
    for (const c of laid) if (c.rect.bottom - c.rect.top === 1) rowH[c.rect.top] = Math.max(rowH[c.rect.top]!, c.height);
    for (const c of laid) {
      if (c.rect.bottom - c.rect.top < 2) continue;
      const have = sum(c.rect.top, c.rect.bottom - 1);
      if (c.height > have) rowH[c.rect.bottom - 1]! += c.height - have;
    }
    // Rows joined by a rowspan are one group: never split across pages.
    const groups: [number, number][] = [];
    for (let a = 0; a < rows;) {
      let b = a;
      for (let r = a; r <= b; r++) for (const c of laid) if (c.rect.top === r) b = Math.max(b, c.rect.bottom - 1);
      groups.push([a, b]);
      a = b + 1;
    }
    const headRows = leadingHeaderRows(node);
    const repeatable = headRows > 0 && groups.some(([, b]) => b === headRows - 1);
    const headH = repeatable ? sum(0, headRows - 1) : 0;

    const trs: Elem[] = Array.from({ length: rows }, () => ({ type: 'TR', options: {}, children: [] }));
    const cellElem = (c: Cell, children: Elem[]): Elem => {
      const attributes: Record<string, string | number> = {};
      if (c.header) Object.assign(attributes, { O: 'Table', Scope: headerScope(node, c.row, c.rect.left) === 'row' ? 'Row' : 'Column' });
      const rs = c.rect.bottom - c.rect.top;
      const cs = c.rect.right - c.rect.left;
      if (rs > 1) Object.assign(attributes, { O: 'Table', RowSpan: rs });
      if (cs > 1) Object.assign(attributes, { O: 'Table', ColSpan: cs });
      return { type: c.header ? 'TH' : 'TD', options: {}, ...(Object.keys(attributes).length ? { attributes } : {}), children };
    };
    const rowTop: number[] = [];
    const repeats: { page: number; top: number }[] = [];
    for (const [a, b] of groups) {
      const h = sum(a, b);
      if (y + h > contentBottom && !atTop()) {
        newPage();
        if (repeatable && a >= headRows && headH + h <= contentBottom - y) {
          repeats.push({ page, top: y });
          y += headH;
        }
      }
      const group = laid.filter((c) => c.rect.top >= a && c.rect.top <= b);
      if (y + h > contentBottom) {
        // Taller than a page: stacked in the flow (see above).
        for (const c of group) trs[c.row]!.children.push(cellElem(c, cellContent(c)));
        pendingMargin = BODY;
        continue;
      }
      for (let r = a, top = y; r <= b; r++) { rowTop[r] = top; top += rowH[r]!; }
      for (const c of group) {
        const { x, w } = cellBox(c);
        const top = rowTop[c.rect.top]!;
        shift(c.elems, top + CELL_PAD_Y, page);
        cellBoxes.push({ page, x, top, w, h: sum(c.rect.top, c.rect.bottom - 1) });
        trs[c.row]!.children.push(cellElem(c, c.elems));
      }
      y += h;
    }
    // The header rows again on each page the table continued onto.
    for (const rep of repeats) {
      for (const c of laid.filter((cell) => cell.rect.bottom <= headRows)) {
        const dy = rep.top - rowTop[0]!;
        const { x, w } = cellBox(c);
        cellBoxes.push({ page: rep.page, x, top: rowTop[c.rect.top]! + dy, w, h: sum(c.rect.top, c.rect.bottom - 1) });
        const frags: Frag[] = [];
        const gather = (items: (Elem | Content)[]) => items.forEach((i) => ('type' in i ? gather(i.children) : i.kind === 'text' ? frags.push(...i.frags) : undefined));
        gather(c.elems);
        for (const f of frags) repeatedHeaders.push({ ...f, page: rep.page, y: f.y + dy, top: f.top + dy });
      }
    }
    table.children.push(...trs);
    pendingMargin = BODY;
    return table;
  };

  /* ---------- compose ---------- */

  const root: Elem[] = [];
  type BandPic = NonNullable<ReturnType<typeof bandPicture>>;
  const bandElem = (lines: Line[], pic: BandPic | null, top: number, onPage: number): Elem => {
    const children: Elem[] = [];
    // No alt means no /Alt, exactly as the checker reported.
    if (pic) children.push({ type: 'Figure', options: { bbox: [MARGIN, top, MARGIN + pic.w, top + pic.h], ...(pic.alt ? { alt: pic.alt } : {}) }, children: [{ kind: 'image', page: onPage, x: MARGIN, top, width: pic.w, height: pic.h, image: pic.image }] });
    if (lines.length) children.push({ type: 'P', options: {}, children: [{ kind: 'text', frags: placeLines(lines, MARGIN, false, onPage, top + (pic ? pic.h + BAND_GAP : 0)) }] });
    return { type: 'Div', options: {}, children };
  };
  /** A band again on a later page: decoration, drawn but never read. */
  const drawBand = (lines: Line[], pic: BandPic | null, top: number, p: number) => {
    if (pic) pdf.image(pic.image as unknown as string, MARGIN, top, { width: pic.w, height: pic.h });
    placeLines(lines, MARGIN, false, p, top + (pic ? pic.h + BAND_GAP : 0)).forEach(drawText);
  };
  doc.forEach((node) => root.push(...blockNode(node, MARGIN, PAGE_W - 2 * MARGIN, 0)));
  const pageCount = page + 1;

  if (missing.size) return { ok: false, missing: [...missing] };

  // The header is read once, before the content, on the first page; the
  // footer once, after it, on the last. Every other repeat is a pagination
  // artifact, which assistive technology skips.
  const footerTop = PAGE_H - MARGIN - footerH;
  if (headerH) root.unshift(bandElem(headerLines, headerPic, MARGIN, 0));
  if (footerH) root.push(bandElem(footerLines, footerPic, footerTop, pageCount - 1));

  /* ---------- draw ---------- */

  const allFrags: Frag[] = [];
  const collect = (elem: Elem | Content) => {
    if ('type' in elem) elem.children.forEach(collect);
    else if (elem.kind === 'text') allFrags.push(...elem.frags);
  };
  root.forEach(collect);

  /** Width without a line's trailing space, for underlines, highlights and link areas. */
  const textWidth = (f: Frag) => {
    const trailing = f.text.length - f.text.trimEnd().length;
    return trailing ? f.width - trailing * widthOf(' ', f.style) : f.width;
  };

  const drawText = (f: Frag) => {
    pdf.font(f.style.face).fontSize(f.style.size).fillColor([...f.style.color]).text(f.text, f.x, f.y, { lineBreak: false, baseline: 'alphabetic' });
  };

  const artifact = (draw: () => void, type?: 'Pagination') => {
    pdf.markContent('Artifact', type ? { type } : {});
    draw();
    pdf.endMarkedContent();
  };

  const drawPageArtifacts = (p: number) => {
    const onPage = allFrags.filter((f) => f.page === p);
    // Highlights behind the text; underlines are decoration, not content.
    const highlighted = onPage.filter((f) => f.style.highlight);
    if (highlighted.length) artifact(() => { for (const f of highlighted) pdf.rect(f.x, f.top, textWidth(f), f.height).fill([...f.style.highlight!]); });
    const underlined = onPage.filter((f) => f.style.underline && f.text.trim());
    if (underlined.length) {
      artifact(() => {
        for (const f of underlined) {
          const thickness = Math.max(0.5, f.style.size / 16);
          const lineY = f.y + f.style.size * 0.12;
          pdf.save().lineWidth(thickness).strokeColor([...f.style.color]).moveTo(f.x, lineY).lineTo(f.x + textWidth(f), lineY).stroke().restore();
        }
      });
    }
    const boxes = cellBoxes.filter((b) => b.page === p);
    if (boxes.length) {
      artifact(() => {
        pdf.save().lineWidth(CELL_RULE).strokeColor([...hex(PAGE_TEXT, [0, 0, 0])]);
        for (const b of boxes) pdf.rect(b.x, b.top, b.w, b.h).stroke();
        pdf.restore();
      });
    }
    const repeated = repeatedHeaders.filter((f) => f.page === p);
    if (repeated.length) artifact(() => repeated.forEach(drawText), 'Pagination');
    if (headerH && p !== 0) artifact(() => drawBand(headerLines, headerPic, MARGIN, p), 'Pagination');
    if (footerH && p !== pageCount - 1) artifact(() => drawBand(footerLines, footerPic, footerTop, p), 'Pagination');
  };

  let drawnPage = 0;
  drawPageArtifacts(0);
  const goTo = (p: number) => {
    while (drawnPage < p) {
      pdf.addPage({ size: [PAGE_W, PAGE_H], margin: 0 });
      drawnPage++;
      drawPageArtifacts(drawnPage);
    }
  };

  type StructElement = ReturnType<typeof pdf.struct>;
  const emit = (item: Elem | Content, parent: StructElement, elem: Elem | null) => {
    if ('type' in item) {
      const struct = pdf.struct(item.type, item.options);
      if (item.attributes) (struct as unknown as { dictionary: { data: Record<string, unknown> } }).dictionary.data.A = item.attributes;
      parent.add(struct);
      for (const child of item.children) emit(child, struct, item);
      struct.end();
      return;
    }
    if (item.kind === 'image') {
      goTo(item.page);
      parent.add(() => { pdf.image(item.image as unknown as string, item.x, item.top, { width: item.width, height: item.height }); });
      return;
    }
    if (item.kind === 'figure') {
      goTo(item.page);
      parent.add(() => {
        pdf.save().lineWidth(FIGURE_BORDER).dash(3 * FIGURE_BORDER, { space: 2 * FIGURE_BORDER }).strokeColor([...hex(PAGE_TEXT, [0, 0, 0])])
          .rect(item.x + FIGURE_BORDER / 2, item.top + FIGURE_BORDER / 2, item.width - FIGURE_BORDER, item.height - FIGURE_BORDER).stroke().undash().restore();
        drawText(item.label);
      });
      return;
    }
    // One marked-content sequence per page the text spans.
    const pages = [...new Set(item.frags.map((f) => f.page))];
    for (const p of pages) {
      const frags = item.frags.filter((f) => f.page === p);
      goTo(p);
      parent.add(() => frags.forEach(drawText));
      if (elem?.href) {
        const text = item.frags.map((f) => f.text).join('').trim();
        for (const f of frags) {
          if (!f.text.trim()) continue;
          // /Contents is the link's description for PDF/UA (7.18.5).
          pdf.link(f.x, f.top, textWidth(f), f.height, elem.href, { structParent: parent, Contents: new String(text) } as unknown as Record<string, never>);
        }
      }
    }
  };

  // The root element repeats the catalog's /Lang. Agenda platforms that merge
  // files into one packet were seen dropping the catalog entry while keeping
  // each file's structure tree (docs/audit/agenda-platforms-2026-10.md).
  const documentElem = pdf.struct('Document', { lang });
  pdf.addStructure(documentElem);
  for (const elem of root) emit(elem, documentElem, null);
  documentElem.end();
  goTo(pageCount - 1);

  const bytes = toBytes(pdf);
  pdf.end();
  return { ok: true, bytes: await bytes, pages: pageCount };
}

/**
 * PDFKit's PDF/UA mode borrows PDF/A-1's font rules and writes a CIDSet
 * (the list of glyphs a subset font holds), but its list leaves out glyphs
 * the subset carries, which fails PDF/UA-1 7.21.4.2. PDF/UA doesn't require
 * a CIDSet at all, only that one present be complete, so the fonts are
 * embedded without it.
 * ponytail: patches PDFKit's private font embedding. Upgrade trigger: a PDFKit
 * release whose CIDSet passes veraPDF 7.21.4.2 (scripts/verify-pdf.mjs).
 */
function omitCidSets(pdf: PDFKit.PDFDocument) {
  const doc = pdf as unknown as { subset?: number; _fontFamilies: Record<string, { embed: () => void }> };
  const end = pdf.end.bind(pdf);
  // Every font the document uses exists by end(), which is where PDFKit embeds them.
  pdf.end = () => {
    for (const font of Object.values(doc._fontFamilies)) {
      const embed = font.embed.bind(font);
      font.embed = () => {
        const subset = doc.subset;
        delete doc.subset;
        try {
          embed();
        } finally {
          if (subset !== undefined) doc.subset = subset;
        }
      };
    }
    end();
  };
}

/**
 * PDFKit copies the info entries into the XMP metadata as raw text, so a
 * title like "Parks & Recreation" made the XMP malformed XML, which fails
 * PDF/UA. The XMP is written from an XML-escaped copy; the info dictionary,
 * written before it as PDF strings, keeps the title as written.
 * ponytail: patches PDFKit's private _addInfo. Upgrade trigger: a PDFKit
 * release that escapes XMP values (scripts/verify-pdf.mjs).
 */
function escapeXmpInfo(pdf: PDFKit.PDFDocument) {
  const doc = pdf as unknown as { info: Record<string, unknown>; _addInfo: () => void };
  const addInfo = doc._addInfo.bind(doc);
  doc._addInfo = () => {
    const info = doc.info;
    doc.info = Object.fromEntries(Object.entries(info).map(([key, value]) => [key, typeof value === 'string' ? xmlText(value) : value]));
    try {
      addInfo();
    } finally {
      doc.info = info;
    }
  };
}

const xmlText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function sameStyle(a: Style, b: Style) {
  return a.face === b.face && a.size === b.size && a.underline === b.underline && String(a.color) === String(b.color) && String(a.highlight) === String(b.highlight);
}
