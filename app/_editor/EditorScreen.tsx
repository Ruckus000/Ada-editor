'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, Slice } from 'prosemirror-model';
import type { Node as PMNode } from 'prosemirror-model';
import { dropCursor } from 'prosemirror-dropcursor';
import { EditorState, NodeSelection, Plugin, TextSelection } from 'prosemirror-state';
import type { Command, Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import type { NodeViewConstructor } from 'prosemirror-view';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Glyph,
  OPEN_SEVERITIES,
  SEVERITY_ENCODING,
  VisuallyHidden,
  issueUnderlineKey,
  issueUnderlinePlugin,
  useAnnounce,
  useRegionCycling,
} from '../../design-system/primitives';
import type { OpenSeverity } from '../../design-system/primitives';
import type { DocSummary } from '../_data/seed';
import { removeDoc } from '../_data/sync';
import { ALIGN_NAMES, AltTextDialog, FigureLayoutDialog, HeaderFooterDialog, ImageIcon, InsertTableDialog, LinkDialog, SIZE_NAMES, StoredImg, TableCaptionDialog } from './dialogs';
import type { SectionState } from './dialogs';
import {
  clearFormatting,
  currentLink,
  editingPlugins,
  formatState,
  indent,
  insertTable,
  makeFirstRowHeader,
  markTypes,
  nodeTypes,
  outdent,
  setMark,
  setTableCaption,
  tableAround,
  tableCommands,
  toggleBold,
  toggleHeading,
  toggleItalic,
  toggleList,
  toggleUnderline,
} from './editorCommands';
import type { FormatState, NewTable } from './editorCommands';
import { documentLanguage, figureAlign, figureSize, withoutPageLanguage } from './editorSchema';
import type { FigureAlign, FigureSize } from './editorSchema';
import { docFromJSON, saveDoc } from '../_data/store';
import type { DocJSON, StoredDoc } from '../_data/store';
import { isCloud } from '../_data/supabase';
import { useSyncStatus } from '../_data/sync';
import { checkDocument, reconcile } from '../_engine/check';
import { isRtlLanguage, languageName, primaryTag } from '../_engine/textHelpers';
import { carryPositions, dismissKeyOf, imageFinding, imageIdFloor, sectionFindings, sortFindings, summaryLine } from './findings';
import { exportHtml } from './exportHtml';
import type { EditorFinding, Section } from './findings';
import { LANGUAGE_MENU, Toolbar } from './Toolbar';
import type { TableAction } from './Toolbar';
import { ImageError, acquireUrl, putImage, releaseUrl } from '../_data/images';
import { imageKeys, resolveForHtml, resolveForPdf } from './exportImages';
import { IMAGE_MIMES, MAX_IMAGE_BYTES, MAX_SOURCE_BYTES, sniffImage, validImageKey } from '../_data/imageFormat';
import { UnreadableImage, prepareImage } from './prepareImage';
import styles from './editor.module.css';

const TARGET_TONE: Record<string, string> = { 'WCAG 2.1 AA': 'blue', 'Section 508': 'green' };

type AltTarget = { kind: 'figure'; id: string; label: string; alt: string } | { kind: 'section'; section: Section; label: string; alt: string };

const figurePos = (state: EditorState, id: string) => {
  let found = -1;
  state.doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.type === nodeTypes.figure && node.attrs.id === id) found = pos;
    return true;
  });
  return found;
};

const wordsIn = (state: EditorState) =>
  state.doc.textBetween(0, state.doc.content.size, ' ', ' ').trim().split(/\s+/).filter(Boolean).length;

export function EditorScreen({ doc, stored }: { doc: DocSummary; stored: StoredDoc }) {
  const announce = useAnnounce();
  const initial = useMemo(() => docFromJSON(stored.content), [stored]);
  // Findings are computed, never seeded: a full check (prose rules included)
  // runs once at mount, exactly like the blur/Recheck runs do later — minus
  // the findings this user already dismissed, which persist with the document.
  const initialFindings = useMemo(() => {
    const dismissed = new Set(stored.dismissed);
    return [...checkDocument(initial, { prose: true }).filter((f) => !dismissed.has(dismissKeyOf(f))), ...sectionFindings(stored, stored.dismissed)];
  }, [initial, stored]);

  /* ---------- state ---------- */
  const [findings, setFindingsState] = useState<EditorFinding[]>(initialFindings);
  // Triage order: the initially-active card is the MOST SEVERE finding, not
  // the first in document order — the engine returns doc order, so sort first.
  const [activeId, setActiveId] = useState<string | null>(sortFindings(initialFindings)[0]?.id ?? null);
  const [filter, setFilter] = useState<OpenSeverity | null>(null);
  const [format, setFormat] = useState<FormatState | null>(null);
  const docLang = format?.docLang ?? documentLanguage(initial);
  const [wordCount, setWordCount] = useState(() => wordsIn(EditorState.create({ doc: initial })));
  const [checking, setChecking] = useState(false);
  const [importNotes, setImportNotes] = useState(stored.importNotes);
  /** Characters the PDF font can't draw, from the last refused PDF export. */
  const [pdfMissing, setPdfMissing] = useState<string[]>([]);
  const [deleteError, setDeleteError] = useState(false);
  const [imageError, setImageError] = useState('');
  const imageInputRef = useRef<HTMLInputElement>(null);
  const deleting = useRef(false);
  const router = useRouter();
  const pdfBusy = useRef(false);
  const [sections, setSections] = useState<Record<Section, SectionState>>({
    header: { text: stored.header, align: 'left', spacing: 12, image: stored.headerImage },
    footer: { text: stored.footer, align: 'left', spacing: 12, image: stored.footerImage },
  });
  const [hfOpen, setHfOpen] = useState(false);
  const [hfTab, setHfTab] = useState<Section>('header');
  const [altTarget, setAltTarget] = useState<AltTarget | null>(null);
  const [layoutTarget, setLayoutTarget] = useState<{ id: string; label: string; size: FigureSize | null; align: FigureAlign } | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkInitial, setLinkInitial] = useState('');
  const [tableOpen, setTableOpen] = useState(false);
  const [captionInitial, setCaptionInitial] = useState<string | null>(null);

  /* ---------- refs shared with ProseMirror ---------- */
  const mountRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const findingsRef = useRef(findings);
  // The array the findings list currently renders. reconcile preserves array
  // identity when nothing changed (§9.4), so comparing against this skips the
  // re-render, the list re-sort and the decoration rebuild on no-op edits.
  const lastRenderedRef = useRef(findings);
  const activeRef = useRef<string | null>(activeId);
  const handlersRef = useRef({ insertImageFiles: async (_files: File[]) => {}, refuseImage: () => {}, editFigureLayout: (_id: string) => {}, editFigureAlt: (_id: string) => {}, editTableCaption: (_pos: number) => {}, activate: (_id: string) => {}, docChanged: () => {}, runFullCheck: () => {} });
  const docRegion = useRef<HTMLElement>(null);
  const findingsRegion = useRef<HTMLElement>(null);
  const activeCardRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pendingFocus = useRef(false);
  const checkTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // One counter for every image id (inserted, pasted, header/footer), so ids never collide.
  const imageSeq = useRef(0);
  // Findings the user dismissed; the engine reconcile must not bring them
  // back. Seeded from the store so dismissals survive reloads, and persisted
  // on every change (below) — ids are content-derived, so a dismissal only
  // ever covers the exact text it was made against.
  const dismissedRef = useRef(new Set<string>(stored.dismissed));
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Latest header/footer state for the debounced save (the timer must not
  // capture a stale render).
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;

  useRegionCycling(useMemo(() => [docRegion, findingsRegion], []));

  const setFindings = useCallback((next: EditorFinding[]) => {
    findingsRef.current = next;
    lastRenderedRef.current = next;
    setFindingsState(next);
  }, []);

  /* ---------- derived ---------- */
  const sorted = useMemo(() => sortFindings(findings), [findings]);
  const visible = filter ? sorted.filter((f) => f.severity === filter) : sorted;
  const active = visible.find((f) => f.id === activeId) ?? visible[0] ?? null;
  const others = visible.filter((f) => f !== active);
  const counts = useMemo(() => {
    const out = {} as Record<OpenSeverity, number>;
    for (const s of OPEN_SEVERITIES) out[s] = findings.filter((f) => f.severity === s).length;
    return out;
  }, [findings]);

  /* ---------- ProseMirror ---------- */
  useEffect(() => {
    // Start the image-id counter above every id in the document AND every id
    // a persisted dismissal references: a dismissed-then-deleted figure's id
    // must never be reissued to a new image, or the stale dismissal would
    // silently swallow the new image's missing-alt blocker (and a plain
    // collision would make alt-text edits hit the wrong figure).
    // Section image ids share the counter, so a new image never reuses one.
    const sectionNums = [stored.headerImage?.id, stored.footerImage?.id].map((id) => Number(/-img-(\d+)$/.exec(id ?? '')?.[1] ?? 0));
    imageSeq.current = Math.max(imageIdFloor(initial, stored.dismissed), ...sectionNums);

    const figureView: NodeViewConstructor = (initialNode) => {
      let node = initialNode;
      const dom = document.createElement('figure');
      dom.className = styles.figure!;
      dom.contentEditable = 'false';
      const art = document.createElement('div');
      art.className = styles.figureArt!;
      art.setAttribute('role', 'img');
      const icon = document.createElement('span');
      icon.className = styles.figureIcon!;
      icon.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
      art.append(icon);
      const caption = document.createElement('figcaption');
      caption.className = styles.figcaption!;
      dom.append(art, caption);
      // The picture: none (a placeholder), loading, ready, or failed (its bytes
      // can't be had here). The wrapper's name is the alt text either way.
      let shown: string | null = null;
      let state: 'none' | 'loading' | 'ready' | 'failed' = 'none';
      const render = () => {
        const alt = node.attrs.alt as string;
        const label = node.attrs.label as string;
        // Mirrors the id toDOM would emit: nothing else on the live DOM identifies
        // which figure is which (devtools, tests, or future scripting).
        dom.dataset.figureId = node.attrs.id as string;
        art.dataset.state = state;
        const size = figureSize(node.attrs.size);
        if (size) art.dataset.size = size; else delete art.dataset.size;
        art.dataset.align = figureAlign(node.attrs.align);
        art.setAttribute('aria-label', `${alt || `${label}, no alternative text`}${state === 'failed' ? ', image unavailable' : ''}`);
        const status = document.createElement('span');
        status.className = alt ? styles.altText! : styles.missingBadge!;
        status.textContent = alt ? `Alt text: “${alt}”` : 'Missing alt text';
        const parts: Node[] = [status];
        if (state === 'failed') {
          const gone = document.createElement('span');
          gone.className = styles.altText!;
          gone.textContent = 'Image unavailable';
          parts.push(gone);
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.className = styles.linkBtn!;
        button.textContent = `${alt ? 'Edit' : 'Add'} alt text for ${label}`;
        button.addEventListener('click', () => handlersRef.current.editFigureAlt(node.attrs.id as string));
        parts.push(button);
        // Only a real picture has a size to choose.
        if (validImageKey(node.attrs.image)) {
          const layout = document.createElement('button');
          layout.type = 'button';
          layout.className = styles.linkBtn!;
          layout.textContent = `Size and position for ${label}`;
          layout.addEventListener('click', () => handlersRef.current.editFigureLayout(node.attrs.id as string));
          parts.push(layout);
        }
        caption.replaceChildren(...parts);
      };
      const load = () => {
        const key = validImageKey(node.attrs.image);
        if (key === shown) return;
        if (shown) releaseUrl(shown);
        shown = key;
        art.replaceChildren(icon);
        state = key ? 'loading' : 'none';
        if (!key) return;
        void acquireUrl(key).then((url) => {
          if (shown !== key) return;
          if (!url) { state = 'failed'; render(); return; }
          const img = document.createElement('img');
          img.alt = '';
          img.draggable = false;
          if (node.attrs.width && node.attrs.height) { img.width = node.attrs.width as number; img.height = node.attrs.height as number; }
          img.onerror = () => { if (shown === key) { art.replaceChildren(icon); state = 'failed'; render(); } };
          img.src = url;
          art.replaceChildren(img);
          state = 'ready';
          render();
        });
      };
      load();
      render();
      return {
        dom,
        update(next) {
          if (next.type !== node.type) return false;
          node = next;
          load();
          render();
          return true;
        },
        destroy() { if (shown) releaseUrl(shown); },
        stopEvent: (event) => !!(event.target as HTMLElement).closest?.('button'),
        ignoreMutation: () => true,
      };
    };

    // A real <table> whose <tbody> is the editable content, with its caption
    // (an attribute, not text in the document) shown and editable here.
    const tableView: NodeViewConstructor = (initialNode, _view, getPos) => {
      let node = initialNode;
      const dom = document.createElement('table');
      const caption = document.createElement('caption');
      caption.contentEditable = 'false';
      const contentDOM = document.createElement('tbody');
      dom.append(contentDOM);
      const render = () => {
        const text = String(node.attrs.caption ?? '');
        if (!text) { caption.remove(); return; }
        const button = document.createElement('button');
        button.type = 'button';
        button.className = styles.captionEdit!;
        button.textContent = 'Edit caption';
        button.addEventListener('click', () => { const pos = getPos(); if (pos !== undefined) handlersRef.current.editTableCaption(pos); });
        caption.replaceChildren(document.createTextNode(text), button);
        if (!caption.isConnected) dom.prepend(caption);
      };
      render();
      return {
        dom,
        contentDOM,
        update(next) {
          if (next.type !== node.type) return false;
          node = next;
          render();
          return true;
        },
        stopEvent: (event) => caption.contains(event.target as Node),
        ignoreMutation: (m) => m.type !== 'selection' && (caption.contains(m.target) || m.target === dom),
      };
    };

    // Highlights the active finding's span, as the design does, on top of the
    // shape-carrying underline from issueUnderlinePlugin.
    const activeHighlight = new Plugin({
      props: {
        decorations(state) {
          const f = findingsRef.current.find((x) => x.id === activeRef.current);
          // A table finding outlines the whole table: an outline, not colour alone.
          if (f?.anchor.kind === 'table' && state.doc.nodeAt(f.from)?.type === nodeTypes.table && f.from + state.doc.nodeAt(f.from)!.nodeSize === f.to) {
            return DecorationSet.create(state.doc, [Decoration.node(f.from, f.to, { class: styles.activeTable!, 'data-severity': f.severity })]);
          }
          if (!f || f.anchor.kind !== 'text' || f.to <= f.from) return null;
          return DecorationSet.create(state.doc, [Decoration.inline(f.from, f.to, { class: styles.activeMark!, 'data-severity': f.severity })]);
        },
      },
    });

    const view = new EditorView(mountRef.current, {
      state: EditorState.create({
        doc: initial,
        plugins: [
          ...editingPlugins(),
          // Where a dragged picture (or text) will land.
          dropCursor({ color: 'var(--as-primary)', width: 2 }),
          issueUnderlinePlugin(() => findingsRef.current.filter((f) => f.anchor.kind === 'text' && f.to > f.from)),
          activeHighlight,
        ],
      }),
      nodeViews: { figure: figureView, table: tableView },
      // The document's language, so spellcheck and screen readers use it here too.
      attributes: (state) => ({
        id: 'document-text',
        class: styles.prose!,
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Document text',
        'aria-describedby': 'table-keys-hint',
        spellcheck: 'true',
        lang: documentLanguage(state.doc),
        dir: isRtlLanguage(documentLanguage(state.doc)) ? 'rtl' : 'ltr',
      }),
      // Pasted or copied images get fresh ids: a copy of an image in this document
      // would otherwise share its id, and alt-text edits would hit the wrong one.
      // Pasted text loses any mark for the document's own language.
      // Pasted image files (a screenshot) go the same way as chosen ones.
      handlePaste(_view, event) {
        const files = [...(event.clipboardData?.files ?? [])].filter((f) => (IMAGE_MIMES as readonly string[]).includes(f.type));
        if (!files.length) return false;
        void handlersRef.current.insertImageFiles(files);
        return true;
      },
      // Files dropped on the page land where they're dropped. A drag within
      // the document, or of text, is ProseMirror's own. A dropped file that
      // isn't a picture is refused out loud rather than opened by the browser.
      handleDrop(dropView, event, _slice, moved) {
        const all = [...(event.dataTransfer?.files ?? [])];
        if (moved || !all.length) return false;
        event.preventDefault();
        const files = all.filter((f) => f.type === '' || (IMAGE_MIMES as readonly string[]).includes(f.type));
        if (!files.length) { handlersRef.current.refuseImage(); return true; }
        const at = dropView.posAtCoords({ left: event.clientX, top: event.clientY });
        if (at) dropView.dispatch(dropView.state.tr.setSelection(TextSelection.near(dropView.state.doc.resolve(at.pos))));
        void handlersRef.current.insertImageFiles(files);
        return true;
      },
      transformPasted(slice, pasteView) {
        const pageLang = documentLanguage(pasteView.state.doc);
        const renumber = (fragment: Fragment): Fragment => {
          const nodes: PMNode[] = [];
          fragment.forEach((node) => {
            if (node.type === nodeTypes.figure) {
              const n = ++imageSeq.current;
              nodes.push(node.type.create({ ...node.attrs, id: `img-${n}`, label: `pasted image ${n}` }));
            } else {
              nodes.push(node.isText ? withoutPageLanguage(node, pageLang) : node.isLeaf ? node : node.copy(renumber(node.content)));
            }
          });
          return Fragment.from(nodes);
        };
        return new Slice(renumber(slice.content), slice.openStart, slice.openEnd);
      },
      handleClick(_view, _pos, event) {
        const id = (event.target as HTMLElement).closest?.('[data-issue-id]')?.getAttribute('data-issue-id');
        if (id) handlersRef.current.activate(id);
        return false;
      },
      handleDOMEvents: {
        // Prose-heuristic rules are gated on blur (§8.1) so they never flag a
        // sentence still being typed. Returning false lets PM's own handling run.
        blur: () => { handlersRef.current.runFullCheck(); return false; },
      },
      dispatchTransaction(tr) {
        const next = view.state.apply(tr);
        if (tr.docChanged) {
          // Keep findings pinned to their text as the document changes; one
          // deleted outright goes with it. Engine findings get fresh positions
          // from the run below anyway — this mapping is what carries the gated
          // PROSE findings across keystrokes until the next blur/Recheck (§8.1).
          // carryPositions is identity-preserving: a no-op edit allocates
          // nothing, so reconcile's array-identity fast path (§9.4) engages.
          findingsRef.current = carryPositions(findingsRef.current, (pos, bias) => tr.mapping.map(pos, bias));
          // Structural rules run live on every edit — they cannot false-positive
          // on partial input. Computed BEFORE updateState so the underline
          // decoration layer builds once, against the fresh findings (§9.5).
          // A change of the document's language (the menu, Apply, or undoing
          // either) changes what every language finding means: that edit runs
          // the full check, so no finding about the old language is carried.
          const languageChanged = documentLanguage(view.state.doc) !== documentLanguage(next.doc);
          const fresh = checkDocument(next.doc, { prose: languageChanged });
          findingsRef.current = reconcile(findingsRef.current, fresh, dismissedRef.current, { keepProse: !languageChanged });
          setWordCount(wordsIn(next));
        }
        view.updateState(next);
        setFormat(formatState(next));
        if (tr.docChanged) {
          // reconcile returns the SAME array when nothing changed (§9.4): skip
          // the render, the findings-list re-sort and the decoration rebuild.
          if (findingsRef.current !== lastRenderedRef.current) setFindings(findingsRef.current);
          handlersRef.current.docChanged();
          scheduleSave();
        }
      },
    });
    viewRef.current = view;
    setFormat(formatState(view.state));
    return () => {
      // Flush a pending save BEFORE destroy: saveNow reads viewRef, and React
      // runs this cleanup before the persistence effect's, so this is the last
      // moment the document can be saved on SPA navigation.
      flushSave();
      view.destroy();
      viewRef.current = null;
    };
  }, [initial]);

  // Rebuild decorations whenever findings or the active finding change outside
  // a document edit (accept, dismiss, filter, selection in the list).
  useEffect(() => {
    activeRef.current = active?.id ?? null;
    const view = viewRef.current;
    if (view) view.dispatch(view.state.tr.setMeta(issueUnderlineKey, true).setMeta('addToHistory', false));
  }, [findings, active?.id]);

  // After a finding is removed, put focus somewhere meaningful: the next card,
  // or the findings heading when none remain. Never let it fall to <body>.
  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    (activeCardRef.current ?? headingRef.current)?.focus();
  }, [findings]);

  /* ---------- checking status ---------- */
  // The gated full run (§8.1): every rule, prose heuristics included. Fires on
  // editor blur and on the explicit Recheck action — never mid-keystroke. The
  // engine is memoized, so an unchanged document costs one cache-hit walk.
  const runFullCheck = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const next = reconcile(findingsRef.current, checkDocument(view.state.doc, { prose: true }), dismissedRef.current);
    if (next !== findingsRef.current) setFindings(next);
    saveDoc(doc.id, { lastChecked: Date.now() });
  }, [setFindings, doc.id]);

  const markChecking = useCallback((done?: () => void) => {
    clearTimeout(checkTimer.current);
    setChecking(true);
    checkTimer.current = setTimeout(() => { setChecking(false); done?.(); }, 900);
  }, []);
  useEffect(() => () => clearTimeout(checkTimer.current), []);

  /* ---------- persistence (§3) ---------- */
  const saveNow = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    saveDoc(doc.id, {
      content: view.state.doc.toJSON() as DocJSON,
      header: sectionsRef.current.header.text,
      footer: sectionsRef.current.footer.text,
      headerImage: sectionsRef.current.header.image,
      footerImage: sectionsRef.current.footer.image,
    });
  }, [doc.id]);
  // Debounced save, hand-rolled setTimeout — no debounce library (§9.7).
  const scheduleSave = useCallback(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { saveTimer.current = undefined; saveNow(); }, 500);
  }, [saveNow]);
  // Dismissals write immediately, never debounced: they are discrete user
  // decisions, and losing one to a fast reload would resurrect a finding the
  // user already answered.
  const persistDismissed = useCallback(() => {
    saveDoc(doc.id, { dismissed: [...dismissedRef.current] });
  }, [doc.id]);
  // Flush a pending debounced save immediately. Two callers: pagehide (reload
  // or tab close) and the editor view's cleanup — SPA navigation (Next Link)
  // fires no pagehide, and unmounting is the last moment the live view exists
  // to be saved.
  const flushSave = useCallback(() => {
    if (saveTimer.current === undefined) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    saveNow();
  }, [saveNow]);
  useEffect(() => {
    window.addEventListener('pagehide', flushSave);
    return () => {
      window.removeEventListener('pagehide', flushSave);
      clearTimeout(saveTimer.current);
    };
  }, [flushSave]);
  // The mount check counts as a full check: the doc is current as of now.
  useEffect(() => { saveDoc(doc.id, { lastChecked: Date.now() }); }, [doc.id]);

  const download = (blob: Blob, file: string) => {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: file });
    a.click();
    // Revoking synchronously can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /** Every picture an export needs: the document's and the bands'. */
  const bandAndDocKeys = (content: PMNode) => {
    const s = sectionsRef.current;
    return [...new Set([...imageKeys(content), ...[s.header.image?.image, s.footer.image?.image].flatMap((k) => (validImageKey(k) ? [k as string] : []))])];
  };

  /** Said after an export when some pictures couldn't be had here. */
  const unavailable = (n: number) => (n ? ` ${n === 1 ? '1 image wasn’t' : `${n} images weren’t`} available here, so ${n === 1 ? 'it was' : 'they were'} exported as ${n === 1 ? 'a placeholder' : 'placeholders'}.` : '');

  const onExport = async () => {
    const view = viewRef.current;
    if (!view) return;
    const content = view.state.doc;
    const s = sectionsRef.current;
    const { images, missing } = await resolveForHtml(bandAndDocKeys(content));
    const html = exportHtml(content, { title: doc.title, header: s.header.text, footer: s.footer.text, headerImage: s.header.image, footerImage: s.footer.image }, document.implementation.createHTMLDocument(''), images);
    const file = `${doc.id}.html`;
    download(new Blob([html], { type: 'text/html' }), file);
    announce(`Exported ${file}. ${summaryLine(findingsRef.current)}.${unavailable(missing)}`);
  };

  // Needs a connection in cloud mode (sync.ts removeDoc): nothing is queued,
  // so a deleted document can't return. A save that fires after the delete
  // finds no document and writes nothing.
  const onDelete = async () => {
    if (deleting.current || !window.confirm(`Delete “${doc.title}”? This can’t be undone.`)) return;
    deleting.current = true;
    clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    setDeleteError(false);
    const done = await removeDoc(doc.id);
    deleting.current = false;
    if (!done) { setDeleteError(true); return; }
    router.push('/');
    announce(`Deleted ${doc.title}.`);
  };

  const onExportPdf = async () => {
    const view = viewRef.current;
    if (!view || pdfBusy.current) return;
    pdfBusy.current = true;
    // The document as it was when the button was pressed.
    const content = view.state.doc;
    const s = sectionsRef.current;
    announce('Building the PDF…');
    try {
      // Loaded on first use: PDFKit and the fonts stay out of the editor's bundle.
      const { exportPdf, PDF_FONT_FILES } = await import('./exportPdf');
      const faces = await Promise.all(Object.entries(PDF_FONT_FILES).map(async ([face, url]) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${url}: ${res.status}`);
        return [face, new Uint8Array(await res.arrayBuffer())] as const;
      }));
      const { images, missing } = await resolveForPdf(bandAndDocKeys(content));
      const result = await exportPdf(content, { title: doc.title, header: s.header.text, footer: s.footer.text, headerImage: s.header.image, footerImage: s.footer.image }, Object.fromEntries(faces) as Record<keyof typeof PDF_FONT_FILES, Uint8Array>, images);
      if (!result.ok) {
        setPdfMissing(result.missing);
        announce(`PDF not exported: its font has no characters for ${result.missing.length === 1 ? 'one character' : `${result.missing.length} characters`} in this document. The findings panel lists them.`);
        return;
      }
      setPdfMissing([]);
      const file = `${doc.id}.pdf`;
      download(new Blob([result.bytes as BlobPart], { type: 'application/pdf' }), file);
      announce(`Exported ${file}. ${summaryLine(findingsRef.current)}.${unavailable(missing)}`);
    } catch {
      announce('The PDF could not be built. Try again, or use Export HTML.');
    } finally {
      pdfBusy.current = false;
    }
  };

  const onRecheck = () => {
    announce('Checking the document…');
    runFullCheck();
    // Purely cosmetic: the work above already finished, synchronously.
    markChecking(() => announce(`Checks up to date. ${summaryLine(findingsRef.current)}.`));
  };

  /* ---------- editor commands ---------- */
  const run = useCallback((command: Command) => {
    const view = viewRef.current;
    if (!view) return;
    command(view.state, view.dispatch);
    view.focus();
  }, []);

  // Insert image opens the file picker; the chosen file comes back through
  // here, for the document or (from the header/footer dialog) for a band.
  const imageTarget = useRef<Section | null>(null);
  const insertImage = () => {
    imageTarget.current = null;
    setImageError('');
    imageInputRef.current?.click();
  };

  const insertImageFile = async (file: File, clearError = true) => {
    const view = viewRef.current;
    if (!view) return;
    if (clearError) setImageError('');
    try {
      if (file.size > MAX_SOURCE_BYTES) throw new ImageError('size', 'That image is over 40 MB. Use a smaller copy.');
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (sniffImage(bytes)?.kind !== 'image') throw new ImageError('type', 'That file isn’t a PNG, JPEG, GIF or WebP image.');
      // Decoding also proves it draws: its header can be right and the rest broken.
      const prepared = await prepareImage(bytes).catch((e: unknown) => {
        throw e instanceof UnreadableImage ? new ImageError('type', 'That image couldn’t be read. It may be damaged.') : e;
      });
      if (prepared.bytes.length > MAX_IMAGE_BYTES) throw new ImageError('size', 'That image is still over 10 MB after shrinking. Use a smaller copy.');
      const stored = await putImage(prepared.bytes);
      const resized = prepared.resized ? `, resized to ${stored.width} by ${stored.height} pixels` : '';
      const section = imageTarget.current;
      imageTarget.current = null;
      if (section) {
        const sid = `${section}-img-${++imageSeq.current}`;
        updateSection(section, { image: { id: sid, alt: '', image: stored.key, width: stored.width, height: stored.height } });
        const old = sectionsRef.current[section].image;
        setFindings([...findingsRef.current.filter((f) => f.id !== `img-alt-${old?.id}`), imageFinding(sid, `${section} image`, { kind: 'section', section })]);
        announce(`Image added to the ${section}${resized}. It has no alternative text yet, so it was added as a blocking finding.`);
        return;
      }
      const n = ++imageSeq.current;
      const id = `img-${n}`;
      const label = file.name.replace(/\.[^.]+$/, '').replace(/\s+/g, ' ').trim().slice(0, 80) || `inserted image ${n}`;
      const current = viewRef.current ?? view;
      // The dispatch's check adds the missing-alt blocker.
      current.dispatch(current.state.tr.replaceSelectionWith(nodeTypes.figure!.create({ id, label, image: stored.key, width: stored.width, height: stored.height })).scrollIntoView());
      setActiveId(`img-alt-${id}`);
      setFilter(null);
      current.focus();
      announce(`Image inserted: ${label}${resized}. It has no alternative text yet, so it was added as a blocking finding.`);
    } catch (error) {
      // Shown, and read out once by role="alert".
      setImageError(error instanceof ImageError ? error.message : 'That image couldn’t be added.');
    }
  };

  /** Several at once (a drop, a paste), in order, each after the last; into
   *  the document, never a header or footer band. */
  const insertImageFiles = async (files: File[]) => {
    imageTarget.current = null;
    setImageError('');
    // A refusal stays shown while the rest go in.
    for (const file of files) await insertImageFile(file, false);
  };

  /* ---------- tables ---------- */
  const tableSize = (state = viewRef.current?.state) => {
    const t = state ? formatState(state).table : null;
    return t ? `${t.rows} ${t.rows === 1 ? 'row' : 'rows'}, ${t.cols} ${t.cols === 1 ? 'column' : 'columns'}` : '';
  };

  const doInsertTable = (spec: NewTable) => {
    const view = viewRef.current;
    if (!view) return;
    setTableOpen(false);
    // Focus moves into the table once the dialog has closed (focusDocument).
    if (!insertTable(spec)(view.state, view.dispatch)) {
      announce('A table can’t go inside a table. Move the cursor out of this one first.');
      return;
    }
    const size = `${spec.rows} ${spec.rows === 1 ? 'row' : 'rows'}, ${spec.cols} ${spec.cols === 1 ? 'column' : 'columns'}`;
    const headed = spec.headerRow || spec.headerColumn;
    if (!headed) {
      // The dispatch's check added the blocker: make it the active card.
      const around = tableAround(view.state);
      const f = around ? findingsRef.current.find((x) => x.anchor.kind === 'table' && x.from === around.pos && x.id.startsWith('table-no-header')) : undefined;
      if (f) { setActiveId(f.id); setFilter(null); }
    }
    announce(headed
      ? `Table inserted: ${size}, with ${spec.headerRow ? 'a header row' : 'a header column'}. Tab moves between cells.`
      : `Table inserted: ${size}, without header cells, so it was added as a blocking finding. Tab moves between cells.`);
  };

  const onTable = (action: TableAction, enabled: boolean) => {
    const view = viewRef.current;
    if (!view) return;
    if (!enabled) {
      announce(action === 'insert' ? 'A table can’t go inside a table. Move the cursor out of this one first.'
        : action === 'splitCell' ? 'Only a merged cell can be split.'
          : 'Put the cursor in a table first.');
      return;
    }
    if (action === 'insert') { setTableOpen(true); return; }
    if (action === 'caption') { setCaptionInitial(formatState(view.state).table?.caption ?? ''); return; }
    const before = formatState(view.state).table;
    run(tableCommands[action]);
    const size = tableSize();
    const said: Record<Exclude<TableAction, 'insert' | 'caption'>, string> = {
      addRowBefore: `Row added above. ${size}.`,
      addRowAfter: `Row added below. ${size}.`,
      addColumnBefore: `Column added before. ${size}.`,
      addColumnAfter: `Column added after. ${size}.`,
      deleteRow: size ? `Row deleted. ${size}.` : 'Row deleted, and with it the table.',
      deleteColumn: size ? `Column deleted. ${size}.` : 'Column deleted, and with it the table.',
      toggleHeaderRow: before?.headerRow ? 'Header row off.' : 'Header row on.',
      toggleHeaderColumn: before?.headerColumn ? 'Header column off.' : 'Header column on.',
      splitCell: `Cell split. ${size}.`,
      deleteTable: 'Table deleted.',
    };
    announce(`${said[action]} ${remaining(findingsRef.current)}`);
  };

  const saveCaption = (caption: string) => {
    const view = viewRef.current;
    setCaptionInitial(null);
    if (!view) return;
    setTableCaption(caption)(view.state, view.dispatch);
    announce(caption ? `Caption saved: ${caption}.` : 'Caption removed.');
  };

  const openLink = () => {
    const view = viewRef.current;
    if (!view) return;
    if (view.state.selection.empty) {
      announce('Select the text you want to turn into a link first.');
      view.focus();
      return;
    }
    setLinkInitial(currentLink(view.state));
    setLinkOpen(true);
  };

  /* ---------- findings actions ---------- */
  const remaining = (list: EditorFinding[]) => `${list.length} open. ${summaryLine(list)}.`;

  const removeFinding = (f: EditorFinding) => {
    const rest = findingsRef.current.filter((x) => x.id !== f.id);
    pendingFocus.current = true;
    // The active card falls back to the first visible finding on its own.
    setFindings(rest);
    return rest;
  };

  // The document's language is set, not a range fixed. The dispatch runs the
  // full check itself (see dispatchTransaction), so what's announced is current.
  const changeDocLanguage = (lang: string) => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch(view.state.tr.setDocAttribute('lang', lang));
    announce(`Document language set to ${languageName(lang)}. ${remaining(findingsRef.current)}`);
  };

  const onApply = (f: EditorFinding) => {
    const view = viewRef.current;
    if (!view || f.suggestion === undefined) return;
    if (f.fix?.kind === 'docLang') {
      removeFinding(f);
      changeDocLanguage(f.fix.lang);
      return;
    }
    // The two machine-decidable rule fixes are attribute changes, not text
    // replacements: applying them as text would write a literal "h2" into a
    // heading or replace a figure node with its alt string. Resolve the target
    // node FIRST and bail if it vanished between the check and the click — a
    // stale Apply must be a no-op, never a setNodeMarkup with empty attrs.
    let tr: Transaction;
    if (f.fix?.kind === 'headingLevel') {
      const $pos = view.state.doc.resolve(f.from);
      const pos = $pos.before($pos.depth);
      const node = view.state.doc.nodeAt(pos);
      if (!node) return;
      tr = view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, level: f.fix.level });
    } else if (f.fix?.kind === 'figureAlt') {
      const node = view.state.doc.nodeAt(f.from);
      if (!node) return;
      tr = view.state.tr.setNodeMarkup(f.from, undefined, { ...node.attrs, alt: f.fix.alt });
    } else if (f.fix?.kind === 'defaultColours') {
      if (f.from >= f.to || f.to > view.state.doc.content.size) return;
      tr = view.state.tr.removeMark(f.from, f.to, markTypes.textColor!).removeMark(f.from, f.to, markTypes.highlight!);
    } else if (f.fix?.kind === 'lang') {
      if (f.from >= f.to || f.to > view.state.doc.content.size) return;
      tr = view.state.tr.addMark(f.from, f.to, markTypes.lang!.create({ lang: f.fix.lang }));
    } else if (f.fix?.kind === 'tableHeaderRow') {
      let made: Transaction | undefined;
      if (!makeFirstRowHeader(f.from)(view.state, (t) => { made = t; }) || !made) return;
      tr = made;
    } else {
      tr = view.state.tr.insertText(f.suggestion, f.from, f.to);
    }
    const rest = removeFinding(f);
    view.dispatch(tr);
    announce(`Fix applied: ${f.title}. ${remaining(rest)}`);
  };

  const onDismiss = (f: EditorFinding) => {
    dismissedRef.current.add(dismissKeyOf(f));
    persistDismissed();
    const rest = removeFinding(f);
    announce(`Dismissed: ${f.title}. ${remaining(rest)}`);
  };

  const onGoTo = (f: EditorFinding) => {
    const view = viewRef.current;
    if (!view) return;
    if (f.anchor.kind === 'section') {
      setHfTab(f.anchor.section);
      setHfOpen(true);
      return;
    }
    // A table: the cursor goes into its first cell, where the Table menu works.
    if (f.anchor.kind === 'table' && view.state.doc.nodeAt(f.from)?.type !== nodeTypes.table) return;
    const selection = f.anchor.kind === 'figure'
      ? NodeSelection.create(view.state.doc, f.from)
      : f.anchor.kind === 'table'
        ? TextSelection.near(view.state.doc.resolve(f.from + 1))
        : TextSelection.create(view.state.doc, f.from, f.to);
    view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
    view.focus();
  };

  const toggleFilter = (s: OpenSeverity) => {
    const next = filter === s ? null : s;
    setFilter(next);
    announce(next ? `Showing ${SEVERITY_ENCODING[next].label.toLowerCase()} findings only.` : 'Showing all findings.');
  };

  /* ---------- alt text ---------- */
  const saveAlt = (alt: string) => {
    if (!altTarget) return;
    const findingId = altTarget.kind === 'figure' ? `img-alt-${altTarget.id}` : `img-alt-${sections[altTarget.section].image?.id}`;
    // Clearing alt text is an explicit "this image is undescribed": flag it again even if dismissed.
    if (!alt && dismissedRef.current.delete(findingId)) persistDismissed();
    const exists = findingsRef.current.some((f) => f.id === findingId);
    if (altTarget.kind === 'figure') {
      const view = viewRef.current;
      if (!view) return;
      const pos = figurePos(view.state, altTarget.id);
      if (pos < 0) return;
      // The dispatch's engine reconcile updates the findings on its own: a
      // non-empty alt drops img-alt-missing, an empty alt re-adds it.
      view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...view.state.doc.nodeAt(pos)!.attrs, alt }));
    } else {
      const { section } = altTarget;
      const image = sections[section].image;
      if (!image) return;
      // Saved with the document, like the rest of the band.
      updateSection(section, { image: { ...image, alt } });
      if (alt && exists) setFindings(findingsRef.current.filter((f) => f.id !== findingId));
      if (!alt && !exists) setFindings([...findingsRef.current, imageFinding(image.id, altTarget.label, { kind: 'section', section })]);
    }
    announce(alt ? `Alt text saved for ${altTarget.label}.` : `Alt text cleared for ${altTarget.label}. It is flagged as blocking again.`);
    setAltTarget(null);
  };

  /* ---------- picture size and position ---------- */
  const saveLayout = ({ size, align }: { size: FigureSize | null; align: FigureAlign }) => {
    const view = viewRef.current;
    const target = layoutTarget;
    setLayoutTarget(null);
    if (!view || !target) return;
    const pos = figurePos(view.state, target.id);
    if (pos < 0) return;
    view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...view.state.doc.nodeAt(pos)!.attrs, size, align }));
    const where = size === 'full' ? '' : `, ${ALIGN_NAMES[align].toLowerCase()}`;
    announce(`${target.label}: ${SIZE_NAMES[size ?? 'original'].toLowerCase()}${where}.`);
  };

  handlersRef.current = {
    insertImageFiles,
    editFigureLayout: (id) => {
      const view = viewRef.current;
      if (!view) return;
      const node = view.state.doc.nodeAt(figurePos(view.state, id));
      if (node) setLayoutTarget({ id, label: node.attrs.label as string, size: figureSize(node.attrs.size), align: figureAlign(node.attrs.align) });
    },
    refuseImage: () => setImageError('That file isn’t a PNG, JPEG, GIF or WebP image.'),
    editTableCaption: (pos) => {
      const view = viewRef.current;
      const table = view?.state.doc.nodeAt(pos);
      if (!view || !table || table.type !== nodeTypes.table) return;
      // The caption dialog edits the table the cursor is in: put it there.
      view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos + 1))));
      setCaptionInitial(String(table.attrs.caption ?? ''));
    },
    editFigureAlt: (id) => {
      const view = viewRef.current;
      if (!view) return;
      const node = view.state.doc.nodeAt(figurePos(view.state, id));
      if (node) setAltTarget({ kind: 'figure', id, label: node.attrs.label as string, alt: node.attrs.alt as string });
    },
    activate: (id) => { setActiveId(id); setFilter(null); },
    docChanged: () => markChecking(),
    runFullCheck,
  };

  /* ---------- header & footer ---------- */
  const updateSection = (key: Section, patch: Partial<SectionState>) => {
    setSections((s) => ({ ...s, [key]: { ...s[key], ...patch } }));
    scheduleSave();
  };

  const sectionSpacing = (key: Section, delta: number) => {
    const spacing = Math.max(4, Math.min(40, sections[key].spacing + delta));
    updateSection(key, { spacing });
    announce(`${key === 'header' ? 'Header' : 'Footer'} distance from edge ${spacing} pixels.`);
  };

  // The same file picker as Insert image; the picture lands in this band.
  const sectionInsertImage = (key: Section) => {
    imageTarget.current = key;
    setImageError('');
    imageInputRef.current?.click();
  };

  const sectionRemoveImage = (key: Section) => {
    const image = sections[key].image;
    if (!image) return;
    updateSection(key, { image: null });
    setFindings(findingsRef.current.filter((f) => f.id !== `img-alt-${image.id}`));
    announce(`Image removed from the ${key}.`);
  };

  /* ---------- render ---------- */
  const band = (key: Section) => {
    const s = sections[key];
    return (
      <div
        className={styles.band}
        data-edge={key}
        lang={docLang}
        dir={isRtlLanguage(docLang) ? 'rtl' : 'ltr'}
        style={{ paddingBlock: `${s.spacing}px`, textAlign: s.align }}
      >
        {s.image ? (
          <span className={s.image.image ? styles.bandPicture : styles.bandImage} role="img" aria-label={s.image.alt || `${key} image, no alternative text`}>
            {s.image.image ? <StoredImg imageKey={s.image.image} fallback={12} /> : <ImageIcon size={12} />}
          </span>
        ) : null}
        {s.text}
      </div>
    );
  };

  return (
    <div className={`${styles.palette} ${styles.root}`}>
      <header className={styles.topbar}>
        <nav aria-label="Breadcrumb" className={styles.crumbs}>
          <span className={styles.brandMark} aria-hidden="true">A</span>
          <span className={styles.brandName}>A11y Studio</span>
          <span className={styles.crumbSep} aria-hidden="true">/</span>
          <Link href="/" className={styles.crumbLink}>Documents</Link>
        </nav>
        <div className={styles.topbarEnd}>
          <span className={styles.status}>
            <span className={styles.statusDot} data-checking={checking} aria-hidden="true" />
            {checking ? 'Checking…' : 'Up to date'}
          </span>
          {isCloud ? <SaveStatus /> : null}
          <span className={styles.avatar} aria-hidden="true">JD</span>
        </div>
      </header>

      <div className={styles.docHeader}>
        <div className={styles.docHeaderStart}>
          <Link href="/" className={styles.back} aria-label="Back to all documents">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4l-6 6 6 6" /></svg>
          </Link>
          <div className={styles.docHeaderText}>
            <h1 className={styles.docTitle}>{doc.title}</h1>
            <ul className={styles.chips} aria-label="Conformance targets" role="list">
              {doc.targets.map((t) => <li key={t} className={styles.chip} data-tone={TARGET_TONE[t] ?? 'blue'}>{t}</li>)}
            </ul>
          </div>
        </div>
        <div className={styles.docActions}>
          <label className={styles.docLang}>
            Language
            <select aria-label="Document language" value={docLang} onChange={(e) => changeDocLanguage(e.target.value)}>
              {/* A tag from an imported file ("es-MX") shows as itself until changed. */}
              {LANGUAGE_MENU.some((l) => l.code === docLang) ? null : <option value={docLang}>{`${languageName(docLang)} (${docLang})`}</option>}
              {LANGUAGE_MENU.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
          </label>
          <button type="button" className={styles.btnSubtle} onClick={() => void onExport()}>Export HTML</button>
          <button type="button" className={styles.btnSubtle} onClick={() => void onExportPdf()}>Export PDF</button>
          <button type="button" className={styles.btnSubtle} onClick={onRecheck}>Recheck</button>
          <button type="button" className={styles.btnSubtle} onClick={() => void onDelete()}>Delete document</button>
        </div>
      </div>
      {deleteError ? <p role="alert" className={styles.deleteError}>This document couldn’t be deleted. Check your connection and try again.</p> : null}
      {imageError ? <p role="alert" className={styles.deleteError}>{imageError}</p> : null}
      {/* Insert image's file picker: opened by the toolbar button, never a tab stop of its own. */}
      <input
        ref={imageInputRef}
        type="file"
        accept={IMAGE_MIMES.join(',')}
        hidden
        tabIndex={-1}
        aria-label="Choose an image"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void insertImageFile(file);
        }}
      />

      <div className={styles.body}>
        <main ref={docRegion} tabIndex={-1} aria-label="Document" className={styles.docMain}>
          <Toolbar
            format={format}
            run={run}
            onFontFamily={(family) => run(setMark(markTypes.fontFamily!, family === 'Default' ? null : { family }))}
            onFontSize={(size) => run(setMark(markTypes.fontSize!, { size: Number(size) }))}
            onTextColor={(color) => run(setMark(markTypes.textColor!, { color }))}
            onHighlight={(color) => run(setMark(markTypes.highlight!, color ? { color } : null))}
            onLanguage={(lang) => {
              // Like links: a language is set on existing text. A stored mark
              // would cover only the first character typed (the mark is not
              // inclusive, so the next keystroke drops it).
              if (viewRef.current?.state.selection.empty ?? true) {
                announce('Select the text you want to mark first.');
                return;
              }
              run(setMark(markTypes.lang!, lang ? { lang } : null));
              announce(lang ? `Marked as ${languageName(lang)}.` : 'Language mark removed.');
            }}
            commands={{
              bold: toggleBold,
              italic: toggleItalic,
              underline: toggleUnderline,
              h1: toggleHeading(1),
              h2: toggleHeading(2),
              ul: toggleList(nodeTypes.bullet_list!),
              ol: toggleList(nodeTypes.ordered_list!),
              indent,
              outdent,
              clear: clearFormatting,
            }}
            onLink={openLink}
            onImage={insertImage}
            onTable={onTable}
            onHeaderFooter={() => { setHfTab('header'); setHfOpen(true); }}
            headerFooterOpen={hfOpen}
          />
          <div className={styles.page}>
            {band('header')}
            <div ref={mountRef} />
            {/* The editor's description: how to move through and out of a table. */}
            <span id="table-keys-hint" className="ada-visually-hidden">In a table, Tab moves between cells. Press Escape, then Tab, to leave the table.</span>
            {band('footer')}
          </div>
          <p className={styles.wordCount}>{`${wordCount} words`}</p>
        </main>

        <aside ref={findingsRegion} tabIndex={-1} aria-label="Accessibility findings" className={styles.aside}>
          <section aria-labelledby="summary-heading" className={styles.summaryCard}>
            <h2 id="summary-heading" className={styles.summaryHeading}>Findings summary</h2>
            <div className={styles.sevBar} aria-hidden="true">
              {OPEN_SEVERITIES.filter((s) => counts[s] > 0).map((s) => (
                <span key={s} className={styles.sevSeg} data-severity={s} style={{ flexGrow: counts[s] }} />
              ))}
            </div>
            {findings.length > 0 ? (
              <div className={styles.sevRows} role="group" aria-label="Filter findings by severity">
                {OPEN_SEVERITIES.filter((s) => counts[s] > 0).map((s) => (
                  <button key={s} type="button" className={styles.sevRow} aria-pressed={filter === s} onClick={() => toggleFilter(s)}>
                    <span className={styles.sevRowLabel}>
                      <span className={styles.glyph} data-severity={s}><Glyph severity={s} /></span>
                      {SEVERITY_ENCODING[s].label}
                    </span>
                    <span className={styles.count}>{counts[s]}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <p className={styles.summaryLine}>
              {filter ? `Showing ${SEVERITY_ENCODING[filter].label.toLowerCase()} findings only` : summaryLine(findings)}
            </p>
            {primaryTag(docLang) === 'en' ? null : (
              <p className={styles.summaryLine}>
                Wording checks (reading level, sentence length, link text, colour words, alt-text wording) run on English documents only.
              </p>
            )}
          </section>

          {importNotes.length > 0 ? (
            <section aria-labelledby="import-notes-heading" className={styles.summaryCard}>
              <h2 id="import-notes-heading" className={styles.summaryHeading}>Not carried over from Word</h2>
              <ul className={styles.importNotes}>
                {importNotes.map((n) => <li key={n}>{n}</li>)}
              </ul>
              <button
                type="button"
                className={styles.btnSubtle}
                onClick={() => {
                  setImportNotes([]);
                  saveDoc(doc.id, { importNotes: [] });
                  announce('Import notes dismissed.');
                  // The button is gone; keep keyboard focus in the findings panel.
                  headingRef.current?.focus();
                }}
              >
                Dismiss import notes
              </button>
            </section>
          ) : null}

          {pdfMissing.length > 0 ? (
            <section aria-labelledby="pdf-missing-heading" className={styles.summaryCard}>
              <h2 id="pdf-missing-heading" className={styles.summaryHeading}>PDF not exported</h2>
              {/* ponytail: the PDF embeds one Latin font (see exportPdf.ts). */}
              <p className={styles.pdfNotice}>
                The PDF font covers Latin scripts only, and this document uses characters it can’t draw:{' '}
                <span lang="">{pdfMissing.slice(0, 24).join(' ')}</span>
                {pdfMissing.length > 24 ? ` and ${pdfMissing.length - 24} more` : ''}. Export HTML keeps every script.
              </p>
              <button
                type="button"
                className={styles.btnSubtle}
                onClick={() => {
                  setPdfMissing([]);
                  announce('PDF notice dismissed.');
                  headingRef.current?.focus();
                }}
              >
                Dismiss PDF notice
              </button>
            </section>
          ) : null}

          <h2 id="ada-issues-heading" ref={headingRef} tabIndex={-1} className={styles.findingsHeading}>
            Findings <span className={styles.findingsCount}>{`(${findings.length})`}</span>
          </h2>

          {active ? (
            <div ref={activeCardRef} tabIndex={-1} role="group" className={styles.activeCard} aria-labelledby={`finding-${active.id}`}>
              <div className={styles.cardTop}>
                <span className={styles.lozenge} data-severity={active.severity}>
                  <Glyph severity={active.severity} />
                  {SEVERITY_ENCODING[active.severity].label}
                </span>
                <span className={styles.criterionChip}>{`WCAG ${active.criterion}`}</span>
              </div>
              <h3 id={`finding-${active.id}`} className={styles.cardTitle}>{active.title}</h3>
              <p className={styles.cardBody}>{active.explanation}</p>
              {active.fix?.kind === 'lang' || active.fix?.kind === 'docLang' || active.fix?.kind === 'tableHeaderRow' ? (
                // Nothing is replaced, so no struck-through diff: the text stays, marked.
                <p className={styles.diff}>
                  {active.fix.kind === 'lang'
                    ? `Suggested change: mark it as ${active.suggestion}`
                    : active.fix.kind === 'docLang'
                      ? `Suggested change: set the document language to ${active.suggestion}`
                      : 'Suggested change: make the first row a header row'}
                </p>
              ) : active.suggestion !== undefined ? (
                <p className={styles.diff}>
                  <VisuallyHidden>Suggested change: replace </VisuallyHidden>
                  <del className={styles.diffOld}>{active.original}</del>
                  <span aria-hidden="true" className={styles.diffArrow}>→</span>
                  <VisuallyHidden> with </VisuallyHidden>
                  <ins className={styles.diffNew}>{active.suggestion}</ins>
                </p>
              ) : null}
              {active.severity === 'manual' ? (
                <p className={styles.manualNote}>This needs your judgement — it can’t be determined automatically.</p>
              ) : null}
              <div className={styles.cardActions}>
                {active.suggestion !== undefined ? (
                  <button type="button" className={styles.btnPrimary} onClick={() => onApply(active)}>Apply fix</button>
                ) : null}
                {/* Document-level findings have no range to navigate to (§6): Dismiss only. */}
                {active.anchor.kind === 'document' ? null : (
                  <button type="button" className={active.suggestion !== undefined ? styles.btnSubtle : styles.btnPrimary} onClick={() => onGoTo(active)}>
                    {active.anchor.kind === 'section' ? `Edit ${active.anchor.section}` : active.anchor.kind === 'table' ? 'Go to table' : 'Go to text'}
                  </button>
                )}
                <button type="button" className={styles.btnGhost} onClick={() => onDismiss(active)}>Dismiss</button>
              </div>
            </div>
          ) : null}

          {others.length > 0 ? (
            <ul className={styles.others} role="list" aria-label="Other findings">
              {others.map((f) => (
                <li key={f.id}>
                  <button type="button" className={styles.otherBtn} onClick={() => setActiveId(f.id)}>
                    <span className={styles.glyph} data-severity={f.severity}><Glyph severity={f.severity} /></span>
                    <VisuallyHidden>{`${SEVERITY_ENCODING[f.severity].label}: `}</VisuallyHidden>
                    <span className={styles.excerpt}>{f.excerpt}</span>
                    <span className={styles.hint}>{`· ${f.hint}`}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {findings.length === 0 ? (
            <p className={styles.empty}>
              No open findings. Automated checks can’t confirm compliance on their own — alt-text quality, link wording and heading logic still need a human read.
            </p>
          ) : null}
        </aside>
      </div>

      <HeaderFooterDialog
        open={hfOpen}
        onOpenChange={setHfOpen}
        tab={hfTab}
        onTab={setHfTab}
        sections={sections}
        onChange={updateSection}
        onSpacing={sectionSpacing}
        onInsertImage={sectionInsertImage}
        onEditImageAlt={(key) => {
          const image = sections[key].image;
          if (image) setAltTarget({ kind: 'section', section: key, label: `${key} image`, alt: image.alt });
        }}
        onRemoveImage={sectionRemoveImage}
      />
      <AltTextDialog
        open={altTarget !== null}
        label={altTarget?.label ?? 'image'}
        initial={altTarget?.alt ?? ''}
        onSave={saveAlt}
        onClose={() => setAltTarget(null)}
      />
      <FigureLayoutDialog
        open={layoutTarget !== null}
        label={layoutTarget?.label ?? 'image'}
        initial={{ size: layoutTarget?.size ?? null, align: layoutTarget?.align ?? 'center' }}
        onSave={saveLayout}
        onClose={() => setLayoutTarget(null)}
      />
      <InsertTableDialog open={tableOpen} onInsert={doInsertTable} onClose={() => setTableOpen(false)} focusDocument={() => viewRef.current?.focus()} />
      <TableCaptionDialog open={captionInitial !== null} initial={captionInitial ?? ''} onSave={saveCaption} onClose={() => setCaptionInitial(null)} focusDocument={() => viewRef.current?.focus()} />
      <LinkDialog
        open={linkOpen}
        initial={linkInitial}
        onSave={(href) => { setLinkOpen(false); run(setMark(markTypes.link!, { href })); announce('Link saved.'); }}
        onRemove={() => { setLinkOpen(false); run(setMark(markTypes.link!, null)); announce('Link removed.'); }}
        onClose={() => setLinkOpen(false)}
      />
    </div>
  );
}


/**
 * Whether edits have reached the account. Every keystroke is already safe in
 * this browser, so only the moves into and out of "not synced" are announced
 * — announcing each save would talk over typing.
 */
function SaveStatus() {
  const status = useSyncStatus();
  const announce = useAnnounce();
  const prev = useRef(status);
  useEffect(() => {
    if (status === 'unsynced' && prev.current !== 'unsynced') announce('Changes aren’t reaching your account yet. They’re kept in this browser.');
    if (status === 'saved' && prev.current === 'unsynced') announce('Changes synced to your account.');
    prev.current = status;
  }, [status, announce]);
  return <span className={styles.status}>{status === 'unsynced' ? 'Not synced — kept in this browser' : status === 'saving' ? 'Saving…' : 'Saved'}</span>;
}
