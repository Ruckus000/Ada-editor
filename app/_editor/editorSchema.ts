import { Schema } from 'prosemirror-model';
import type { DOMOutputSpec, MarkSpec, NodeSpec, Node as PMNode } from 'prosemirror-model';
import { addListNodes } from 'prosemirror-schema-list';
import { isForeignLangTag, isLangTag } from '../_engine/textHelpers';

/**
 * Document schema for the editor screen.
 *
 * Formatting lives in marks and node attributes, never in the DOM, so the
 * findings layer (issueUnderlinePlugin) can decorate ranges without the two
 * ever fighting over the same markup — the reason the repo chose ProseMirror
 * over contentEditable + execCommand.
 */

const MAX_INDENT = 6;

const indentAttr = { indent: { default: 0 } };
const indentStyle = (indent: number) => (indent ? `margin-inline-start: ${indent * 2}em` : '');
const parseIndent = (el: HTMLElement) => {
  const em = parseFloat(el.style.marginInlineStart || el.style.marginLeft || '0');
  return Math.min(MAX_INDENT, Math.max(0, Math.round(em / 2)));
};

const nodes: Record<string, NodeSpec> = {
  doc: { content: 'block+' },
  paragraph: {
    content: 'inline*',
    group: 'block',
    attrs: indentAttr,
    parseDOM: [{ tag: 'p', getAttrs: (el) => ({ indent: parseIndent(el as HTMLElement) }) }],
    toDOM: (node): DOMOutputSpec => ['p', node.attrs.indent ? { style: indentStyle(node.attrs.indent) } : {}, 0],
  },
  heading: {
    attrs: { level: { default: 1 }, ...indentAttr },
    content: 'inline*',
    group: 'block',
    defining: true,
    parseDOM: [1, 2].map((level) => ({ tag: `h${level}`, attrs: { level } })),
    toDOM: (node): DOMOutputSpec => [`h${node.attrs.level}`, node.attrs.indent ? { style: indentStyle(node.attrs.indent) } : {}, 0],
  },
  /**
   * A placeholder image. Rendered by a NodeView in EditorScreen so its alt-text
   * control can live inside the document without being editable text.
   */
  figure: {
    group: 'block',
    atom: true,
    selectable: true,
    draggable: false,
    attrs: { id: {}, alt: { default: '' }, label: { default: 'image' } },
    parseDOM: [{ tag: 'figure[data-figure-id]', getAttrs: (el) => ({ id: (el as HTMLElement).dataset.figureId, alt: (el as HTMLElement).dataset.alt ?? '' }) }],
    toDOM: (node): DOMOutputSpec => ['figure', { 'data-figure-id': node.attrs.id, 'data-alt': node.attrs.alt }],
  },
  text: { group: 'inline' },
  hard_break: {
    inline: true,
    group: 'inline',
    selectable: false,
    parseDOM: [{ tag: 'br' }],
    toDOM: (): DOMOutputSpec => ['br'],
  },
};

/** Only web, mail and phone links; anything else (javascript:, data:, vbscript:) is refused. */
export function safeHref(href: string): string | null {
  try {
    // A dummy base lets relative links through. The URL parser strips tabs, newlines and
    // leading control characters first, so "java\tscript:" is still caught.
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(new URL(href, 'https://x.invalid').protocol) ? href : null;
  } catch {
    return null;
  }
}

const marks: Record<string, MarkSpec> = {
  link: {
    attrs: { href: {} },
    inclusive: false,
    // A pasted link with an unsafe address keeps its text but loses the link.
    parseDOM: [{ tag: 'a[href]', getAttrs: (el) => {
      const href = safeHref((el as HTMLElement).getAttribute('href') ?? '');
      return href ? { href } : false;
    } }],
    toDOM: (mark): DOMOutputSpec => {
      const href = safeHref(mark.attrs.href as string);
      return ['a', href ? { href, rel: 'noopener noreferrer' } : {}, 0];
    },
  },
  strong: {
    parseDOM: [{ tag: 'strong' }, { tag: 'b' }, { style: 'font-weight=bold' }],
    toDOM: (): DOMOutputSpec => ['strong', 0],
  },
  em: {
    parseDOM: [{ tag: 'em' }, { tag: 'i' }, { style: 'font-style=italic' }],
    toDOM: (): DOMOutputSpec => ['em', 0],
  },
  underline: {
    parseDOM: [{ tag: 'u' }, { style: 'text-decoration=underline' }],
    toDOM: (): DOMOutputSpec => ['u', 0],
  },
  textColor: {
    attrs: { color: {} },
    parseDOM: [{ style: 'color', getAttrs: (value) => ({ color: value }) }],
    toDOM: (mark): DOMOutputSpec => ['span', { style: `color: ${mark.attrs.color}` }, 0],
  },
  highlight: {
    attrs: { color: {} },
    parseDOM: [{ tag: 'mark', getAttrs: (el) => ({ color: (el as HTMLElement).style.backgroundColor || 'yellow' }) }],
    toDOM: (mark): DOMOutputSpec => ['mark', { style: `background-color: ${mark.attrs.color}; color: inherit` }, 0],
  },
  fontFamily: {
    attrs: { family: {} },
    parseDOM: [{ style: 'font-family', getAttrs: (value) => ({ family: value }) }],
    toDOM: (mark): DOMOutputSpec => ['span', { style: `font-family: ${mark.attrs.family}` }, 0],
  },
  fontSize: {
    attrs: { size: {} },
    // parseFloat: an imported 18.67px must survive copy/paste (the editor's own
    // clipboard round-trips through parseDOM), or a large-text verdict flips.
    parseDOM: [{ style: 'font-size', getAttrs: (value) => ({ size: parseFloat(value) || 16 }) }],
    toDOM: (mark): DOMOutputSpec => ['span', { style: `font-size: ${mark.attrs.size}px` }, 0],
  },
  // Language of parts (WCAG 3.1.2): screen readers switch voice on it. Not
  // inclusive, so typing past a Spanish phrase doesn't carry Spanish on.
  lang: {
    attrs: { lang: {} },
    inclusive: false,
    // Any element with a lang, and without consuming it: a pasted <p lang="es">
    // stays a paragraph AND stays Spanish. English is parsed too, so an English
    // <span> inside that paragraph ends the Spanish (a parse rule can't clear a
    // mark any other way); `withoutPageLanguage` then drops it on paste, since
    // English is the page's own language. A malformed tag is no language.
    // ponytail: no dir attribute; the bidi algorithm handles inline Arabic
    // and Persian. Upgrade trigger: a reported right-to-left layout bug.
    parseDOM: [{ tag: '[lang]', priority: 60, consuming: false, getAttrs: (el) => {
      const lang = (el as HTMLElement).getAttribute('lang') ?? '';
      return isLangTag(lang) ? { lang } : false;
    } }],
    // Stored documents are not trusted to hold a valid tag either.
    toDOM: (mark): DOMOutputSpec => {
      const lang = String(mark.attrs.lang ?? '');
      return ['span', isForeignLangTag(lang) ? { lang } : {}, 0];
    },
  },
};

const base = new Schema({ nodes, marks });

export const schema = new Schema({
  nodes: addListNodes(base.spec.nodes, 'paragraph block*', 'block'),
  marks: base.spec.marks,
});

/** A pasted text node without a language mark for the page's own language
 *  (English) or a tag that isn't one: see the lang mark's parse rule. */
export function withoutPageLanguage(node: PMNode): PMNode {
  const mark = schema.marks.lang!.isInSet(node.marks);
  return mark && !isForeignLangTag(String(mark.attrs.lang ?? '')) ? node.mark(mark.removeFromSet(node.marks)) : node;
}

export { MAX_INDENT };
