import { baseKeymap, chainCommands, setBlockType, toggleMark } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { liftListItem, sinkListItem, splitListItem, wrapInList } from 'prosemirror-schema-list';
import type { Mark, MarkType, NodeType } from 'prosemirror-model';
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import type { Command, EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import {
  TableMap,
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  deleteTable,
  goToNextCell,
  isInTable,
  splitCell,
  tableEditing,
  toggleHeader,
} from 'prosemirror-tables';
import type { Node as PMNode } from 'prosemirror-model';
import { firstRowIsHeader } from './tableHeaders';
import { MAX_INDENT, documentLanguage, schema } from './editorSchema';

const { nodes: N, marks: M } = schema;

/* ---------- queries ---------- */

function markActive(state: EditorState, type: MarkType) {
  const { from, $from, to, empty } = state.selection;
  if (empty) return !!type.isInSet(state.storedMarks || $from.marks());
  return state.doc.rangeHasMark(from, to, type);
}

/** The first attribute value of `type` at the cursor, e.g. the font family. */
function markAttr(state: EditorState, type: MarkType, attr: string): unknown {
  const { $from, from, to, empty } = state.selection;
  const at = empty ? state.storedMarks || $from.marks() : null;
  if (at) return type.isInSet(at)?.attrs[attr];
  let found: unknown;
  state.doc.nodesBetween(from, to, (node) => {
    if (found === undefined) found = type.isInSet(node.marks)?.attrs[attr];
  });
  return found;
}

function blockIs(state: EditorState, type: NodeType, attrs?: Record<string, unknown>) {
  const { $from } = state.selection;
  const parent = $from.parent;
  if (parent.type !== type) return false;
  return !attrs || Object.entries(attrs).every(([k, v]) => parent.attrs[k] === v);
}

function inList(state: EditorState, type: NodeType) {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type === N.bullet_list || node.type === N.ordered_list) return node.type === type;
  }
  return false;
}

/** The href of the link at the cursor or across the selection, or ''. */
export const currentLink = (state: EditorState) => (markAttr(state, M.link!, 'href') as string | undefined) ?? '';

/** The language tag at the cursor or across the selection, or '' for the
 *  document's own. Stored documents aren't validated, so a non-string is ''. */
export const currentLang = (state: EditorState): string => {
  const lang = markAttr(state, M.lang!, 'lang');
  return typeof lang === 'string' ? lang : '';
};

export interface FormatState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  h1: boolean;
  h2: boolean;
  ul: boolean;
  ol: boolean;
  fontFamily: string;
  fontSize: string;
  lang: string;
  /** The document's own language. */
  docLang: string;
  /** The table the cursor is in, or null. */
  table: TableState | null;
}

export interface TableState {
  rows: number;
  cols: number;
  headerRow: boolean;
  headerColumn: boolean;
  /** The cursor is in (or has selected) a merged cell that can be split. */
  canSplit: boolean;
  caption: string;
}

/** The table around the cursor and where it starts, or null. */
export function tableAround(state: EditorState): { node: PMNode; pos: number } | null {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type === N.table) return { node: $from.node(d), pos: $from.before(d) };
  }
  return null;
}

function tableState(state: EditorState): TableState | null {
  const around = tableAround(state);
  if (!around || !isInTable(state)) return null;
  const map = TableMap.get(around.node);
  let headerColumn = around.node.childCount > 0;
  around.node.forEach((row) => { if (row.firstChild?.type !== N.table_header) headerColumn = false; });
  return {
    rows: map.height,
    cols: map.width,
    headerRow: firstRowIsHeader(around.node),
    headerColumn,
    canSplit: splitCell(state),
    caption: String(around.node.attrs.caption ?? ''),
  };
}

export function formatState(state: EditorState): FormatState {
  return {
    bold: markActive(state, M.strong!),
    italic: markActive(state, M.em!),
    underline: markActive(state, M.underline!),
    h1: blockIs(state, N.heading!, { level: 1 }),
    h2: blockIs(state, N.heading!, { level: 2 }),
    ul: inList(state, N.bullet_list!),
    ol: inList(state, N.ordered_list!),
    fontFamily: (markAttr(state, M.fontFamily!, 'family') as string | undefined) ?? 'Default',
    fontSize: String((markAttr(state, M.fontSize!, 'size') as number | undefined) ?? 16),
    lang: currentLang(state),
    docLang: documentLanguage(state.doc),
    table: tableState(state),
  };
}

/* ---------- commands ---------- */

export const toggleBold = toggleMark(M.strong!);
export const toggleItalic = toggleMark(M.em!);
export const toggleUnderline = toggleMark(M.underline!);

export const toggleHeading = (level: 1 | 2): Command => (state, dispatch) =>
  blockIs(state, N.heading!, { level })
    ? setBlockType(N.paragraph!)(state, dispatch)
    : setBlockType(N.heading!, { level })(state, dispatch);

export const toggleList = (type: NodeType): Command => (state, dispatch) =>
  inList(state, type) ? liftListItem(N.list_item!)(state, dispatch) : wrapInList(type)(state, dispatch);

/** Indent works on list items by nesting them, and on other blocks by an attribute. */
function shiftIndent(delta: 1 | -1): Command {
  return (state, dispatch) => {
    let changed = false;
    const tr = state.tr;
    state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
      if (node.type === N.paragraph || node.type === N.heading) {
        const indent = Math.min(MAX_INDENT, Math.max(0, (node.attrs.indent as number) + delta));
        if (indent !== node.attrs.indent) {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent });
          changed = true;
        }
        return false;
      }
      return true;
    });
    if (changed && dispatch) dispatch(tr);
    return changed;
  };
}

export const indent = chainCommands(sinkListItem(N.list_item!), shiftIndent(1));
export const outdent = chainCommands(liftListItem(N.list_item!), shiftIndent(-1));

/** Make the textblock at `pos` a heading at `level`: a heading's level fix
 *  (heading-skip), or a line set like a heading made one (heading-unmarked),
 *  which drops the bold, size and underline that faked it. */
export const setHeadingLevel = (pos: number, level: number): Command => (state, dispatch) => {
  const node = state.doc.nodeAt(pos);
  if (!node?.isTextblock) return false;
  if (dispatch) {
    const tr = state.tr.setNodeMarkup(pos, N.heading, { ...node.attrs, level });
    if (node.type !== N.heading) for (const mark of [M.strong!, M.fontSize!, M.underline!]) tr.removeMark(pos + 1, pos + 1 + node.content.size, mark);
    dispatch(tr);
  }
  return true;
};

/** Replace (or remove, when `attrs` is null) a mark across the selection. */
export const setMark = (type: MarkType, attrs: Record<string, unknown> | null): Command => (state, dispatch) => {
  const { from, to, empty } = state.selection;
  if (!dispatch) return true;
  if (empty) {
    const stored = type.removeFromSet(state.storedMarks || state.selection.$from.marks());
    dispatch(state.tr.setStoredMarks(attrs ? type.create(attrs).addToSet(stored) : stored));
    return true;
  }
  const tr = state.tr.removeMark(from, to, type);
  if (attrs) tr.addMark(from, to, type.create(attrs));
  dispatch(tr.scrollIntoView());
  return true;
};

export const clearFormatting: Command = (state, dispatch) => {
  const { from, to } = state.selection;
  if (!dispatch) return true;
  const tr = state.tr;
  // A link and a language are meaning, not formatting.
  for (const type of Object.values(M)) if (type !== M.link && type !== M.lang) tr.removeMark(from, to, type);
  tr.setStoredMarks([]);
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type === N.heading || (node.type === N.paragraph && node.attrs.indent)) {
      tr.setNodeMarkup(pos, N.paragraph, { indent: 0 });
      return false;
    }
    return true;
  });
  dispatch(tr);
  return true;
};

/* ---------- tables ---------- */

/** "Apply fix" for table-no-header: the table at `tablePos` gets header cells
 *  across its first row. Does nothing if no table is there any more. */
export const makeFirstRowHeader = (tablePos: number): Command => (state, dispatch) => {
  const table = state.doc.nodeAt(tablePos);
  if (!table || table.type !== N.table) return false;
  const map = TableMap.get(table);
  const cells = map.cellsInRect({ left: 0, top: 0, right: map.width, bottom: 1 });
  if (dispatch) {
    const tr = state.tr;
    for (const rel of cells) {
      const cell = table.nodeAt(rel)!;
      if (cell.type !== N.table_header) tr.setNodeMarkup(tablePos + 1 + rel, N.table_header, cell.attrs);
    }
    dispatch(tr);
  }
  return true;
};

export interface NewTable {
  rows: number;
  cols: number;
  headerRow: boolean;
  headerColumn: boolean;
  caption: string;
}

/** Insert a table at the cursor and put the cursor in its first cell. A table
 *  can't go inside a table, so inside one this does nothing. */
export const insertTable = (spec: NewTable): Command => (state, dispatch) => {
  if (isInTable(state)) return false;
  const rows: PMNode[] = [];
  for (let r = 0; r < spec.rows; r++) {
    const cells: PMNode[] = [];
    for (let c = 0; c < spec.cols; c++) {
      const header = (spec.headerRow && r === 0) || (spec.headerColumn && c === 0);
      cells.push((header ? N.table_header! : N.table_cell!).createAndFill()!);
    }
    rows.push(N.table_row!.create(null, cells));
  }
  const table = N.table!.create({ caption: spec.caption.trim() }, rows);
  if (dispatch) {
    const tr = state.tr.replaceSelectionWith(table);
    let at = -1;
    tr.doc.descendants((node, pos) => {
      if (at >= 0) return false;
      if (node === table) at = pos;
      return true;
    });
    // table › row › cell › paragraph: the first cell's text starts 4 in.
    if (at >= 0) tr.setSelection(TextSelection.create(tr.doc, at + 4));
    dispatch(tr.scrollIntoView());
  }
  return true;
};

/** Set the caption of the table the cursor is in. */
export const setTableCaption = (caption: string): Command => (state, dispatch) => {
  const around = tableAround(state);
  if (!around) return false;
  if (dispatch) dispatch(state.tr.setNodeMarkup(around.pos, undefined, { ...around.node.attrs, caption: caption.replace(/\s+/g, ' ').trim() }));
  return true;
};

export const tableCommands = {
  addRowBefore,
  addRowAfter,
  addColumnBefore,
  addColumnAfter,
  deleteRow,
  deleteColumn,
  deleteTable,
  // The table's first row / first column, as the menu and FormatState mean
  // them (the library's exported toggleHeaderRow flips the row the cursor is in).
  toggleHeaderRow: toggleHeader('row'),
  toggleHeaderColumn: toggleHeader('column'),
  splitCell,
} as const;

/**
 * Tab and Shift-Tab move between table cells. At the last (first) cell they
 * do nothing, so focus leaves the editor as usual; Escape, then Tab, leaves
 * from any cell (WCAG 2.1.2, No Keyboard Trap). Outside a table Tab is left
 * alone. The editor's description says so (EditorScreen).
 */
function tableKeys(): Plugin {
  let escaped = false;
  return new Plugin({
    props: {
      handleKeyDown(view, event) {
        if (event.key === 'Escape' && isInTable(view.state)) {
          escaped = true;
          return true;
        }
        if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey) {
          if (escaped) {
            escaped = false;
            return false;
          }
          if (!isInTable(view.state)) return false;
          return goToNextCell(event.shiftKey ? -1 : 1)(view.state, view.dispatch);
        }
        if (event.key !== 'Shift') escaped = false;
        return false;
      },
    },
  });
}

/* ---------- retyping a link ---------- */

type Retyping = { link: Mark; end: number } | null;
const retypeKey = new PluginKey<Retyping>('retypeLink');

/** The one link on every character from `from` to `to`, or null. */
function wholeLink(doc: PMNode, from: number, to: number): Mark | null {
  let link: Mark | null | undefined;
  doc.nodesBetween(from, to, (node) => {
    if (!node.isInline || link === null) return;
    const mark = node.isText ? M.link!.isInSet(node.marks) ?? null : null;
    link = mark && (link === undefined || link.eq(mark)) ? mark : null;
  });
  return link ?? null;
}

/**
 * Typing over a link's words keeps the link, and so does the typing that
 * follows, until the cursor moves: links aren't inclusive (editorSchema.ts),
 * so ProseMirror would otherwise type plain text there and the address would
 * be lost. Typing after a link the cursor arrived at still isn't linked.
 * shortcut: typed input only; a paste over a link, or IME/Android composition,
 * still drops it. Upgrade to an appendTransaction if pilot users lose links so.
 */
export function retypeLinkTr(state: EditorState, from: number, to: number, text: string) {
  const retyping = retypeKey.getState(state);
  const link = from < to ? wholeLink(state.doc, from, to) : retyping && from === retyping.end ? retyping.link : null;
  if (!link) return null;
  const end = from + text.length;
  return state.tr.insertText(text, from, to).addMark(from, end, link).setMeta(retypeKey, { link, end });
}

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'AltGraph']);
const stopRetyping = (view: EditorView) => { if (retypeKey.getState(view.state)) view.dispatch(view.state.tr.setMeta(retypeKey, null)); };

function retypeLink(): Plugin<Retyping> {
  return new Plugin<Retyping>({
    key: retypeKey,
    state: {
      init: () => null,
      apply: (tr, value) => {
        const meta = tr.getMeta(retypeKey) as Retyping | undefined;
        if (meta !== undefined) return meta;
        return tr.docChanged || tr.selectionSet ? null : value;
      },
    },
    props: {
      handleTextInput(view, from, to, text) {
        const tr = retypeLinkTr(view.state, from, to, text);
        if (!tr) return false;
        view.dispatch(tr.scrollIntoView());
        return true;
      },
      // Moving off and back can leave the selection where it was, so no
      // transaction says so: any key that isn't a character, or a click, ends it.
      handleKeyDown(view, event) {
        if (event.key.length > 1 && !MODIFIER_KEYS.has(event.key)) stopRetyping(view);
        return false;
      },
      handleDOMEvents: { mousedown: (view) => { stopRetyping(view); return false; } },
    },
  });
}

/* ---------- plugins ---------- */

export function editingPlugins(): Plugin[] {
  return [
    // Before the keymaps, so a selection of cells is deleted as cells.
    tableKeys(),
    tableEditing(),
    history(),
    retypeLink(),
    keymap({
      'Mod-z': undo,
      'Shift-Mod-z': redo,
      'Mod-y': redo,
      'Mod-b': toggleBold,
      'Mod-i': toggleItalic,
      'Mod-u': toggleUnderline,
      Enter: splitListItem(N.list_item!),
      'Mod-]': indent,
      'Mod-[': outdent,
    }),
    keymap(baseKeymap),
  ];
}

export { N as nodeTypes, M as markTypes };
