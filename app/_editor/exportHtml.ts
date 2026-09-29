import { DOMSerializer } from 'prosemirror-model';
import type { DOMOutputSpec, Node as PMNode } from 'prosemirror-model';
import { TableMap } from 'prosemirror-tables';
import { documentLanguage, schema } from './editorSchema';
import { headerScope, leadingHeaderRows } from './tableHeaders';
import { validImageKey } from '../_data/imageFormat';
import { isRtlLanguage } from '../_engine/textHelpers';
import { BODY_PX, HEADING_PX, LINK_TEXT, PAGE_BACKGROUND, PAGE_TEXT } from '../_engine/contrast';

// Readable standalone defaults. 40rem keeps lines under the 80-character
// ceiling the design system adopts from WCAG 1.4.8. Colours and heading sizes
// are pinned to the values the contrast rule judges against (contrast.ts), so
// its verdicts hold for the page as delivered, not for a browser's defaults.
const STYLE = `
body { font: ${BODY_PX}px/1.6 system-ui, sans-serif; color: ${PAGE_TEXT}; background: ${PAGE_BACKGROUND}; max-width: 40rem; margin: 0 auto; padding: 1rem; }
a, a:visited { color: ${LINK_TEXT}; }
${[1, 2, 3, 4, 5, 6].map((n) => `h${n} { font-size: ${HEADING_PX[n]}px; font-weight: bold; }`).join('\n')}
figure.placeholder { margin: 1.5rem 0; padding: 3rem 1rem; border: 2px dashed currentColor; text-align: center; }
figure.image { margin: 1.5rem 0; }
figure.image img { display: block; max-width: 100%; height: auto; }
table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
th, td { border: 1px solid currentColor; padding: 0.25rem 0.5rem; text-align: start; vertical-align: top; overflow-wrap: anywhere; }
th > :first-child, td > :first-child { margin-top: 0; }
th > :last-child, td > :last-child { margin-bottom: 0; }
caption { text-align: start; font-weight: bold; padding-bottom: 0.25rem; }
`;

/** An exported image: its bytes as a data: URI (exportImages.ts). */
export type HtmlImages = ReadonlyMap<string, { src: string }>;

// The schema's own toDOM specs are the export mapping (links keep their
// safeHref check). Figures differ — in the editor each is an empty shell a
// NodeView fills in — and so do tables, whose header cells need a scope that
// depends on where they sit (tableHeaders.ts), which a toDOM can't see.
function serializerFor(dom: Document, images: HtmlImages): DOMSerializer {
  const table = (node: PMNode): HTMLElement => {
    const el = dom.createElement('table');
    if (node.attrs.caption) el.append(Object.assign(dom.createElement('caption'), { textContent: String(node.attrs.caption) }));
    const map = TableMap.get(node);
    // A <thead> can't hold a cell that spans into the body.
    let head = leadingHeaderRows(node);
    for (let r = 0; r < head; r++) node.child(r).forEach((cell) => { if (r + (cell.attrs.rowspan ?? 1) > head) head = 0; });
    const thead = head ? dom.createElement('thead') : null;
    const tbody = dom.createElement('tbody');
    let rowPos = 0;
    node.forEach((row, _, r) => {
      const tr = dom.createElement('tr');
      let cellPos = rowPos + 1;
      row.forEach((cell) => {
        const header = cell.type.name === 'table_header';
        const td = dom.createElement(header ? 'th' : 'td');
        if (header) td.setAttribute('scope', headerScope(node, r, map.colCount(cellPos)));
        if ((cell.attrs.colspan ?? 1) > 1) td.setAttribute('colspan', String(cell.attrs.colspan));
        if ((cell.attrs.rowspan ?? 1) > 1) td.setAttribute('rowspan', String(cell.attrs.rowspan));
        td.append(serializer.serializeFragment(cell.content, { document: dom }));
        tr.append(td);
        cellPos += cell.nodeSize;
      });
      (thead && r < head ? thead : tbody).append(tr);
      rowPos += row.nodeSize;
    });
    if (thead) el.append(thead);
    el.append(tbody);
    return el;
  };
  const serializer: DOMSerializer = new DOMSerializer(
    {
      ...DOMSerializer.nodesFromSchema(schema),
      figure: (node): DOMOutputSpec => {
        const alt = (node.attrs.alt as string) || null;
        const key = validImageKey(node.attrs.image);
        const image = key ? images.get(key) : undefined;
        // No alt means no alt attribute, not alt="": the picture is exactly as
        // unlabelled as the checker reported, never papered over or hidden.
        if (image) {
          const size = node.attrs.width && node.attrs.height ? { width: String(node.attrs.width), height: String(node.attrs.height) } : {};
          return ['figure', { class: 'image' }, ['img', { src: image.src, ...size, ...(alt ? { alt } : {}) }]];
        }
        // No picture to hand (a placeholder, or bytes this browser can't get).
        return ['figure', { class: 'placeholder', role: 'img', 'aria-label': alt }, `Image: ${node.attrs.label as string}`];
      },
      table,
    },
    DOMSerializer.marksFromSchema(schema),
  );
  return serializer;
}

/**
 * The document as a standalone, accessible HTML page. `dom` is an empty HTML
 * document to build in (the browser's, or linkedom's under the Node gate);
 * every string reaches the page through textContent or the serializer, so the
 * platform does all escaping.
 */
export function exportHtml(doc: PMNode, meta: { title: string; header: string; footer: string }, dom: Document, images: HtmlImages = new Map()): string {
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
    const node = dom.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  };

  // The document's own language (WCAG 3.1.1), and its direction: a Hebrew or
  // Arabic page reads right to left.
  const lang = documentLanguage(doc);
  dom.documentElement.setAttribute('lang', lang);
  if (isRtlLanguage(lang)) dom.documentElement.setAttribute('dir', 'rtl');

  const charset = el('meta');
  charset.setAttribute('charset', 'utf-8');
  const viewport = el('meta');
  viewport.setAttribute('name', 'viewport');
  viewport.setAttribute('content', 'width=device-width, initial-scale=1');
  // Replace, not append: createHTMLDocument('') already holds an empty <title>,
  // and a browser reads the first one.
  dom.head.replaceChildren(charset, viewport, el('title', meta.title.trim() || 'Untitled document'), el('style', STYLE));

  // ponytail: header/footer export their text only — section images,
  // alignment and spacing aren't persisted in v1; export them once they are.
  if (meta.header.trim()) dom.body.append(el('header', meta.header));
  const main = el('main');
  main.append(serializerFor(dom, images).serializeFragment(doc.content, { document: dom }));
  dom.body.append(main);
  if (meta.footer.trim()) dom.body.append(el('footer', meta.footer));

  // ponytail: no print stylesheet — the page prints through the browser.
  // Tagged PDF/UA output is exportPdf.ts.
  return `<!doctype html>\n${dom.documentElement.outerHTML}`;
}
