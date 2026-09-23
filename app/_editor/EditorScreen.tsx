'use client';

import Link from 'next/link';
import { Fragment, Slice } from 'prosemirror-model';
import type { Node as PMNode } from 'prosemirror-model';
import { EditorState, NodeSelection, Plugin, TextSelection } from 'prosemirror-state';
import type { Command } from 'prosemirror-state';
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
import { AltTextDialog, HeaderFooterDialog, ImageIcon, LinkDialog } from './dialogs';
import type { SectionState } from './dialogs';
import {
  clearFormatting,
  currentLink,
  editingPlugins,
  formatState,
  indent,
  markTypes,
  nodeTypes,
  outdent,
  setMark,
  toggleBold,
  toggleHeading,
  toggleItalic,
  toggleList,
  toggleUnderline,
} from './editorCommands';
import type { FormatState } from './editorCommands';
import { docFromJSON, saveDoc } from '../_data/store';
import type { DocJSON, StoredDoc } from '../_data/store';
import { checkDocument, reconcile } from '../_engine/check';
import { carryPositions, imageFinding, sortFindings, summaryLine } from './findings';
import type { EditorFinding, Section } from './findings';
import { Toolbar } from './Toolbar';
import styles from './editor.module.css';

const TARGET_TONE: Record<string, string> = { 'WCAG 2.1 AA': 'blue', 'Section 508': 'green', 'PDF/UA': 'purple' };

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
  // runs once at mount, exactly like the blur/Recheck runs do later.
  const initialFindings = useMemo(() => checkDocument(initial, { prose: true }), [initial]);

  /* ---------- state ---------- */
  const [findings, setFindingsState] = useState<EditorFinding[]>(initialFindings);
  const [activeId, setActiveId] = useState<string | null>(initialFindings[0]?.id ?? null);
  const [filter, setFilter] = useState<OpenSeverity | null>(null);
  const [format, setFormat] = useState<FormatState | null>(null);
  const [wordCount, setWordCount] = useState(() => wordsIn(EditorState.create({ doc: initial })));
  const [checking, setChecking] = useState(false);
  const [sections, setSections] = useState<Record<Section, SectionState>>({
    header: { text: stored.header, align: 'left', spacing: 12, image: null },
    footer: { text: stored.footer, align: 'left', spacing: 12, image: null },
  });
  const [hfOpen, setHfOpen] = useState(false);
  const [hfTab, setHfTab] = useState<Section>('header');
  const [altTarget, setAltTarget] = useState<AltTarget | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkInitial, setLinkInitial] = useState('');

  /* ---------- refs shared with ProseMirror ---------- */
  const mountRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const findingsRef = useRef(findings);
  // The array the findings list currently renders. reconcile preserves array
  // identity when nothing changed (§9.4), so comparing against this skips the
  // re-render, the list re-sort and the decoration rebuild on no-op edits.
  const lastRenderedRef = useRef(findings);
  const activeRef = useRef<string | null>(activeId);
  const handlersRef = useRef({ editFigureAlt: (_id: string) => {}, activate: (_id: string) => {}, docChanged: () => {}, runFullCheck: () => {} });
  const docRegion = useRef<HTMLElement>(null);
  const findingsRegion = useRef<HTMLElement>(null);
  const activeCardRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pendingFocus = useRef(false);
  const checkTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // One counter for every image id (inserted, pasted, header/footer), so ids never collide.
  const imageSeq = useRef(0);
  // Findings the user dismissed; the image reconcile below must not bring them back.
  const dismissedRef = useRef(new Set<string>());
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
    // Stored/seed figures already occupy img-N ids: start the counter above
    // every existing suffix so inserted and pasted figures never collide with
    // them (a collision would make alt-text edits and findings hit the wrong
    // figure).
    initial.descendants((node) => {
      if (node.type === nodeTypes.figure) {
        const n = Number(/^img-(\d+)$/.exec(String(node.attrs.id ?? ''))?.[1] ?? 0);
        if (n > imageSeq.current) imageSeq.current = n;
      }
      return true;
    });

    const figureView: NodeViewConstructor = (initialNode) => {
      let node = initialNode;
      const dom = document.createElement('figure');
      dom.className = styles.figure!;
      dom.contentEditable = 'false';
      const art = document.createElement('div');
      art.className = styles.figureArt!;
      art.setAttribute('role', 'img');
      art.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
      const caption = document.createElement('figcaption');
      caption.className = styles.figcaption!;
      dom.append(art, caption);
      const render = () => {
        const alt = node.attrs.alt as string;
        const label = node.attrs.label as string;
        // Mirrors the id toDOM would emit: nothing else on the live DOM identifies
        // which figure is which (devtools, tests, or future scripting).
        dom.dataset.figureId = node.attrs.id as string;
        art.setAttribute('aria-label', alt || `${label}, no alternative text`);
        const status = document.createElement('span');
        status.className = alt ? styles.altText! : styles.missingBadge!;
        status.textContent = alt ? `Alt text: “${alt}”` : 'Missing alt text';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = styles.linkBtn!;
        button.textContent = `${alt ? 'Edit' : 'Add'} alt text for ${label}`;
        button.addEventListener('click', () => handlersRef.current.editFigureAlt(node.attrs.id as string));
        caption.replaceChildren(status, button);
      };
      render();
      return {
        dom,
        update(next) {
          if (next.type !== node.type) return false;
          node = next;
          render();
          return true;
        },
        stopEvent: (event) => !!(event.target as HTMLElement).closest?.('button'),
        ignoreMutation: () => true,
      };
    };

    // Highlights the active finding's span, as the design does, on top of the
    // shape-carrying underline from issueUnderlinePlugin.
    const activeHighlight = new Plugin({
      props: {
        decorations(state) {
          const f = findingsRef.current.find((x) => x.id === activeRef.current);
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
          issueUnderlinePlugin(() => findingsRef.current.filter((f) => f.anchor.kind === 'text' && f.to > f.from)),
          activeHighlight,
        ],
      }),
      nodeViews: { figure: figureView },
      attributes: {
        id: 'document-text',
        class: styles.prose!,
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Document text',
        spellcheck: 'true',
      },
      // Pasted or copied images get fresh ids: a copy of an image in this document
      // would otherwise share its id, and alt-text edits would hit the wrong one.
      transformPasted(slice) {
        const renumber = (fragment: Fragment): Fragment => {
          const nodes: PMNode[] = [];
          fragment.forEach((node) => {
            if (node.type === nodeTypes.figure) {
              const n = ++imageSeq.current;
              nodes.push(node.type.create({ ...node.attrs, id: `img-${n}`, label: `pasted image ${n}` }));
            } else {
              nodes.push(node.isLeaf ? node : node.copy(renumber(node.content)));
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
          const fresh = checkDocument(next.doc, { prose: false });
          findingsRef.current = reconcile(findingsRef.current, fresh, dismissedRef.current, { keepProse: true });
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
    });
  }, [doc.id]);
  // Debounced save, hand-rolled setTimeout — no debounce library (§9.7).
  const scheduleSave = useCallback(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { saveTimer.current = undefined; saveNow(); }, 500);
  }, [saveNow]);
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

  const insertImage = () => {
    const view = viewRef.current;
    if (!view) return;
    const n = ++imageSeq.current;
    const id = `img-${n}`;
    // The dispatch's image reconcile adds the blocking finding.
    view.dispatch(view.state.tr.replaceSelectionWith(nodeTypes.figure!.create({ id, label: `inserted image ${n}` })).scrollIntoView());
    setActiveId(`img-alt-${id}`);
    setFilter(null);
    announce(`Image inserted. It has no alternative text yet, so it was added as a blocking finding.`);
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

  const onApply = (f: EditorFinding) => {
    const view = viewRef.current;
    if (!view || f.suggestion === undefined) return;
    const rest = removeFinding(f);
    // The two machine-decidable rule fixes are attribute changes, not text
    // replacements: applying them as text would write a literal "h2" into a
    // heading or replace a figure node with its alt string.
    if (f.fix?.kind === 'headingLevel') {
      const $pos = view.state.doc.resolve(f.from);
      const pos = $pos.before($pos.depth);
      const attrs = view.state.doc.nodeAt(pos)?.attrs ?? {};
      view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...attrs, level: f.fix.level }));
    } else if (f.fix?.kind === 'figureAlt') {
      const attrs = view.state.doc.nodeAt(f.from)?.attrs ?? {};
      view.dispatch(view.state.tr.setNodeMarkup(f.from, undefined, { ...attrs, alt: f.fix.alt }));
    } else {
      view.dispatch(view.state.tr.insertText(f.suggestion, f.from, f.to));
    }
    announce(`Fix applied: ${f.title}. ${remaining(rest)}`);
  };

  const onDismiss = (f: EditorFinding) => {
    dismissedRef.current.add(f.id);
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
    const selection = f.anchor.kind === 'figure'
      ? NodeSelection.create(view.state.doc, f.from)
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
    if (!alt) dismissedRef.current.delete(findingId);
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
      setSections((s) => ({ ...s, [section]: { ...s[section], image: { ...image, alt } } }));
      if (alt && exists) setFindings(findingsRef.current.filter((f) => f.id !== findingId));
      if (!alt && !exists) setFindings([...findingsRef.current, imageFinding(image.id, altTarget.label, { kind: 'section', section })]);
    }
    announce(alt ? `Alt text saved for ${altTarget.label}.` : `Alt text cleared for ${altTarget.label}. It is flagged as blocking again.`);
    setAltTarget(null);
  };

  handlersRef.current = {
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

  const sectionInsertImage = (key: Section) => {
    const id = `${key}-img-${++imageSeq.current}`;
    updateSection(key, { image: { id, alt: '' } });
    setFindings([...findingsRef.current, imageFinding(id, `${key} image`, { kind: 'section', section: key })]);
    announce(`Image added to the ${key}. It has no alternative text yet, so it was added as a blocking finding.`);
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
        style={{ paddingBlock: `${s.spacing}px`, textAlign: s.align }}
      >
        {s.image ? (
          <span className={styles.bandImage} role="img" aria-label={s.image.alt || `${key} image, no alternative text`}>
            <ImageIcon size={12} />
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
        <button type="button" className={styles.btnSubtle} onClick={onRecheck}>Recheck</button>
      </div>

      <div className={styles.body}>
        <main ref={docRegion} tabIndex={-1} aria-label="Document" className={styles.docMain}>
          <Toolbar
            format={format}
            run={run}
            onFontFamily={(family) => run(setMark(markTypes.fontFamily!, family === 'Default' ? null : { family }))}
            onFontSize={(size) => run(setMark(markTypes.fontSize!, { size: Number(size) }))}
            onTextColor={(color) => run(setMark(markTypes.textColor!, { color }))}
            onHighlight={(color) => run(setMark(markTypes.highlight!, color ? { color } : null))}
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
            onHeaderFooter={() => { setHfTab('header'); setHfOpen(true); }}
            headerFooterOpen={hfOpen}
          />
          <div className={styles.page}>
            {band('header')}
            <div ref={mountRef} />
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
          </section>

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
              {active.suggestion !== undefined ? (
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
                    {active.anchor.kind === 'section' ? `Edit ${active.anchor.section}` : 'Go to text'}
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

