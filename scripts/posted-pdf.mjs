/**
 * Compares an Ada Editor PDF with the copy an agenda system published, to see
 * what the platform kept: the tags, the language, the title, the PDF/UA
 * identifier. Used by check-posted-pdf.mjs (the command) and
 * verify-check-posted.mjs (its gate). Why this exists, and what platforms were
 * seen doing: docs/audit/agenda-platforms-2026-10.md.
 *
 * Reads any writer's PDF (object streams, xref streams) through pdf-lib, unlike
 * verify-pdf.mjs's regex helpers, which only read PDFKit's own output.
 */
import { createHash } from 'node:crypto';
import { PDFArray, PDFBool, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFString, decodePDFRawStream } from 'pdf-lib';

const name = (key) => PDFName.of(key);
const text = (v) => (v instanceof PDFString || v instanceof PDFHexString ? v.decodeText() : v instanceof PDFName ? v.decodeText() : null);
const XMP_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescapeXml = (s) => s.replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => XMP_ENTITIES[e]);

/** The standard structure types a reader relies on, grouped for comparison. */
export const GROUPS = {
  headings: /^H[1-6]?$/,
  paragraphs: /^P$/,
  lists: /^(L|LI|Lbl|LBody)$/,
  tables: /^(Table|TR|TH|TD|THead|TBody|TFoot|Caption)$/,
  figures: /^Figure$/,
  links: /^Link$/,
  languageSpans: /^Span$/,
};
// The groups that carry meaning beyond plain paragraphs: losing all of them while
// paragraphs remain is a flattened tree.
const RICH = ['headings', 'lists', 'tables', 'figures'];

/** Everything the comparison needs from one PDF. */
export async function inspectPdf(bytes) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
  const { context, catalog } = doc;
  const lookup = (v) => (v instanceof PDFRef ? context.lookup(v) : v);
  const get = (dict, key) => (dict instanceof PDFDict ? lookup(dict.get(name(key))) : undefined);

  const info = lookup(context.trailerInfo.Info);
  const xmp = (() => {
    const stream = get(catalog, 'Metadata');
    if (!(stream instanceof PDFRawStream)) return '';
    try { return new TextDecoder().decode(decodePDFRawStream(stream).decode()); } catch { return ''; }
  })();
  const xmpTitle = /<dc:title>[\s\S]*?<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/.exec(xmp)?.[1];
  const pdfua = /<pdfuaid:part>\s*(\d+)\s*<\/pdfuaid:part>|pdfuaid:part="(\d+)"/.exec(xmp);

  // The structure tree: count elements by their standard type (through the RoleMap).
  const treeRoot = get(catalog, 'StructTreeRoot');
  const roleMap = get(treeRoot, 'RoleMap');
  const standard = (type) => {
    let t = type;
    for (let i = 0; i < 10 && roleMap instanceof PDFDict; i++) {
      const mapped = text(get(roleMap, t));
      if (!mapped || mapped === t) break;
      t = mapped;
    }
    return t;
  };
  const types = {};
  let elements = 0;
  let figuresWithAlt = 0;
  let rootLang = null;
  if (treeRoot instanceof PDFDict) {
    const seen = new Set();
    const stack = [{ value: treeRoot.get(name('K')), depth: 0 }];
    while (stack.length) {
      const { value, depth } = stack.pop();
      if (value instanceof PDFRef) {
        if (seen.has(value.tag)) continue;
        seen.add(value.tag);
      }
      const node = lookup(value);
      if (node instanceof PDFArray) {
        for (let i = node.size() - 1; i >= 0; i--) stack.push({ value: node.get(i), depth });
        continue;
      }
      if (!(node instanceof PDFDict)) continue; // an MCID
      const s = text(get(node, 'S'));
      if (!s) continue; // a marked-content or object reference
      const type = standard(s);
      elements++;
      types[type] = (types[type] ?? 0) + 1;
      if (type === 'Figure' && text(get(node, 'Alt'))) figuresWithAlt++;
      if (depth === 0 && rootLang === null) rootLang = text(get(node, 'Lang'));
      stack.push({ value: node.get(name('K')), depth: depth + 1 });
    }
  }
  const groups = Object.fromEntries(Object.entries(GROUPS).map(([group, re]) => [group, Object.entries(types).filter(([t]) => re.test(t)).reduce((n, [, c]) => n + c, 0)]));

  // Pages still pointing into a ParentTree that doesn't hold them: the trace a
  // merge leaves when it drops the tree but keeps the pages.
  const parentKeys = new Set();
  const walkNumberTree = (node, depth = 0) => {
    if (!(node instanceof PDFDict) || depth > 32) return;
    const nums = get(node, 'Nums');
    if (nums instanceof PDFArray) for (let i = 0; i < nums.size(); i += 2) { const k = lookup(nums.get(i)); if (k instanceof PDFNumber) parentKeys.add(k.asNumber()); }
    const kids = get(node, 'Kids');
    if (kids instanceof PDFArray) for (let i = 0; i < kids.size(); i++) walkNumberTree(lookup(kids.get(i)), depth + 1);
  };
  walkNumberTree(get(treeRoot, 'ParentTree'));
  const pages = doc.getPages();
  let pagesWithStructParents = 0;
  let orphanPages = 0;
  for (const page of pages) {
    const key = lookup(page.node.get(name('StructParents')));
    if (!(key instanceof PDFNumber)) continue;
    pagesWithStructParents++;
    if (!parentKeys.has(key.asNumber())) orphanPages++;
  }

  const marked = get(get(catalog, 'MarkInfo'), 'Marked');
  const display = get(get(catalog, 'ViewerPreferences'), 'DisplayDocTitle');
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
    pages: pages.length,
    producer: text(get(info, 'Producer')),
    creator: text(get(info, 'Creator')),
    title: text(get(info, 'Title')),
    xmpTitle: xmpTitle === undefined ? null : unescapeXml(xmpTitle.trim()),
    displayDocTitle: display instanceof PDFBool ? display.asBoolean() : null,
    lang: text(get(catalog, 'Lang')),
    rootLang,
    marked: marked instanceof PDFBool ? marked.asBoolean() : null,
    tagged: treeRoot instanceof PDFDict && elements > 0,
    elements,
    types,
    groups,
    figuresWithAlt,
    bookmarks: get(get(catalog, 'Outlines'), 'First') !== undefined,
    pdfua: pdfua ? Number(pdfua[1] ?? pdfua[2]) : null,
    pagesWithStructParents,
    orphanPages,
  };
}

const keptOrNot = (before, after) => (before === after ? 'kept' : after == null || after === '' ? 'dropped' : 'changed');

/**
 * What the platform did, as plain verdicts. `failed` is optional: veraPDF's
 * failed rules per file ({ original, posted }), when veraPDF could run.
 */
export function comparePdfs(original, posted, failed = null) {
  if (original.sha256 === posted.sha256) {
    return { unchanged: true, packet: false, tags: 'unchanged', language: 'unchanged', rootLanguage: 'unchanged', title: 'unchanged', displayDocTitle: 'unchanged', pdfua: 'unchanged', bookmarks: 'unchanged', notMarked: false, lostGroups: [], newFailures: [] };
  }
  const packet = posted.pages > original.pages;
  let tags;
  const lostGroups = [];
  if (!posted.tagged) {
    tags = posted.orphanPages > 0 ? 'removed' : original.tagged ? 'missing' : 'untagged in both';
  } else {
    for (const [group, n] of Object.entries(original.groups)) if (n > posted.groups[group]) lostGroups.push(group);
    const richBefore = RICH.filter((g) => original.groups[g] > 0);
    const flattened = richBefore.length > 0 && richBefore.every((g) => posted.groups[g] === 0) && posted.groups.paragraphs > 0;
    tags = flattened ? 'flattened' : lostGroups.length ? 'partly kept' : 'kept';
  }
  const title = !original.title ? (posted.title ? 'added' : 'not in the original') : original.title === posted.title ? 'kept' : posted.title ? 'replaced' : 'dropped';
  const newFailures = failed?.original && failed?.posted ? failed.posted.filter((id) => !failed.original.includes(id)) : null;
  return {
    unchanged: false,
    packet,
    tags,
    lostGroups,
    notMarked: posted.tagged && posted.marked !== true,
    orphanPages: posted.orphanPages,
    language: original.lang ? keptOrNot(original.lang, posted.lang) : 'not in the original',
    rootLanguage: original.rootLang ? keptOrNot(original.rootLang, posted.rootLang) : 'not in the original',
    title,
    displayDocTitle: original.displayDocTitle ? (posted.displayDocTitle ? 'kept' : 'dropped') : 'not in the original',
    pdfua: original.pdfua ? (posted.pdfua === original.pdfua ? 'kept' : 'dropped') : 'not in the original',
    bookmarks: original.bookmarks ? (posted.bookmarks ? 'kept' : 'dropped') : posted.bookmarks ? 'added' : 'none',
    newFailures,
  };
}
