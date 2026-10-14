import { languageName, primaryTag } from '../_engine/textHelpers';

/**
 * "Hear it as a screen reader": what NVDA says, line by line, reading the HTML
 * export. No DOM of its own and no React: it reads the Document exportHtml
 * has just built (the page the user downloads), in the browser or under
 * linkedom in the Node gate.
 *
 * Every phrase here was heard. NVDA with Chrome, as Guidepup installs them
 * in CI, read the pages in tests/screen-reader/readingPack.ts with Down Arrow
 * (reading.nvda.spec.ts), and scripts/verify-rules.mjs holds this file to
 * those recordings word for word. A construct the recordings don't hold is read as its plain text: grow
 * the reading pack and re-record before giving it words.
 */

/** One part of a line, in the language a voice should say it in. */
export interface HeardPart { text: string; lang: string }
/** One step of the reader (one Down Arrow): what it says. */
export type Heard = HeardPart[];

const LANDMARK: Readonly<Record<string, string>> = { header: 'banner landmark', main: 'main landmark', footer: 'content info landmark' };
// What NVDA calls each level of bullet, as heard: the browser's disc, circle, square.
const BULLETS = ['bullet', 'white bullet', 'black square'];

/** Symbols NVDA names at its default punctuation level, "some", as heard. */
const SYMBOLS: Readonly<Record<string, string>> = { '/': 'slash', '&': 'and', '%': 'percent', '#': 'number', '@': 'at' };

/**
 * Text as NVDA says it: the symbols above by name, and a dot that neither
 * ends a sentence nor sits in a number (an address, or one standing alone
 * after a link) as "dot". A capital inside a word starts a new one ("You Tube").
 * Underscores aren't said at all, so a typed blank ("Name: ____") is silent.
 */
const speakable = (text: string) => text
  .replace(/_+/g, ' ')
  .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
  .replace(/[/&%#@]/g, (c) => ` ${SYMBOLS[c]} `)
  .replace(/\./g, (dot, at: number, s: string) => {
    const before = s[at - 1] ?? ' ';
    const after = s[at + 1] ?? '';
    const endsSentence = /[^\s.]/.test(before) && (after === '' || /["'”’)\s]/.test(after));
    return endsSentence || (/\d/.test(before) && /\d/.test(after)) ? dot : ' dot ';
  })
  .replace(/\s+/g, ' ')
  .trim();

/** The fields NVDA announces entering (and some, leaving) as it moves. A
 *  placeholder figure is role="img", a picture rather than a figure. */
const isField = (el: Element) =>
  el.tagName.toLowerCase() in LANDMARK || ['UL', 'OL', 'TABLE', 'CAPTION'].includes(el.tagName)
  || (el.tagName === 'FIGURE' && el.getAttribute('role') !== 'img');

const enter = (el: Element): string[] => {
  switch (el.tagName) {
    case 'UL': case 'OL': {
      const n = [...el.children].filter((c) => c.tagName === 'LI').length;
      return ['list', `with ${n} item${n === 1 ? '' : 's'}`];
    }
    case 'TABLE': {
      const { rows, cols } = grid(el);
      return ['table', `with ${rows.length} rows and ${cols} columns`];
    }
    case 'CAPTION': return ['caption'];
    case 'FIGURE': return ['figure'];
    default: return [LANDMARK[el.tagName.toLowerCase()]!];
  }
};
const exit = (el: Element): string[] => {
  switch (el.tagName) {
    case 'UL': case 'OL': return ['out of list'];
    case 'TABLE': return ['out of table'];
    case 'CAPTION': return ['out of caption'];
    case 'FIGURE': return ['out of figure'];
    default: return []; // landmarks: never said on the way out
  }
};

/** A table's cells by grid position, spans taken into account. */
interface Placed { cell: Element; row: number; col: number; colspan: number; rowspan: number }
const grids = new WeakMap<Element, { rows: Element[]; cols: number; cells: Placed[] }>();
function grid(table: Element) {
  const known = grids.get(table);
  if (known) return known;
  const rows = [...table.querySelectorAll('tr')].filter((tr) => tr.closest('table') === table);
  const taken: boolean[][] = [];
  const cells: Placed[] = [];
  rows.forEach((tr, r) => {
    let c = 0;
    for (const cell of [...tr.children].filter((x) => x.tagName === 'TD' || x.tagName === 'TH')) {
      while (taken[r]?.[c]) c++;
      const colspan = Number(cell.getAttribute('colspan') ?? 1);
      const rowspan = Number(cell.getAttribute('rowspan') ?? 1);
      for (let dr = 0; dr < rowspan; dr++) for (let dc = 0; dc < colspan; dc++) (taken[r + dr] ??= [])[c + dc] = true;
      cells.push({ cell, row: r, col: c, colspan, rowspan });
      c += colspan;
    }
  });
  const g = { rows, cols: Math.max(0, ...taken.map((t) => t.length)), cells };
  grids.set(table, g);
  return g;
}

/**
 * What NVDA says before a cell's text: "row 2, Item, column 1". The row is
 * said when it, or its span, changes. The header is the one above the cell's
 * place in the grid, but the column number counts only the cells before it
 * in its own row: below a cell spanning two rows, NVDA says "Vote, column 1"
 * for the second column.
 */
function cellIntro(table: Element, cell: Element, prevRow: string | null): { said: string[]; row: string } {
  const { cells } = grid(table);
  const me = cells.find((p) => p.cell === cell)!;
  const row = me.rowspan > 1 ? [`row ${me.row + 1}`, `through ${me.row + me.rowspan}`] : [`row ${me.row + 1}`];
  const said = row.join() === prevRow ? [] : [...row];
  // A data cell (or a row header) hears the header above its first column.
  if (!(cell.tagName === 'TH' && cell.getAttribute('scope') === 'col')) {
    const header = cells.find((p) => p.col === me.col && p.cell.tagName === 'TH' && p.cell.getAttribute('scope') === 'col');
    const name = header?.cell.textContent?.trim();
    if (name) said.push(speakable(name));
  }
  const col = cells.filter((p) => p.row === me.row && p.col < me.col).reduce((n, p) => n + p.colspan, 1);
  said.push(`column ${col}`);
  if (me.colspan > 1) said.push(`through ${col + me.colspan - 1}`);
  return { said, row: row.join() };
}

/** A line as it's built: the fields it sits in, what it says, whether the
 *  last part is text (which the next text joins) or an announcement, and the
 *  run of text not yet made speakable. */
interface Line { chain: Element[]; parts: HeardPart[]; inText: boolean; run: HeardPart | null }

export function readAloud(page: Document): Heard[] {
  const pageLang = page.documentElement.getAttribute('lang') || 'en';
  const lines: Line[] = [];
  let line: Line | null = null;
  const prevRow = new WeakMap<Element, string>();

  const chainOf = (el: Element) => {
    const chain: Element[] = [];
    for (let e: Element | null = el; e && e !== page.body; e = e.parentElement) if (isField(e)) chain.unshift(e);
    return chain;
  };
  const langOf = (el: Element) => el.closest('[lang]')?.getAttribute('lang') || pageLang;
  // NVDA makes each run of text speakable on its own, and a run ends at any
  // element but a link without an address: where a link or a bold word ends
  // decides whether a dot is "dot". Shown, the runs join up again.
  const say = (text: string, lang: string) => {
    if (line!.run && line!.run.lang !== lang) flush();
    if (line!.run) line!.run.text += text; else line!.run = { text, lang };
  };
  const flush = () => {
    const run = line?.run;
    if (!run) return;
    line!.run = null;
    const t = speakable(run.text);
    if (!t) return;
    const last = line!.parts.at(-1);
    if (line!.inText && last?.lang === run.lang) last.text += (/^\p{P}/u.test(t) ? '' : ' ') + t;
    else line!.parts.push({ text: t, lang: run.lang });
    line!.inText = true;
  };
  const announce = (text: string) => { flush(); line!.parts.push({ text, lang: pageLang }); line!.inText = false; };
  const open = (at: Element) => { if (!line) { line = { chain: chainOf(at), parts: [], inText: false, run: null }; lines.push(line); } };
  const close = () => { flush(); if (line && !line.parts.length) lines.pop(); line = null; };

  // Inline content: text, links, highlights, other languages, images, breaks.
  const inline = (node: Node, owner: Element) => {
    if (node.nodeType === 3) { open(owner); say(node.textContent ?? '', langOf(owner)); return; }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    switch (el.tagName) {
      case 'BR': close(); return;
      case 'IMG': {
        const alt = el.getAttribute('alt')?.trim();
        if (alt) { open(owner); announce('graphic'); say(alt, langOf(el)); flush(); line!.inText = false; }
        return;
      }
      case 'A':
        open(el);
        if (el.hasAttribute('href')) announce('link');
        break;
      case 'MARK': open(el); announce('highlighted'); break;
      case 'SPAN':
        if (el.hasAttribute('lang') && primaryTag(langOf(el)) !== primaryTag(langOf(el.parentElement!))) {
          open(el);
          // shortcut: NVDA in CI has no voice for the language, so it adds
          // "(not supported)"; a computer with one says the name alone, or
          // nothing. Upgrade when a run records a reader with that voice.
          announce(`${languageName(langOf(el))} (not supported)`);
        }
        break;
    }
    const splits = !(el.tagName === 'A' && !el.hasAttribute('href'));
    if (splits) flush();
    for (const child of el.childNodes) inline(child, el);
    if (splits) flush();
    if (el.tagName === 'MARK') announce('out of highlighted');
  };

  const block = (el: Element) => {
    const tag = el.tagName;
    if (/^H[1-6]$/.test(tag)) {
      if (!el.textContent?.trim()) return; // an empty heading isn't read at all
      close(); open(el); announce('heading'); announce(`level ${tag[1]}`);
      for (const child of el.childNodes) inline(child, el);
      close();
      return;
    }
    if (tag === 'LI') {
      const list = el.parentElement!;
      const items = [...list.children].filter((c) => c.tagName === 'LI');
      let depth = 0;
      for (let e = list.parentElement; e; e = e.parentElement) if (e.tagName === 'UL') depth++;
      close(); open(el);
      announce(list.tagName === 'OL' ? `${Number(list.getAttribute('start') ?? 1) + items.indexOf(el)}.` : BULLETS[Math.min(depth, BULLETS.length - 1)]!);
      close();
      for (const child of el.children) block(child);
      return;
    }
    if (tag === 'TABLE') {
      for (const child of el.children) if (child.tagName === 'CAPTION') block(child);
      for (const { cell } of grid(el).cells) {
        close(); open(cell);
        const intro = cellIntro(el, cell, prevRow.get(el) ?? null);
        prevRow.set(el, intro.row);
        for (const s of intro.said) announce(s);
        let first = true;
        for (const child of cell.childNodes) {
          if (child.nodeType === 1 && (child as Element).tagName === 'P') {
            if (!first) { close(); open(cell); }
            first = false;
            for (const c of child.childNodes) inline(c, child as Element);
          } else inline(child, cell);
        }
        close();
      }
      return;
    }
    if (tag === 'FIGURE') {
      const img = el.querySelector('img');
      const name = (img ? img.getAttribute('alt') : el.getAttribute('aria-label'))?.trim();
      // An unlabelled picture, and its figure, aren't there for NVDA at all.
      if (!name) return;
      close(); open(img ?? el);
      announce('graphic');
      say(name, langOf(el));
      close();
      return;
    }
    // Containers (landmarks, lists, captions, paragraphs): their inline
    // content makes lines, and their blocks recurse.
    for (const child of el.childNodes) {
      if (child.nodeType === 1 && isBlock(child as Element)) { close(); block(child as Element); close(); } else inline(child, el);
    }
    close();
  };

  block(page.body);

  // Each line says the fields it leaves, innermost first, then the ones it
  // enters, outermost first.
  // shortcut: the recordings start where Guidepup's setup leaves NVDA, on the
  // first link, so the landmark around it isn't said on the first line; a
  // person opening the page would hear "main landmark" first. Upgrade when
  // the spec can start NVDA at the top with nothing focused, and re-record.
  const first = page.body.querySelector('a[href]');
  let prev: Element[] = first ? chainOf(first) : [];
  return lines.map(({ chain, parts }) => {
    const left = prev.filter((f) => !chain.includes(f)).reverse().flatMap(exit);
    const entered = chain.filter((f) => !prev.includes(f)).flatMap(enter);
    prev = chain;
    return [...[...left, ...entered].map((text) => ({ text, lang: pageLang })), ...parts];
  });
}

const BLOCKS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'TABLE', 'CAPTION', 'FIGURE', 'HEADER', 'MAIN', 'FOOTER']);
const isBlock = (el: Element) => BLOCKS.has(el.tagName);
