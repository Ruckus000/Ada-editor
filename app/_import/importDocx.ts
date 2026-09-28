import { Fragment } from 'prosemirror-model';
import type { Mark, Node as PMNode } from 'prosemirror-model';
import { mapText, safeHref, schema, withoutPageLanguage } from '../_editor/editorSchema';
import { readZip, ZipError, MAX_ZIP_BYTES } from './unzip';
import { contrastRatio, parseColour } from '../_engine/contrast';
import { LISTED_ALPHABET_LANGUAGES, alphabetLanguages, isUsableLangTag, primaryTag } from '../_engine/textHelpers';

/**
 * Import a .docx into the editor's document model, in the browser.
 *
 * The file itself is never uploaded — a document someone is checking for
 * accessibility is often not public yet. Only the document built from it is
 * saved: to this browser in local mode, to the signed-in account otherwise.
 *
 * The import is FAITHFUL, never repairing: a bold paragraph that looks like a
 * heading stays a paragraph, and a list typed with "•" and tabs stays text,
 * because the checker exists to report exactly those problems. Whatever the
 * schema cannot hold is reported in `notes` rather than dropped silently.
 *
 * Everything read from the file is untrusted: ids live in Maps (a styleId of
 * "__proto__" is just a string), links pass through safeHref, text only ever
 * becomes PM text nodes, and the walk stops past a node budget.
 */

export class ImportError extends Error {
  constructor(readonly userMessage: string) {
    super(userMessage);
  }
}

export interface ImportedDoc {
  title: string;
  header: string;
  footer: string;
  content: PMNode;
  /** Plain-language notes about what the editor could not hold. */
  notes: string[];
}

export type ParseXml = (xml: string) => Document;

const MESSAGES = {
  notDocx: 'This file isn’t a .docx. If it’s an older .doc file or a password-protected document, save it in Word as a Word Document (.docx) without a password and try again.',
  damaged: 'This .docx couldn’t be read. It may be damaged; try opening it in Word and saving it again.',
  tooLarge: `This file is too large to import. The limit is ${MAX_ZIP_BYTES / 1024 / 1024} MB.`,
  tooComplex: 'This document is too large to import.',
  strict: 'This file uses Strict Open XML. Save it in Word as a standard Word Document (.docx) and try again.',
} as const;

/** Elements visited across the walk: a cap on work, whatever the byte size. */
const MAX_ELEMENTS = 400_000;
const MAX_ALT = 2000;
const MAX_TITLE = 200;
const MAX_BAND = 500;

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const STRICT_NS = 'http://purl.oclc.org/ooxml/';
const FALSE_VALS = new Set(['0', 'false', 'off', 'none']);
const HEX6 = /^[0-9a-f]{6}$/i;
/** Word's fixed highlight palette (ST_HighlightColor); `none` is simply absent. */
const WORD_HIGHLIGHT = new Map<string, string>([
  ['black', '#000000'], ['blue', '#0000ff'], ['cyan', '#00ffff'], ['green', '#00ff00'],
  ['magenta', '#ff00ff'], ['red', '#ff0000'], ['yellow', '#ffff00'], ['white', '#ffffff'],
  ['darkBlue', '#000080'], ['darkCyan', '#008080'], ['darkGreen', '#008000'], ['darkMagenta', '#800080'],
  ['darkRed', '#800000'], ['darkYellow', '#808000'], ['darkGray', '#808080'], ['lightGray', '#c0c0c0'],
]);

type Rel = { type: string; target: string; external: boolean };
type ListKind = 'bullet' | 'ordered';
type ListInfo = { kind: ListKind; ilvl: number };
/** `src` is the source paragraph's serial: an image inside a list paragraph stays in that item. */
type Block = { node: PMNode; list: ListInfo | null; src: number };

/* ---------- element helpers ---------- */

// ponytail: elements are matched by qualified name ('w:p') with the prefixes
// Word, LibreOffice, Google Docs, pandoc and TextEdit all write; linkedom (the
// Node test DOM) has no namespace support, so this is also what keeps one walk
// testable in both. Upgrade trigger: a real file with other prefixes — resolve
// prefixes from the root's xmlns declarations.
const kids = (el: Element): Element[] => {
  const out: Element[] = [];
  for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1) out.push(n as Element);
  return out;
};
const child = (el: Element | null | undefined, tag: string): Element | null =>
  (el && kids(el).find((k) => k.tagName === tag)) || null;
const val = (el: Element | null | undefined, name = 'w:val'): string | null => el?.getAttribute(name) ?? null;
const first = (el: Element, tag: string): Element | null => el.getElementsByTagName(tag)[0] ?? null;
/** Every descendant element (linkedom has no getElementsByTagName('*')). */
const descendants = (el: Element): Element[] => kids(el).flatMap((k) => [k, ...descendants(k)]);
const on = (el: Element | null): boolean => !!el && !FALSE_VALS.has((val(el) ?? 'true').toLowerCase());

/** Resolve a relationship target against the directory of the part that owns it. */
function resolvePart(dir: string, target: string): string {
  const parts = (target.startsWith('/') ? target.slice(1) : `${dir}${target}`).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  return out.join('/');
}
const dirOf = (part: string) => part.slice(0, part.lastIndexOf('/') + 1);
const relsPathOf = (part: string) => `${dirOf(part)}_rels/${part.slice(part.lastIndexOf('/') + 1)}.rels`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/* ---------- import ---------- */

export async function importDocx(bytes: Uint8Array, fileName: string, parseXml: ParseXml): Promise<ImportedDoc> {
  let zip;
  try {
    zip = readZip(bytes);
  } catch (error) {
    throw toImportError(error);
  }

  const xml = async (name: string): Promise<Document | null> => {
    let text: string | null;
    try {
      text = await zip.text(name);
    } catch (error) {
      throw toImportError(error);
    }
    if (text === null) return null;
    // No OOXML part carries a DTD; refusing one closes entity-expansion tricks
    // whatever the XML parser's own limits are.
    if (/<!DOCTYPE/i.test(text)) throw new ImportError(MESSAGES.damaged);
    const doc = parseXml(text);
    if (!doc.documentElement || doc.getElementsByTagName('parsererror').length) throw new ImportError(MESSAGES.damaged);
    return doc;
  };

  const relsOf = async (part: string): Promise<Map<string, Rel>> => {
    const map = new Map<string, Rel>();
    const doc = await xml(relsPathOf(part));
    if (!doc) return map;
    const dir = dirOf(part);
    for (const r of Array.from(doc.getElementsByTagName('Relationship'))) {
      const id = r.getAttribute('Id');
      const target = r.getAttribute('Target') ?? '';
      const external = r.getAttribute('TargetMode') === 'External';
      if ((r.getAttribute('Type') ?? '').startsWith(STRICT_NS)) throw new ImportError(MESSAGES.strict);
      if (id) map.set(id, { type: r.getAttribute('Type') ?? '', target: external ? target : resolvePart(dir, target), external });
    }
    return map;
  };
  const byType = (rels: Map<string, Rel>, type: string) => [...rels.values()].find((r) => r.type === REL + type && !r.external);

  const rootRels = await relsOf('');
  const mainPart = byType(rootRels, 'officeDocument')?.target;
  const main = mainPart ? await xml(mainPart) : null;
  const body = main ? first(main.documentElement, 'w:body') : null;
  if (!mainPart || !body) throw new ImportError(MESSAGES.notDocx);
  const rels = await relsOf(mainPart);

  const stylesPart = byType(rels, 'styles')?.target;
  const numberingPart = byType(rels, 'numbering')?.target;
  const corePart = [...rootRels.values()].find((r) => r.type.endsWith('/metadata/core-properties'))?.target;
  const styles = readStyles(stylesPart ? await xml(stylesPart) : null);
  const numbering = readNumbering(numberingPart ? await xml(numberingPart) : null, styles);
  const core = corePart ? await xml(corePart) : null;

  const walker = new Walker(rels, styles, numbering);
  const blocks = walker.blocks(body);

  const sectPr = child(body, 'w:sectPr');
  const band = async (tag: 'w:headerReference' | 'w:footerReference') => {
    const ref = sectPr && kids(sectPr).find((k) => k.tagName === tag && (val(k, 'w:type') ?? 'default') === 'default');
    const rel = ref ? rels.get(val(ref, 'r:id') ?? '') : undefined;
    const doc = rel && !rel.external ? await xml(rel.target) : null;
    return doc ? bandText(doc.documentElement, styles, numbering) : '';
  };

  const coreTitle = core ? (first(core.documentElement, 'dc:title')?.textContent ?? '').replace(/\s+/g, ' ').trim() : '';
  // ponytail: dc:title first, as Word's own "Title" property is what a tagged
  // PDF displays; a stale template title is possible. Upgrade trigger: users
  // report wrong titles — offer a rename on the editor screen.
  const title = (coreTitle || fileName.replace(/\.docx$/i, '').trim() || 'Untitled document').slice(0, MAX_TITLE);

  return {
    title,
    header: await band('w:headerReference'),
    footer: await band('w:footerReference'),
    content: assemble(blocks),
    notes: walker.notes(),
  };
}

function toImportError(error: unknown): ImportError {
  if (error instanceof ImportError) return error;
  if (error instanceof ZipError) {
    if (error.message === 'not-zip') return new ImportError(MESSAGES.notDocx);
    if (error.message === 'too-large') return new ImportError(MESSAGES.tooLarge);
    if (error.message === 'part-too-large') return new ImportError(MESSAGES.tooComplex);
  }
  return new ImportError(MESSAGES.damaged);
}

/* ---------- styles and numbering ---------- */

interface StyleInfo { name: string; basedOn: string | null; outlineLvl: number | null; numId: string | null; ilvl: number | null }
interface Styles {
  heading(styleId: string | null): number | null;
  numPr(styleId: string | null): { numId: string; ilvl: number } | null;
  /** The document default's w:lang (docDefaults), for runs that set none. */
  defaultLang: Element | null;
}

function readStyles(doc: Document | null): Styles {
  const map = new Map<string, StyleInfo>();
  for (const s of doc ? Array.from(doc.getElementsByTagName('w:style')) : []) {
    const id = s.getAttribute('w:styleId');
    // Paragraph styles carry headings and lists; numbering styles are what a
    // list definition's numStyleLink points at.
    const type = s.getAttribute('w:type');
    if (!id || (type !== 'paragraph' && type !== 'numbering')) continue;
    const pPr = child(s, 'w:pPr');
    const numPr = child(pPr, 'w:numPr');
    const lvl = val(child(pPr, 'w:outlineLvl'));
    map.set(id, {
      name: (val(child(s, 'w:name')) ?? '').toLowerCase(),
      basedOn: val(child(s, 'w:basedOn')),
      outlineLvl: lvl === null ? null : Number(lvl),
      numId: val(child(numPr, 'w:numId')),
      ilvl: numPr ? Number(val(child(numPr, 'w:ilvl')) ?? 0) : null,
    });
  }
  /** The style and its basedOn ancestors, nearest first; cycles and runaway chains stop. */
  const chain = (id: string | null): StyleInfo[] => {
    const out: StyleInfo[] = [];
    const seen = new Set<string>();
    while (id && !seen.has(id) && out.length < 20) {
      seen.add(id);
      const s = map.get(id);
      if (!s) break;
      out.push(s);
      id = s.basedOn;
    }
    return out;
  };
  return {
    heading(id) {
      for (const s of chain(id)) {
        if (s.name === 'title') return 1;
        const m = /^heading ([1-9])$/.exec(s.name);
        if (m) return headingLevel(Number(m[1]) - 1);
        if (s.outlineLvl !== null) return headingLevel(s.outlineLvl);
      }
      return null;
    },
    numPr(id) {
      for (const s of chain(id)) if (s.numId !== null) return { numId: s.numId, ilvl: s.ilvl ?? 0 };
      return null;
    },
    defaultLang: child(child(child(doc ? first(doc.documentElement, 'w:docDefaults') : null, 'w:rPrDefault'), 'w:rPr'), 'w:lang'),
  };
}

/** outlineLvl is 0-based; 9 means body text. */
function headingLevel(outlineLvl: number): number | null {
  if (!Number.isInteger(outlineLvl) || outlineLvl < 0 || outlineLvl > 8) return null;
  // ponytail: Word headings 7-9 become h6 (HTML stops at six). Upgrade
  // trigger: a document that relies on them — keep the level and export aria-level.
  return Math.min(outlineLvl + 1, 6);
}

type Numbering = (numId: string, ilvl: number) => ListKind | null;

function readNumbering(doc: Document | null, styles: Styles): Numbering {
  const abstract = new Map<string, Map<number, string>>();
  /** abstractNum → the list style it defers to (w:numStyleLink), when it has no levels of its own. */
  const styleLinks = new Map<string, string>();
  const nums = new Map<string, string>();
  if (doc) {
    for (const a of Array.from(doc.getElementsByTagName('w:abstractNum'))) {
      const id = a.getAttribute('w:abstractNumId') ?? '';
      const levels = new Map<number, string>();
      for (const l of kids(a)) {
        if (l.tagName === 'w:lvl') levels.set(Number(l.getAttribute('w:ilvl') ?? 0), val(child(l, 'w:numFmt')) ?? 'decimal');
      }
      abstract.set(id, levels);
      const link = val(child(a, 'w:numStyleLink'));
      if (link) styleLinks.set(id, link);
    }
    for (const n of Array.from(doc.getElementsByTagName('w:num'))) {
      nums.set(n.getAttribute('w:numId') ?? '', val(child(n, 'w:abstractNumId')) ?? '');
    }
  }
  // ponytail: w:lvlOverride (per-list format overrides) is ignored; the
  // abstract definition decides bullet vs ordered. Upgrade trigger: a real
  // file whose list kind comes out wrong.
  const levelsOf = (numId: string): Map<number, string> | undefined => {
    const absId = nums.get(numId) ?? '';
    const own = abstract.get(absId);
    const link = styleLinks.get(absId);
    if ((!own || own.size === 0) && link) {
      // One hop: the list style's numPr names the num whose abstract holds the levels.
      const viaStyle = styles.numPr(link)?.numId;
      if (viaStyle && viaStyle !== numId) return abstract.get(nums.get(viaStyle) ?? '');
    }
    return own;
  };
  return (numId, ilvl) => {
    const fmt = levelsOf(numId)?.get(ilvl);
    if (fmt === undefined) return nums.has(numId) ? 'bullet' : null;
    if (fmt === 'none') return null;
    return fmt === 'bullet' ? 'bullet' : 'ordered';
  };
}

/* ---------- colours ---------- */

/** A shading layer's visible colour: a hex, 'unknown' (a pattern we can't resolve), or null (none). */
type Fill = string | 'unknown' | null;

/** w:shd: `clear`/absent shows its fill; `solid` shows its pattern colour; other patterns blend. */
function shadingFill(shd: Element | null): Fill {
  if (!shd) return null;
  const pattern = val(shd) ?? 'clear';
  if (pattern === 'nil') return null;
  const pick = (v: string | null): Fill => (!v || v === 'auto' ? (pattern === 'solid' ? '#000000' : null) : HEX6.test(v) ? `#${v.toLowerCase()}` : 'unknown');
  if (pattern === 'clear') return pick(val(shd, 'w:fill'));
  if (pattern === 'solid') return pick(val(shd, 'w:color'));
  return 'unknown';
}

/** Word's "automatic" text colour: black or white, whichever reads on the background. */
function automaticText(background: string): string {
  const bg = parseColour(background)!;
  return contrastRatio([0, 0, 0], bg) >= contrastRatio([255, 255, 255], bg) ? '#000000' : '#ffffff';
}

/* ---------- the body walk ---------- */

interface Field {
  phase: 'code' | 'result';
  instr: string;
  href: string | null;
  /** A legacy check-box form field (FORMCHECKBOX): its state, shown as a glyph at the field's end. */
  check: boolean | null;
  /** The field wrote result text itself, so no glyph is added. */
  emitted: boolean;
  /** A legacy text form field (FORMTEXT): a blank result imports underlined, as the line it is. */
  textInput: boolean;
}

/** Content-control types that make a w:sdt a form field (a check box's tag is w14:checkbox). */
const FORM_SDT = new Set(['w:text', 'w:dropDownList', 'w:comboBox', 'w:date']);

// ponytail: the box glyphs Word users type as check boxes, per exact font
// (Wingdings 3 and Webdings put arrows and pictures at the same codes). Every
// other symbol-font character stays dropped. Upgrade trigger: a file with other
// meaningful symbol-font characters.
const SYMBOL_BOXES = new Map<string, Map<number, string>>([
  ['wingdings', new Map([[0x6f, '\u2610'], [0xa8, '\u2610'], [0x71, '\u2751'], [0xfd, '\u2612'], [0xfe, '\u2611']])],
  ['wingdings 2', new Map([[0xa3, '\u2610'], [0x52, '\u2611'], [0x54, '\u2612']])],
]);
/** Fonts whose characters are pictures, not text, whichever way w:char is written. */
const SYMBOL_FONTS = new Set(['symbol', 'wingdings', 'wingdings 2', 'wingdings 3', 'webdings']);

class Walker {
  private visited = 0;
  private figures = 0;
  private paragraphs = 0;
  private counts = { tables: 0, decorative: 0, notes: 0, chunks: 0, tracked: 0, fields: 0 };
  /** Shading behind the current paragraph and table cell: what a run sits on when it has none of its own. */
  private paragraphFill: Fill = null;
  private cellFill: Fill = null;
  /**
   * Complex fields (fldChar begin/separate/end) open in the current paragraph.
   * Scoped per paragraph: a field whose end is missing (truncated, or its end
   * inside a tracked deletion) must not swallow the rest of the document. A
   * field spanning paragraphs (a table of contents) then shows its result text.
   */
  private fields: Field[] = [];

  constructor(private rels: Map<string, Rel>, private styles: Styles, private numbering: Numbering) {}

  notes(): string[] {
    const c = this.counts;
    const out: string[] = [];
    if (c.tables) out.push(`${plural(c.tables, 'table')} flattened into paragraphs; table structure isn’t checked yet.`);
    if (c.decorative) out.push(`${plural(c.decorative, 'decorative image')} marked in Word left out.`);
    if (c.notes) out.push(`${plural(c.notes, 'footnote or endnote', 'footnotes or endnotes')} not imported.`);
    if (c.chunks) out.push(`${plural(c.chunks, 'embedded document part')} not imported.`);
    if (c.tracked) out.push('Tracked changes were imported as if accepted.');
    if (c.fields) out.push(`${plural(c.fields, 'Word form field')} imported as plain text; ${c.fields === 1 ? 'it is' : 'they are'} not fillable here.`);
    return out;
  }

  /** A content control that is a form field (text box, check box, list, date) is counted for the import note. */
  private countFormSdt(sdt: Element) {
    const pr = child(sdt, 'w:sdtPr');
    // A control bound to a document property (the Title, Author and Date on
    // Word's built-in cover pages) is not a form someone fills in.
    if (!pr || child(pr, 'w:dataBinding')) return;
    if (kids(pr).some((k) => FORM_SDT.has(k.tagName) || k.tagName.endsWith(':checkbox'))) this.counts.fields++;
  }

  private tick() {
    if (++this.visited > MAX_ELEMENTS) throw new ImportError(MESSAGES.tooComplex);
  }

  /** Block-level content of a body, table cell, text box or content control. */
  blocks(container: Element): Block[] {
    const out: Block[] = [];
    for (const el of kids(container)) {
      this.tick();
      switch (el.tagName) {
        case 'w:p': out.push(...this.paragraph(el)); break;
        case 'w:tbl': this.counts.tables++; out.push(...this.table(el)); break;
        case 'w:sdt': { this.countFormSdt(el); const c = child(el, 'w:sdtContent'); if (c) out.push(...this.blocks(c)); break; }
        case 'w:customXml': out.push(...this.blocks(el)); break;
        case 'w:ins': case 'w:moveTo': this.counts.tracked++; out.push(...this.blocks(el)); break;
        case 'mc:AlternateContent': { const c = child(el, 'mc:Choice'); if (c) out.push(...this.blocks(c)); break; }
        case 'w:altChunk': this.counts.chunks++; break;
        case 'w:del': case 'w:moveFrom': this.counts.tracked++; break;
        default: break; // sectPr, bookmarks, proofing marks: no content
      }
    }
    return out;
  }

  /** Table text in reading order. Rows and cells may be wrapped in content controls or custom XML. */
  private table(el: Element): Block[] {
    const out: Block[] = [];
    for (const k of kids(el)) {
      this.tick();
      if (k.tagName === 'w:tc') {
        const outer = this.cellFill;
        this.cellFill = shadingFill(child(child(k, 'w:tcPr'), 'w:shd')) ?? outer;
        try {
          out.push(...this.blocks(k));
        } finally {
          this.cellFill = outer;
        }
      }
      else if (k.tagName === 'w:tr' || k.tagName === 'w:customXml') out.push(...this.table(k));
      else if (k.tagName === 'w:sdt') { this.countFormSdt(k); const c = child(k, 'w:sdtContent'); if (c) out.push(...this.table(c)); }
    }
    return out;
  }

  private paragraph(p: Element): Block[] {
    const pPr = child(p, 'w:pPr');
    const styleId = val(child(pPr, 'w:pStyle'));
    const directLvl = val(child(pPr, 'w:outlineLvl'));
    const level = directLvl !== null ? headingLevel(Number(directLvl)) : this.styles.heading(styleId);

    let list: ListInfo | null = null;
    if (level === null) {
      // Direct numPr wins, and numId 0 explicitly switches off the style's list.
      const direct = child(pPr, 'w:numPr');
      const numPr = direct
        ? { numId: val(child(direct, 'w:numId')) ?? this.styles.numPr(styleId)?.numId ?? '0', ilvl: Number(val(child(direct, 'w:ilvl')) ?? 0) }
        : this.styles.numPr(styleId);
      const kind = numPr && numPr.numId !== '0' ? this.numbering(numPr.numId, numPr.ilvl) : null;
      if (kind && numPr) list = { kind, ilvl: Math.max(0, Math.min(8, numPr.ilvl || 0)) };
    }

    const src = ++this.paragraphs;
    const out: Block[] = [];
    // One array for the whole paragraph, emptied in place: the walk below holds
    // a reference to it, so text after an image must land in the same array.
    const inline: PMNode[] = [];
    let split = false;
    const flush = (force: boolean) => {
      if (!inline.length && !force) return;
      const content = inline.splice(0);
      const node = level !== null
        ? schema.nodes.heading!.create({ level }, content)
        : schema.nodes.paragraph!.create(null, content);
      out.push({ node, list, src });
    };
    const emitBlocks = (blocks: Block[]) => {
      flush(false);
      split = true;
      // This paragraph's own images belong to it (and to its list item); a
      // text box's paragraphs keep their own identity.
      out.push(...blocks.map((b) => (b.src === 0 ? { ...b, list, src } : b)));
    };
    const outer = this.fields;
    const outerFill = this.paragraphFill;
    this.fields = [];
    this.paragraphFill = shadingFill(child(pPr, 'w:shd'));
    try {
      this.inline(p, [], inline, emitBlocks);
    } finally {
      this.fields = outer;
      this.paragraphFill = outerFill;
    }
    // A paragraph deleted under tracked changes (its mark is in w:del) and left
    // empty is gone in the accepted document.
    if (!split && !inline.length && child(child(pPr, 'w:rPr'), 'w:del')) {
      this.counts.tracked++;
      return out;
    }
    // A paragraph that only held an image yields just the figure; any other
    // paragraph is kept even when empty (an empty heading is a real finding).
    flush(!split);
    return out;
  }

  /** Walk inline content, appending text nodes; block-level things (images, text boxes) go to emitBlocks. */
  private inline(el: Element, marks: readonly Mark[], out: PMNode[], emitBlocks: (b: Block[]) => void): void {
    for (const k of kids(el)) {
      this.tick();
      switch (k.tagName) {
        case 'w:r': this.run(k, marks, out, emitBlocks); break;
        case 'w:hyperlink': {
          const rel = this.rels.get(val(k, 'r:id') ?? '');
          const href = rel?.external ? safeHref(rel.target) : null;
          this.inline(k, href ? withLink(marks, href) : marks, out, emitBlocks);
          break;
        }
        case 'w:fldSimple': {
          const href = hyperlinkOf(k.getAttribute('w:instr') ?? '');
          this.inline(k, href ? withLink(marks, href) : marks, out, emitBlocks);
          break;
        }
        case 'w:ins': case 'w:moveTo': this.counts.tracked++; this.inline(k, marks, out, emitBlocks); break;
        case 'w:del': case 'w:moveFrom': this.counts.tracked++; break;
        case 'w:smartTag': case 'w:customXml': case 'w:dir': case 'w:bdo': this.inline(k, marks, out, emitBlocks); break;
        case 'w:sdt': { this.countFormSdt(k); const c = child(k, 'w:sdtContent'); if (c) this.inline(c, marks, out, emitBlocks); break; }
        case 'mc:AlternateContent': { const c = child(k, 'mc:Choice'); if (c) this.inline(c, marks, out, emitBlocks); break; }
        default: break;
      }
    }
  }

  private run(r: Element, marks: readonly Mark[], out: PMNode[], emitBlocks: (b: Block[]) => void): void {
    const rPr = child(r, 'w:rPr');
    // Hidden text is not read by assistive technology in the delivered file.
    // It still walks the run, because a hidden run can hold a field's begin or
    // end: skipping it would leave the field stack unbalanced.
    const hidden = on(child(rPr, 'w:vanish'));
    let runMarks = marks;
    const M = schema.marks;
    if (on(child(rPr, 'w:b'))) runMarks = M.strong!.create().addToSet(runMarks);
    if (on(child(rPr, 'w:i'))) runMarks = M.em!.create().addToSet(runMarks);
    if (on(child(rPr, 'w:u'))) runMarks = M.underline!.create().addToSet(runMarks);
    // Colours and size feed the contrast rule (large text is judged at 3:1).
    // The background is the topmost layer: highlight, then run, paragraph and
    // cell shading. When it can't be resolved, no colour is imported at all:
    // light text kept without its dark fill would arrive invisible.
    const highlightName = val(child(rPr, 'w:highlight'));
    const layers: Fill[] = [
      highlightName && highlightName !== 'none' ? WORD_HIGHLIGHT.get(highlightName) ?? 'unknown' : null,
      shadingFill(child(rPr, 'w:shd')),
      this.paragraphFill,
      this.cellFill,
    ];
    const background = layers.find((l) => l !== null) ?? null;
    if (background !== 'unknown') {
      const colour = val(child(rPr, 'w:color'));
      // ponytail: "auto" (or no colour) on a background is resolved the way Word
      // draws it, black or white by contrast; Word's exact switch point is not
      // documented. Upgrade trigger: an imported file whose auto text flips.
      const fg = colour && HEX6.test(colour) ? `#${colour.toLowerCase()}` : background ? automaticText(background) : null;
      if (fg) runMarks = M.textColor!.create({ color: fg }).addToSet(runMarks);
      if (background) runMarks = M.highlight!.create({ color: background }).addToSet(runMarks);
    }
    const halfPoints = Number(val(child(rPr, 'w:sz')));
    if (Number.isFinite(halfPoints) && halfPoints > 0 && halfPoints <= 3276) {
      runMarks = M.fontSize!.create({ size: Math.round((halfPoints / 2) * (4 / 3) * 100) / 100 }).addToSet(runMarks);
    }
    // The run's visible text only: a field code or fallback content in another
    // script must not pick the attribute. Every run is marked with its
    // language, English included; `assemble` then settles the document's own
    // language and drops the marks that match it.
    const visible = kids(r).filter((k) => k.tagName === 'w:t').map((t) => t.textContent ?? '').join('');
    // A run with no letters (a date, a number, punctuation) is no language:
    // marked, a screen reader would switch voice to read "2024".
    const lang = /\p{L}/u.test(visible) ? runLanguage(child(rPr, 'w:lang'), visible) ?? runLanguage(this.styles.defaultLang, visible) : null;
    if (lang) runMarks = M.lang!.create({ lang }).addToSet(runMarks);
    // ponytail: colours, sizes and languages set by styles (pStyle/rStyle),
    // theme-only colours and the page colour are not resolved, nor are fonts;
    // the docDefaults language is. Upgrade trigger: a real file whose colours
    // or languages come from paragraph or character styles.

    for (const k of kids(r)) {
      this.tick();
      // A fldChar can change the field state mid-run, so read it per child.
      const field = this.fields.at(-1);
      const inCode = this.fields.some((f) => f.phase === 'code');
      const href = [...this.fields].reverse().find((f) => f.phase === 'result' && f.href)?.href ?? null;
      const marksHere = href ? withLink(runMarks, href) : runMarks;
      const text = (str: string) => {
        if (!str || inCode || hidden) return;
        // An empty text field's result (usually five en-spaces) is the line to
        // write on: underlined, so it stays visible and form-blank sees it.
        const blankField = field?.phase === 'result' && field.textInput && str.trim() === '';
        out.push(schema.text(str, blankField ? schema.marks.underline!.create().addToSet(marksHere) : marksHere));
        if (field?.phase === 'result') field.emitted = true;
      };
      switch (k.tagName) {
        case 'w:t': text(k.textContent ?? ''); break;
        // An underlined tab is Word's fill-in line; keeping it a tab lets
        // form-blank tell it from a stray underlined space.
        case 'w:tab': text(M.underline!.isInSet(runMarks) ? '\t' : ' '); break;
        case 'w:br': if ((val(k, 'w:type') ?? 'textWrapping') === 'textWrapping' && !inCode && !hidden) out.push(schema.nodes.hard_break!.create()); break;
        case 'w:cr': if (!inCode && !hidden) out.push(schema.nodes.hard_break!.create()); break;
        case 'w:noBreakHyphen': text('\u2011'); break;
        case 'w:softHyphen': break;
        case 'w:sym': {
          // Symbol-font glyphs sit in the private-use area (F0xx) and mean
          // nothing as text; anything else is a real character.
          const code = parseInt(val(k, 'w:char') ?? '', 16);
          const font = (val(k, 'w:font') ?? '').trim().toLowerCase();
          // w:char may be written with or without the F0xx private-use offset.
          const glyph = code >= 0xf000 && code <= 0xf0ff ? code - 0xf000 : code;
          const box = SYMBOL_BOXES.get(font)?.get(glyph);
          if (box) text(box);
          else if (SYMBOL_FONTS.has(font)) break;
          else if (Number.isFinite(code) && code > 0 && (code < 0xe000 || code > 0xf8ff) && code <= 0x10ffff) text(String.fromCodePoint(code));
          break;
        }
        case 'w:fldChar': {
          const type = val(k, 'w:fldCharType');
          if (type === 'begin') {
            // A legacy form field keeps its settings in w:ffData, inside the begin fldChar.
            const ffData = child(k, 'w:ffData');
            const checkBox = child(ffData, 'w:checkBox');
            if (ffData) this.counts.fields++;
            const check = checkBox ? (child(checkBox, 'w:checked') ? on(child(checkBox, 'w:checked')) : on(child(checkBox, 'w:default'))) : null;
            this.fields.push({ phase: 'code', instr: '', href: null, check, emitted: false, textInput: !!child(ffData, 'w:textInput') });
          } else if (type === 'separate' && field) {
            field.phase = 'result';
            field.href = hyperlinkOf(field.instr);
          } else if (type === 'end') {
            // A check box has no result text: Word draws the box. Pushed directly,
            // not through text(), which stays silent while a field code is open.
            const done = this.fields.pop();
            if (done?.check != null && !done.emitted && !hidden && !this.fields.some((f) => f.phase === 'code')) {
              out.push(schema.text(done.check ? '\u2612' : '\u2610', marksHere));
            }
          }
          break;
        }
        case 'w:instrText': if (field?.phase === 'code') field.instr += k.textContent ?? ''; break;
        case 'w:footnoteReference': case 'w:endnoteReference': this.counts.notes++; break;
        case 'w:drawing': if (!hidden) emitBlocks(this.drawing(k)); break;
        case 'w:pict': case 'w:object': if (!hidden) emitBlocks(this.vml(k)); break;
        case 'mc:AlternateContent': {
          // The inner run can't see this run's w:vanish, so hidden stops here.
          const c = child(k, 'mc:Choice');
          if (c && !hidden) this.run(c, marks, out, emitBlocks);
          break;
        }
        default: break; // delText, instrText outside a field, rPr, lastRenderedPageBreak…
      }
    }
  }

  /** src 0: claimed by the paragraph that holds the image (see emitBlocks). */
  private figure(alt: string): Block {
    const n = ++this.figures;
    return { node: schema.nodes.figure!.create({ id: `img-${n}`, alt: alt.trim().slice(0, MAX_ALT), label: `image ${n}` }), list: null, src: 0 };
  }

  private isDecorative(el: Element): boolean {
    for (const d of descendants(el)) {
      // <adec:decorative val="1"/>: the attribute is unprefixed.
      if (d.tagName.endsWith(':decorative') && !FALSE_VALS.has((d.getAttribute('val') ?? '1').toLowerCase())) return true;
    }
    return false;
  }

  private drawing(d: Element): Block[] {
    // Text boxes are content; an image INSIDE a text box is found when the box's
    // own paragraphs are walked, so it must not turn the whole box into a figure.
    const txbx = Array.from(d.getElementsByTagName('w:txbxContent'));
    const inBox = new Set(txbx.flatMap((t) => descendants(t)));
    const picture = descendants(d).some((e) => !inBox.has(e) && PICTURE_TAGS.has(e.tagName));
    const text = txbx.flatMap((t) => this.blocks(t));
    if (txbx.length && !picture) return text;
    if (this.isDecorative(d)) { this.counts.decorative++; return text; }
    const docPr = first(d, 'wp:docPr');
    return [this.figure(docPr?.getAttribute('descr') || docPr?.getAttribute('title') || ''), ...text];
  }

  /** Legacy VML pictures and OLE objects. */
  private vml(el: Element): Block[] {
    const txbx = Array.from(el.getElementsByTagName('w:txbxContent'));
    if (txbx.length) return txbx.flatMap((t) => this.blocks(t));
    // A horizontal rule is decoration by definition.
    if (descendants(el).some((e) => e.getAttribute('o:hr') === 't')) return [];
    const shape = first(el, 'v:shape') || first(el, 'v:rect') || first(el, 'v:oval');
    if (!shape && !first(el, 'v:imagedata')) return [];
    return [this.figure(shape?.getAttribute('alt') ?? '')];
  }
}

const PICTURE_TAGS = new Set(['a:blip', 'c:chart', 'dgm:relIds', 'pic:pic']);

/** `HYPERLINK "https://…"`; a `\l` bookmark link is internal and gets no href. */
function hyperlinkOf(instr: string): string | null {
  const m = /^\s*HYPERLINK\s+(?!\\l)"([^"]+)"/i.exec(instr);
  return m ? safeHref(m[1]!) : null;
}

/**
 * A run's language, if it isn't English. Word keeps three per run (w:val,
 * w:eastAsia, w:bidi) and uses the one for the run's kind of characters.
 * Rather than second-guess Word's classes, a run in a non-Latin alphabet takes
 * whichever tag names a language written in that alphabet, and none if no tag
 * does, so Hebrew text is never marked with a default "ar-SA". An alphabet
 * not listed here (Sinhala, Odia …) takes Word's complex-script or East Asian
 * tag unless it names a language of a listed alphabet. A Latin run takes w:val.
 */
function runLanguage(lang: Element | null, text: string): string | null {
  if (!lang) return null;
  const family = alphabetLanguages(text);
  const pick = (attrs: string[], fits: (code: string) => boolean) =>
    attrs.map((a) => val(lang, a)).find((tag): tag is string => !!tag && isUsableLangTag(tag) && fits(primaryTag(tag))) ?? null;
  if (!family) return pick(['w:val'], () => true);
  if (family.length) return pick(['w:val', 'w:eastAsia', 'w:bidi'], (code) => family.includes(code));
  return pick(['w:bidi', 'w:eastAsia'], (code) => !LISTED_ALPHABET_LANGUAGES.has(code));
}

function withLink(marks: readonly Mark[], href: string): readonly Mark[] {
  return schema.marks.link!.create({ href }).addToSet(marks);
}

/** Header/footer text, read by the same walk as the body (text boxes once, fields as shown). */
function bandText(root: Element, styles: Styles, numbering: Numbering): string {
  return new Walker(new Map(), styles, numbering).blocks(root)
    .map((b) => b.node.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ').slice(0, MAX_BAND);
}

/* ---------- assembly ---------- */

/** One source list paragraph: its text plus any images it held. */
type Entry = { list: ListInfo; nodes: PMNode[] };

function assemble(blocks: Block[]): PMNode {
  const N = schema.nodes;
  const out: PMNode[] = [];
  for (let i = 0; i < blocks.length;) {
    const b = blocks[i]!;
    if (!b.list) {
      out.push(b.node);
      i++;
      continue;
    }
    const entries: Entry[] = [];
    for (; i < blocks.length && blocks[i]!.list; i++) {
      const cur = blocks[i]!;
      const last = entries.at(-1);
      if (last && blocks[i - 1]!.src === cur.src) last.nodes.push(cur.node);
      else entries.push({ list: cur.list!, nodes: [cur.node] });
    }
    for (let k = 0; k < entries.length;) {
      const [list, next] = buildList(entries, k, entries[k]!.list.ilvl);
      out.push(list);
      k = next;
    }
  }
  if (!out.length) out.push(N.paragraph!.create());
  const lang = documentLanguageOf(N.doc!.create(null, out));
  return N.doc!.create({ lang }, mapText(Fragment.from(out), (t) => withoutPageLanguage(t, lang)));
}

/**
 * The document's language: the one most of its letters are marked with.
 * Untagged text (no run or default language in the file) counts as English,
 * Word's usual default. The most common tag of that language wins ("es-MX"
 * over "es-ES" when most of the Spanish is Mexican).
 */
function documentLanguageOf(doc: PMNode): string {
  const byLanguage = new Map<string, Map<string, number>>();
  doc.descendants((node) => {
    if (!node.isText) return;
    const tag = String(schema.marks.lang!.isInSet(node.marks)?.attrs.lang ?? 'en');
    const tags = byLanguage.get(primaryTag(tag)) ?? new Map<string, number>();
    tags.set(tag, (tags.get(tag) ?? 0) + (node.text!.match(/\p{L}/gu)?.length ?? 0));
    byLanguage.set(primaryTag(tag), tags);
  });
  let best = 'en';
  let bestLetters = 0;
  for (const tags of byLanguage.values()) {
    const letters = [...tags.values()].reduce((a, b) => a + b, 0);
    if (letters > bestLetters) {
      bestLetters = letters;
      best = [...tags].sort((a, b) => b[1] - a[1])[0]![0];
    }
  }
  return best;
}

/**
 * Consecutive numbered paragraphs become nested lists by ilvl. A change of
 * kind (bullet vs ordered) at the same level starts a new sibling list.
 */
function buildList(entries: Entry[], i: number, level: number): [PMNode, number] {
  const N = schema.nodes;
  const kind = entries[i]!.list.kind;
  const items: PMNode[] = [];
  while (i < entries.length && entries[i]!.list.ilvl >= level) {
    const e = entries[i]!;
    if (e.list.kind !== kind && items.length) break;
    // A list item must open with a paragraph; an item that starts with an image gets an empty one.
    const children: PMNode[] = e.nodes[0]!.type === N.paragraph ? [...e.nodes] : [N.paragraph!.create(), ...e.nodes];
    i++;
    while (i < entries.length && entries[i]!.list.ilvl > level) {
      const [sub, next] = buildList(entries, i, entries[i]!.list.ilvl);
      children.push(sub);
      i = next;
    }
    items.push(N.list_item!.create(null, children));
  }
  return [(kind === 'bullet' ? N.bullet_list! : N.ordered_list!).create(null, items), i];
}

/** Browser entry point: size-check before reading, then parse with the platform's DOMParser. */
export async function importDocxFile(file: File): Promise<ImportedDoc> {
  if (file.size > MAX_ZIP_BYTES) throw new ImportError(MESSAGES.tooLarge);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const parser = new DOMParser();
  return importDocx(bytes, file.name, (text) => parser.parseFromString(text, 'application/xml'));
}
