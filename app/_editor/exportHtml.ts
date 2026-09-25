import { DOMSerializer } from 'prosemirror-model';
import type { DOMOutputSpec, Node as PMNode } from 'prosemirror-model';
import { documentLanguage, schema } from './editorSchema';
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
`;

// The schema's own toDOM specs are the export mapping (links keep their
// safeHref check). Only the figure differs: in the editor it is an empty
// shell a NodeView fills in.
// ponytail: figures are placeholders because they carry no image data yet;
// export a real <img> once figures store one.
const serializer = new DOMSerializer(
  {
    ...DOMSerializer.nodesFromSchema(schema),
    figure: (node): DOMOutputSpec => [
      'figure',
      // No alt means no accessible name: the export is exactly as missing as
      // the checker reported, never papered over with the label.
      { class: 'placeholder', role: 'img', 'aria-label': (node.attrs.alt as string) || null },
      `Image: ${node.attrs.label as string}`,
    ],
  },
  DOMSerializer.marksFromSchema(schema),
);

/**
 * The document as a standalone, accessible HTML page. `dom` is an empty HTML
 * document to build in (the browser's, or linkedom's under the Node gate);
 * every string reaches the page through textContent or the serializer, so the
 * platform does all escaping.
 */
export function exportHtml(doc: PMNode, meta: { title: string; header: string; footer: string }, dom: Document): string {
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
  main.append(serializer.serializeFragment(doc.content, { document: dom }));
  dom.body.append(main);
  if (meta.footer.trim()) dom.body.append(el('footer', meta.footer));

  // ponytail: no print stylesheet or PDF — the page prints through the
  // browser. Tagged PDF/UA output is its own project.
  return `<!doctype html>\n${dom.documentElement.outerHTML}`;
}
