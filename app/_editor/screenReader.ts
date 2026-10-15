import { languageName, primaryTag } from '../_engine/textHelpers';

/**
 * "Hear it as a screen reader": what NVDA or VoiceOver says, step by step,
 * reading the HTML export. No DOM of its own and no React: it reads the
 * Document exportHtml has just built (the page the user downloads), in the
 * browser or under linkedom in the Node gate.
 *
 * Every phrase here was heard. NVDA with Chrome and VoiceOver with Safari, as
 * Guidepup installs them in CI, read the pages in
 * tests/screen-reader/readingPack.ts a step at a time (reading.nvda.spec.ts,
 * reading.voiceover.spec.ts), and scripts/verify-rules.mjs holds this file to
 * those recordings word for word. A construct the recordings don't hold is
 * read as its plain text: grow the reading pack and re-record before giving
 * it words.
 */

/** The readers recorded so far (tests/screen-reader/recordings/<reader>/). */
export type Reader = 'nvda' | 'voiceover';
export const READERS: Readonly<Record<Reader, { name: string; browser: string }>> = {
  nvda: { name: 'NVDA', browser: 'Chrome' },
  voiceover: { name: 'VoiceOver', browser: 'Safari' },
};

/** One part of a step, in the language a voice should say it in. `glued`:
 *  the same sentence going on in another language, shown without a comma. */
export interface HeardPart { text: string; lang: string; glued?: boolean }
/** One step of the reader (NVDA's Down Arrow, VoiceOver's VO-Right): what it says. */
export type Heard = HeardPart[];

export const readAloud = (page: Document, reader: Reader): Heard[] =>
  reader === 'nvda' ? readNvda(page) : readVoiceOver(page);

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

function readNvda(page: Document): Heard[] {
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

/* ---------- VoiceOver ---------- */

const VO_LANDMARK: Readonly<Record<string, string>> = { HEADER: 'banner', MAIN: 'main', FOOTER: 'content information' };
const VO_BULLETS = ['•', '◦', '■'];

/**
 * VoiceOver with Safari, a VO-Right at a time, as heard. Each landmark, list
 * and table is a step of its own going in and another ("end of …") coming
 * out. Text goes on until a link, a line break or a picture interrupts it:
 * bold, highlight and another language don't (the voice changes, nothing is
 * said). The text itself is what Guidepup logs, not how it's pronounced, so
 * symbols stay as written.
 */
function readVoiceOver(page: Document): Heard[] {
  const pageLang = page.documentElement.getAttribute('lang') || 'en';
  const steps: Heard[] = [];
  const langOf = (el: Element) => el.closest('[lang]')?.getAttribute('lang') || pageLang;
  const said = (...words: string[]) => ({ text: words.join(' '), lang: pageLang });
  const step = (...parts: HeardPart[]) => { const kept = parts.filter((p) => p.text); if (kept.length) steps.push(kept); };

  /** Text as one sentence: a run per language, glued together. */
  const text = (node: Node, into: HeardPart[]) => {
    if (node.nodeType === 3) {
      const t = node.textContent ?? '';
      const lang = langOf(node.parentElement!);
      const last = into.at(-1);
      if (last?.lang === lang) last.text += t; else into.push({ text: t, lang, glued: into.length > 0 });
      return;
    }
    // A line break or a paragraph ends a word: two paragraphs in a cell, or a
    // heading's two lines, aren't one run-on word.
    const ends = node.nodeType === 1 && ((node as Element).tagName === 'BR' || isBlock(node as Element));
    if (ends && into.length) into.at(-1)!.text += ' ';
    for (const c of node.childNodes) text(c, into);
    if (ends && into.length) into.at(-1)!.text += ' ';
  };
  const tidy = (parts: HeardPart[]) => parts
    .map((p) => ({ ...p, text: p.text.replace(/\s+/g, ' ').trim() }))
    .filter((p) => p.text)
    .map((p, i) => (i ? p : { text: p.text, lang: p.lang }));

  // A picture: its name, then "image"; unnamed, just "image".
  const picture = (name: string | null | undefined, lang: string) =>
    step(...(name?.trim() ? [{ text: name.trim(), lang }] : []), said('image'));

  // Inline content, interrupted at links, breaks and pictures.
  const inline = (nodes: Iterable<Node>) => {
    let run: HeardPart[] = [];
    const flush = () => { step(...tidy(run)); run = []; };
    const walk = (node: Node) => {
      if (node.nodeType === 3) { text(node, run); return; }
      if (node.nodeType !== 1) return;
      const e = node as Element;
      if (e.tagName === 'BR') { flush(); return; }
      if (e.tagName === 'IMG') { flush(); picture(e.getAttribute('alt'), langOf(e)); return; }
      if (e.tagName === 'A' && e.hasAttribute('href')) {
        flush();
        const name: HeardPart[] = [];
        text(e, name);
        step(said('link'), ...tidy(name));
        return;
      }
      for (const c of e.childNodes) walk(c);
    };
    for (const c of nodes) walk(c);
    flush();
  };

  const block = (el: Element) => {
    const tag = el.tagName;
    if (tag in VO_LANDMARK) {
      step(said(VO_LANDMARK[tag]!));
      children(el);
      step(said('end of', VO_LANDMARK[tag]!));
      return;
    }
    if (/^H[1-6]$/.test(tag)) {
      // shortcut: a heading is one step, links in it included; none of the
      // recorded pages has a link in a heading. Upgrade: record one.
      const name: HeardPart[] = [];
      text(el, name);
      const t = tidy(name);
      if (t.length) step(said('heading level', tag[1]!), ...t); // an empty one isn't a step at all
      return;
    }
    if (tag === 'UL' || tag === 'OL') {
      const items = [...el.children].filter((c) => c.tagName === 'LI');
      let level = 1;
      let bullets = 0;
      for (let e = el.parentElement; e; e = e.parentElement) {
        if (e.tagName === 'UL' || e.tagName === 'OL') level++;
        if (e.tagName === 'UL') bullets++;
      }
      step(said('list', `${items.length} item${items.length === 1 ? '' : 's'}`, ...(level > 1 ? [`level ${level}`] : [])));
      const start = Number(el.getAttribute('start') ?? 1);
      items.forEach((li, i) => {
        // As heard: a bullet says where it is ("• 1 of 2", but a lone "■");
        // a number says only itself.
        const bullet = VO_BULLETS[Math.min(bullets, VO_BULLETS.length - 1)]!;
        step(said(tag === 'OL' ? String(start + i) : items.length > 1 ? `${bullet} ${i + 1} of ${items.length}` : bullet));
        children(li);
      });
      step(said('end of list'));
      return;
    }
    if (tag === 'TABLE') {
      const { rows, cols, cells } = grid(el);
      const caption = [...el.children].find((c) => c.tagName === 'CAPTION')?.textContent?.trim();
      step(...(caption ? [{ text: caption, lang: langOf(el) }] : []), said('table'), said(`${cols} column${cols === 1 ? '' : 's'}, ${rows.length} row${rows.length === 1 ? '' : 's'}`));
      // The row is said when it changes (not for the first), and the column's
      // header when the column does: below a cell spanning two rows, "No" in
      // the same column as the "Yes" before it gets no "Vote".
      let row = 0;
      let col = -1;
      for (const p of cells) {
        const parts: HeardPart[] = [];
        if (p.row !== row) parts.push(said(`row ${p.row + 1} of ${rows.length}`));
        const isHeader = p.cell.tagName === 'TH' && p.cell.getAttribute('scope') === 'col';
        if (!isHeader && p.col !== col) {
          const header = cells.find((h) => h.col === p.col && h.cell.tagName === 'TH' && h.cell.getAttribute('scope') === 'col')?.cell.textContent?.trim();
          if (header) parts.push({ text: header, lang: langOf(p.cell) });
        }
        if (p.colspan > 1) parts.push(said(`spans ${p.colspan} columns`));
        if (p.rowspan > 1) parts.push(said(`spans ${p.rowspan} rows`));
        // shortcut: a cell is one step, whatever is in it; none of the
        // recorded pages has a link or a picture in a cell. Upgrade: record one.
        const content: HeardPart[] = [];
        text(p.cell, content);
        const t = tidy(content);
        parts.push(...(t.length ? t : [said('blank')]), said(`column ${p.col + 1} of ${cols}`));
        step(...parts);
        row = p.row;
        col = p.col;
      }
      step(said('end of table'));
      return;
    }
    if (tag === 'FIGURE') {
      // A placeholder is role="img": its label, or nothing; its text is hidden.
      const img = el.querySelector('img');
      picture(img ? img.getAttribute('alt') : el.getAttribute('aria-label'), langOf(el));
      return;
    }
    if (tag === 'P') { inline(el.childNodes); return; }
    children(el);
  };
  // Blocks in turn; inline content between them (a band's picture and text)
  // runs together, as in a paragraph.
  const children = (el: Element) => {
    let loose: Node[] = [];
    for (const c of el.childNodes) {
      if (c.nodeType === 1 && isBlock(c as Element)) { inline(loose); loose = []; block(c as Element); } else loose.push(c);
    }
    inline(loose);
  };

  children(page.body);
  return steps;
}
