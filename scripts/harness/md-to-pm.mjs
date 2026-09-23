/**
 * Markdown → ProseMirror document converter for the engine-parity harness
 * (scripts/measure-engine.mjs). Harness-only: never imported by the app.
 *
 * Fidelity strategy: render with the SAME pipeline the spike measured —
 * marked.parse → linkedom — then walk that DOM into PM nodes. The spike's
 * rules queried this exact DOM (img / a / h1-h6 / p,li,td), so converting it
 * structurally is the highest-fidelity source available; anything else (e.g.
 * walking marked's tokens) diverges wherever markdown embeds raw HTML.
 *
 * Mapping and deliberate deviations, each visible to the harness's allowlist:
 *   - h1–h6 → heading nodes at their real level (the editor toolbar offers
 *     only h1/h2, but the schema's level attr is unconstrained)
 *   - img → figure nodes; alt="" and missing-alt BOTH map to alt '' — the PM
 *     schema cannot express the spike's missing-vs-empty distinction
 *   - a → link marks; p/li/blockquote content → paragraphs (blockquotes are
 *     flattened: the spike matched the inner p, never the blockquote)
 *   - pre/style/script/svg → skipped: the spike's prose selectors (p,li,td)
 *     never saw them
 *   - tables → walked for figures and links (the spike's global img/a
 *     selectors matched inside tables) and cell text becomes paragraphs
 *     (the spike saw td text only through colour-only-reference; the engine's
 *     paragraph rules will also see it — reading-level/long-sentence deltas
 *     from this are allowlisted per document)
 */
import { marked } from 'marked';
import { parseHTML } from 'linkedom';

export function mdToPM(source, schema, { ext = '.md' } = {}) {
  const html = ext === '.md'
    ? marked.parse(source, { async: false })
    : `<p>${source.split(/\n{2,}/).join('</p><p>')}</p>`; // report.mjs's .rst handling, mirrored exactly
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const ctx = { schema, imgSeq: 0 };
  const blocks = [];
  for (const child of Array.from(document.body.children)) {
    blocks.push(...domElementBlocks(child, ctx));
  }
  if (blocks.length === 0) blocks.push(para(ctx, [])); // schema requires block+
  return schema.nodes.doc.create(null, blocks);
}

const para = (ctx, inlineNodes) => ctx.schema.nodes.paragraph.create(null, inlineNodes);
const leaf = (ctx, text, marks) => ctx.schema.text(text, marks.length ? marks : undefined);

function figure(ctx, src, alt) {
  return ctx.schema.nodes.figure.create({
    id: `md-img-${++ctx.imgSeq}`,
    alt: alt ?? '',
    label: src || 'image', // mirrors the spike's snippet, which was the img src
  });
}

/** Marker object inline-leaf walkers may return; paragraph builders lift it to a block. */
const figureMarker = (src, alt) => ({ __figure: { src, alt } });
const isMarker = (l) => !!l && !!l.__figure;

const SKIP_TAGS = new Set(['pre', 'style', 'script', 'svg', 'br', 'hr', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr']);
const liChildren = (listEl) => Array.from(listEl.children).filter((li) => (li.tagName ?? '').toLowerCase() === 'li');

function listNode(tag, items, ctx) {
  return ctx.schema.nodes[tag === 'ol' ? 'ordered_list' : 'bullet_list'].create(
    null,
    items.map((item) => {
      const content = domListItemContent(item, ctx);
      // list_item content is 'paragraph block*': guarantee the leading paragraph.
      if (content.length === 0 || content[0].type.name !== 'paragraph') content.unshift(para(ctx, []));
      return ctx.schema.nodes.list_item.create(null, content);
    }),
  );
}

/** Convert one DOM element into zero or more PM blocks. */
function domElementBlocks(el, ctx) {
  const tag = (el.tagName ?? '').toLowerCase();
  if (/^h[1-6]$/.test(tag)) {
    return [ctx.schema.nodes.heading.create({ level: Number(tag[1]) }, domInlineToNodes(el, ctx))];
  }
  if (tag === 'p') {
    const blocks = [];
    pushDomInline(blocks, el, ctx);
    return blocks;
  }
  if (tag === 'img') {
    return [figure(ctx, el.getAttribute('src') ?? '', el.getAttribute('alt'))];
  }
  if (tag === 'a') {
    const blocks = [];
    if (el.querySelector('img')) {
      // Badge-style link: keep the figures, drop the link wrapper — the spike's
      // text(a) was empty (or near-empty) for these, so its link rules skipped
      // them too.
      for (const img of Array.from(el.querySelectorAll('img'))) {
        blocks.push(figure(ctx, img.getAttribute('src') ?? '', img.getAttribute('alt')));
      }
    } else {
      // The <a> itself carries the mark: seed the inline walk with it, or a
      // standalone link (e.g. a table cell's only child) loses its href.
      pushDomInline(blocks, el, ctx, [ctx.schema.marks.link.create({ href: el.getAttribute('href') ?? '' })]);
    }
    return blocks;
  }
  if (tag === 'ul' || tag === 'ol') {
    return [listNode(tag, liChildren(el), ctx)];
  }
  if (tag === 'table') {
    // Walk cells: the spike's img/a selectors saw inside tables; cell text
    // becomes paragraphs (see header comment for the allowlisted side effect).
    const blocks = [];
    for (const cell of Array.from(el.querySelectorAll('td,th'))) {
      for (const child of Array.from(cell.children)) blocks.push(...domElementBlocks(child, ctx));
      if (!domHasElementChild(cell) && (cell.textContent ?? '').trim()) pushDomInline(blocks, cell, ctx);
    }
    return blocks;
  }
  if (SKIP_TAGS.has(tag)) return [];
  if (domHasElementChild(el)) {
    // Containers (div, blockquote, details, summary, center, figure, ...):
    // descend. Bare container text is dropped — no spike selector matched it.
    return Array.from(el.children).flatMap((c) => domElementBlocks(c, ctx));
  }
  const blocks = [];
  if ((el.textContent ?? '').trim()) pushDomInline(blocks, el, ctx); // text-only unknown tag
  return blocks;
}

const domHasElementChild = (el) => Array.from(el.children).length > 0;
const DOM_BLOCK_TAGS = new Set(['p', 'ul', 'ol', 'div', 'pre', 'table', 'blockquote', 'details', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

function domListItemContent(li, ctx) {
  const content = [];
  const hasBlockChild = Array.from(li.children).some((c) => DOM_BLOCK_TAGS.has((c.tagName ?? '').toLowerCase()));
  if (!hasBlockChild) {
    // Tight item: one paragraph of its full inline content (text, links, images).
    pushDomInline(content, li, ctx);
    return content;
  }
  // Loose/mixed item: direct text nodes become their own leading paragraph
  // (the spike saw them inside text(li)), then each block child converts.
  const ownText = Array.from(li.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join('');
  if (ownText.trim()) content.push(para(ctx, [leaf(ctx, ownText, [])]));
  for (const child of Array.from(li.children)) content.push(...domElementBlocks(child, ctx));
  return content;
}

function pushDomInline(blocks, el, ctx, baseMarks = []) {
  let run = [];
  for (const l of domInlineLeaves(el, ctx, baseMarks)) {
    if (isMarker(l)) {
      if (run.length) { blocks.push(para(ctx, run)); run = []; }
      blocks.push(figure(ctx, l.__figure.src, l.__figure.alt));
    } else {
      run.push(l);
    }
  }
  if (run.length) blocks.push(para(ctx, run));
}

function domInlineToNodes(el, ctx) {
  // Headings cannot contain figure blocks; render images as their alt text.
  return domInlineLeaves(el, ctx, []).flatMap((l) =>
    isMarker(l) ? (l.__figure.alt ? [leaf(ctx, l.__figure.alt, [])] : []) : [l]);
}

function domInlineLeaves(el, ctx, marks) {
  const out = [];
  const { schema } = ctx;
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === 3) { // TEXT_NODE
      if (n.textContent) out.push(leaf(ctx, n.textContent, marks));
      continue;
    }
    if (n.nodeType !== 1) continue; // ELEMENT_NODE
    const tag = (n.tagName ?? '').toLowerCase();
    if (tag === 'a') {
      out.push(...domInlineLeaves(n, ctx, [...marks, schema.marks.link.create({ href: n.getAttribute('href') ?? '' })]));
    } else if (tag === 'strong' || tag === 'b') {
      out.push(...domInlineLeaves(n, ctx, [...marks, schema.marks.strong.create()]));
    } else if (tag === 'em' || tag === 'i') {
      out.push(...domInlineLeaves(n, ctx, [...marks, schema.marks.em.create()]));
    } else if (tag === 'img') {
      out.push(figureMarker(n.getAttribute('src') ?? '', n.getAttribute('alt')));
    } else if (tag === 'br') {
      out.push(schema.nodes.hard_break.create());
    } else if (tag === 'code' || tag === 'span' || tag === 'kbd' || tag === 'sub' || tag === 'sup' || tag === 'del' || tag === 's' || tag === 'abbr' || tag === 'tt' || tag === 'ins' || tag === 'u' || tag === 'small' || tag === 'label') {
      out.push(...domInlineLeaves(n, ctx, marks));
    } else if (!SKIP_TAGS.has(tag) && !n.children.length && (n.textContent ?? '').trim()) {
      out.push(...domInlineLeaves(n, ctx, marks)); // any other inline-ish element with text
    }
    // block-level elements inside inline context (rare, invalid nesting):
    // linkedom re-parents most of these; whatever remains is dropped here,
    // exactly as the spike's inline selectors (text(a), text(p)) dropped it.
  }
  return out;
}
