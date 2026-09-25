import { baseKeymap, chainCommands, setBlockType, toggleMark } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { liftListItem, sinkListItem, splitListItem, wrapInList } from 'prosemirror-schema-list';
import type { MarkType, NodeType } from 'prosemirror-model';
import type { Command, EditorState, Plugin } from 'prosemirror-state';
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

/* ---------- plugins ---------- */

export function editingPlugins(): Plugin[] {
  return [
    history(),
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
