import type { Mark, Node as PMNode } from 'prosemirror-model';
import { safeHref, schema } from '../_editor/editorSchema';
import { readZip, ZipError, MAX_ZIP_BYTES } from './unzip';

/**
 * Import a .docx into the editor's document model, in the browser.
 *
 * The file never leaves the device: there is no backend, and a document
 * someone is checking for accessibility is often not public yet.
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

type Rel = { type: string; target: string; external: boolean };
type ListKind = 'bullet' | 'ordered';
type Block =
  | { kind: 'text'; node: PMNode; list: { kind: ListKind; ilvl: number } | null }
  | { kind: 'figure'; node: PMNode };

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
  const numbering = readNumbering(numberingPart ? await xml(numberingPart) : null);
  const core = corePart ? await xml(corePart) : null;

  const walker = new Walker(rels, styles, numbering);
  const blocks = walker.blocks(body);

  const sectPr = child(body, 'w:sectPr');
  const band = async (tag: 'w:headerReference' | 'w:footerReference') => {
    const ref = sectPr && kids(sectPr).find((k) => k.tagName === tag && (val(k, 'w:type') ?? 'default') === 'default');
    const rel = ref ? rels.get(val(ref, 'r:id') ?? '') : undefined;
    const doc = rel && !rel.external ? await xml(rel.target) : null;
    return doc ? bandText(doc.documentElement) : '';
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
interface Styles { heading(styleId: string | null): number | null; numPr(styleId: string | null): { numId: string; ilvl: number } | null }

function readStyles(doc: Document | null): Styles {
  const map = new Map<string, StyleInfo>();
  for (const s of doc ? Array.from(doc.getElementsByTagName('w:style')) : []) {
    const id = s.getAttribute('w:styleId');
    if (!id || s.getAttribute('w:type') !== 'paragraph') continue;
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

function readNumbering(doc: Document | null): Numbering {
  const abstract = new Map<string, Map<number, string>>();
  const nums = new Map<string, string>();
  if (doc) {
    for (const a of Array.from(doc.getElementsByTagName('w:abstractNum'))) {
      const levels = new Map<number, string>();
      for (const l of kids(a)) {
        if (l.tagName === 'w:lvl') levels.set(Number(l.getAttribute('w:ilvl') ?? 0), val(child(l, 'w:numFmt')) ?? 'decimal');
      }
      abstract.set(a.getAttribute('w:abstractNumId') ?? '', levels);
    }
    for (const n of Array.from(doc.getElementsByTagName('w:num'))) {
      nums.set(n.getAttribute('w:numId') ?? '', val(child(n, 'w:abstractNumId')) ?? '');
    }
  }
  // ponytail: w:lvlOverride (per-list format overrides) is ignored; the
  // abstract definition decides bullet vs ordered. Upgrade trigger: a real
  // file whose list kind comes out wrong.
  return (numId, ilvl) => {
    const fmt = abstract.get(nums.get(numId) ?? '')?.get(ilvl);
    if (fmt === undefined) return nums.has(numId) ? 'bullet' : null;
    if (fmt === 'none') return null;
    return fmt === 'bullet' ? 'bullet' : 'ordered';
  };
}

/* ---------- the body walk ---------- */

interface Field { phase: 'code' | 'result'; instr: string; href: string | null }

class Walker {
  private visited = 0;
  private figures = 0;
  private counts = { tables: 0, decorative: 0, notes: 0, chunks: 0, tracked: 0 };
  /** Complex fields (fldChar begin/separate/end) may span runs and paragraphs. */
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
    return out;
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
        case 'w:sdt': { const c = child(el, 'w:sdtContent'); if (c) out.push(...this.blocks(c)); break; }
        case 'w:customXml': case 'w:ins': case 'w:moveTo': out.push(...this.blocks(el)); break;
        case 'mc:AlternateContent': { const c = child(el, 'mc:Choice'); if (c) out.push(...this.blocks(c)); break; }
        case 'w:altChunk': this.counts.chunks++; break;
        case 'w:del': case 'w:moveFrom': this.counts.tracked++; break;
        default: break; // sectPr, bookmarks, proofing marks: no content
      }
    }
    return out;
  }

  private table(tbl: Element): Block[] {
    const out: Block[] = [];
    for (const tr of kids(tbl)) {
      if (tr.tagName !== 'w:tr') continue;
      for (const tc of kids(tr)) {
        this.tick();
        if (tc.tagName === 'w:tc') out.push(...this.blocks(tc));
        else if (tc.tagName === 'w:sdt') { const c = child(tc, 'w:sdtContent'); if (c) for (const inner of kids(c)) if (inner.tagName === 'w:tc') out.push(...this.blocks(inner)); }
      }
    }
    return out;
  }

  private paragraph(p: Element): Block[] {
    const pPr = child(p, 'w:pPr');
    const styleId = val(child(pPr, 'w:pStyle'));
    const directLvl = val(child(pPr, 'w:outlineLvl'));
    const level = directLvl !== null ? headingLevel(Number(directLvl)) : this.styles.heading(styleId);

    let list: { kind: ListKind; ilvl: number } | null = null;
    if (level === null) {
      // Direct numPr wins, and numId 0 explicitly switches off the style's list.
      const direct = child(pPr, 'w:numPr');
      const numPr = direct
        ? { numId: val(child(direct, 'w:numId')) ?? this.styles.numPr(styleId)?.numId ?? '0', ilvl: Number(val(child(direct, 'w:ilvl')) ?? 0) }
        : this.styles.numPr(styleId);
      const kind = numPr && numPr.numId !== '0' ? this.numbering(numPr.numId, numPr.ilvl) : null;
      if (kind && numPr) list = { kind, ilvl: Math.max(0, Math.min(8, numPr.ilvl || 0)) };
    }

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
      out.push({ kind: 'text', node, list });
    };
    const emitBlocks = (blocks: Block[]) => {
      flush(false);
      split = true;
      out.push(...blocks);
    };
    this.inline(p, [], inline, emitBlocks);
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
        case 'w:sdt': { const c = child(k, 'w:sdtContent'); if (c) this.inline(c, marks, out, emitBlocks); break; }
        case 'mc:AlternateContent': { const c = child(k, 'mc:Choice'); if (c) this.inline(c, marks, out, emitBlocks); break; }
        default: break;
      }
    }
  }

  private run(r: Element, marks: readonly Mark[], out: PMNode[], emitBlocks: (b: Block[]) => void): void {
    const rPr = child(r, 'w:rPr');
    // Hidden text is not read by assistive technology in the delivered file.
    if (on(child(rPr, 'w:vanish'))) return;
    let runMarks = marks;
    const M = schema.marks;
    if (on(child(rPr, 'w:b'))) runMarks = M.strong!.create().addToSet(runMarks);
    if (on(child(rPr, 'w:i'))) runMarks = M.em!.create().addToSet(runMarks);
    if (on(child(rPr, 'w:u'))) runMarks = M.underline!.create().addToSet(runMarks);
    // ponytail: colour, size, font and highlight are dropped, and character
    // styles (rStyle) are not resolved; no rule reads them. Upgrade trigger: a
    // contrast or colour rule that needs authored colours.

    const field = this.fields.at(-1);
    const inCode = this.fields.some((f) => f.phase === 'code');
    const href = [...this.fields].reverse().find((f) => f.phase === 'result' && f.href)?.href ?? null;
    if (href) runMarks = withLink(runMarks, href);
    const text = (s: string) => { if (s && !inCode) out.push(schema.text(s, runMarks)); };

    for (const k of kids(r)) {
      this.tick();
      switch (k.tagName) {
        case 'w:t': text(k.textContent ?? ''); break;
        case 'w:tab': text(' '); break;
        case 'w:br': if ((val(k, 'w:type') ?? 'textWrapping') === 'textWrapping' && !inCode) out.push(schema.nodes.hard_break!.create()); break;
        case 'w:cr': if (!inCode) out.push(schema.nodes.hard_break!.create()); break;
        case 'w:noBreakHyphen': text('‑'); break;
        case 'w:softHyphen': break;
        case 'w:sym': {
          // Symbol-font glyphs sit in the private-use area (F0xx) and mean
          // nothing as text; anything else is a real character.
          const code = parseInt(val(k, 'w:char') ?? '', 16);
          if (Number.isFinite(code) && code > 0 && (code < 0xe000 || code > 0xf8ff) && code <= 0x10ffff) text(String.fromCodePoint(code));
          break;
        }
        case 'w:fldChar': {
          const type = val(k, 'w:fldCharType');
          if (type === 'begin') this.fields.push({ phase: 'code', instr: '', href: null });
          else if (type === 'separate' && field) { field.phase = 'result'; field.href = hyperlinkOf(field.instr); }
          else if (type === 'end') this.fields.pop();
          // Re-read state for the rest of this run.
          return this.run(withoutBefore(r, k), marks, out, emitBlocks);
        }
        case 'w:instrText': if (field?.phase === 'code') field.instr += k.textContent ?? ''; break;
        case 'w:footnoteReference': case 'w:endnoteReference': this.counts.notes++; break;
        case 'w:drawing': emitBlocks(this.drawing(k)); break;
        case 'w:pict': case 'w:object': emitBlocks(this.vml(k)); break;
        case 'mc:AlternateContent': {
          const c = child(k, 'mc:Choice');
          if (c) this.run(c, marks, out, emitBlocks);
          break;
        }
        default: break; // delText, instrText outside a field, rPr, lastRenderedPageBreak…
      }
    }
  }

  private figure(alt: string): Block {
    const n = ++this.figures;
    return { kind: 'figure', node: schema.nodes.figure!.create({ id: `img-${n}`, alt: alt.trim().slice(0, MAX_ALT), label: `image ${n}` }) };
  }

  private isDecorative(el: Element): boolean {
    for (const d of descendants(el)) {
      // <adec:decorative val="1"/>: the attribute is unprefixed.
      if (d.tagName.endsWith(':decorative') && !FALSE_VALS.has((d.getAttribute('val') ?? '1').toLowerCase())) return true;
    }
    return false;
  }

  private drawing(d: Element): Block[] {
    const txbx = Array.from(d.getElementsByTagName('w:txbxContent'));
    const picture = first(d, 'a:blip') || first(d, 'c:chart') || first(d, 'dgm:relIds') || first(d, 'pic:pic');
    if (txbx.length && !picture) return txbx.flatMap((t) => this.blocks(t));
    if (this.isDecorative(d)) { this.counts.decorative++; return []; }
    const docPr = first(d, 'wp:docPr');
    return [this.figure(docPr?.getAttribute('descr') || docPr?.getAttribute('title') || '')];
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

/** Return a detached copy of run r holding only the children after `after` (and its rPr). */
function withoutBefore(r: Element, after: Element): Element {
  const copy = r.cloneNode(false) as Element;
  const rPr = child(r, 'w:rPr');
  if (rPr) copy.appendChild(rPr.cloneNode(true));
  let seen = false;
  for (const k of kids(r)) {
    if (seen) copy.appendChild(k.cloneNode(true));
    if (k === after) seen = true;
  }
  return copy;
}

/** `HYPERLINK "https://…"`; a `\l` bookmark link is internal and gets no href. */
function hyperlinkOf(instr: string): string | null {
  const m = /^\s*HYPERLINK\s+(?!\\l)"([^"]+)"/i.exec(instr);
  return m ? safeHref(m[1]!) : null;
}

function withLink(marks: readonly Mark[], href: string): readonly Mark[] {
  return schema.marks.link!.create({ href }).addToSet(marks);
}

function bandText(root: Element): string {
  const paras = Array.from(root.getElementsByTagName('w:p')).map((p) =>
    Array.from(p.getElementsByTagName('w:t')).map((t) => t.textContent ?? '').join(''));
  return paras.map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ').slice(0, MAX_BAND);
}

/* ---------- assembly ---------- */

type ListBlock = Extract<Block, { kind: 'text' }> & { list: { kind: ListKind; ilvl: number } };

function assemble(blocks: Block[]): PMNode {
  const N = schema.nodes;
  const out: PMNode[] = [];
  for (let i = 0; i < blocks.length;) {
    const b = blocks[i]!;
    if (b.kind === 'text' && b.list) {
      let j = i;
      while (j < blocks.length && blocks[j]!.kind === 'text' && (blocks[j] as ListBlock).list) j++;
      const run = blocks.slice(i, j) as ListBlock[];
      for (let k = 0; k < run.length;) {
        const [list, next] = buildList(run, k, run[k]!.list.ilvl);
        out.push(list);
        k = next;
      }
      i = j;
    } else {
      out.push(b.node);
      i++;
    }
  }
  if (!out.length) out.push(N.paragraph!.create());
  return N.doc!.create(null, out);
}

/**
 * Consecutive numbered paragraphs become nested lists by ilvl. A change of
 * kind (bullet vs ordered) at the same level starts a new sibling list.
 */
function buildList(run: ListBlock[], i: number, level: number): [PMNode, number] {
  const N = schema.nodes;
  const kind = run[i]!.list.kind;
  const items: PMNode[] = [];
  while (i < run.length && run[i]!.list.ilvl >= level) {
    const r = run[i]!;
    if (r.list.kind !== kind && items.length) break;
    const children: PMNode[] = [r.node];
    i++;
    while (i < run.length && run[i]!.list.ilvl > level) {
      const [sub, next] = buildList(run, i, run[i]!.list.ilvl);
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
