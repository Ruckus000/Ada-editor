'use client';

import * as Dialog from '@radix-ui/react-dialog';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, KeyboardEvent, ReactNode } from 'react';
import { Button, Glyph, OPEN_SEVERITIES, Popover, SEVERITY_ENCODING, SEVERITY_RANK, SeverityBadge, VisuallyHidden, useAnnounce } from '../../design-system/primitives';
import type { OpenSeverity } from '../../design-system/primitives';
import type { DocSummary } from '../_data/seed';
import { createDoc, loadDashboardData, saveDoc, seedIfEmpty, subscribeDocs } from '../_data/store';
import type { DashboardData } from '../_data/store';
import { isCloud } from '../_data/supabase';
import { removeDoc } from '../_data/sync';
import { AccountMenu } from '../_auth/AccountMenu';
import { BrandMark } from '../_site/BrandMark';
import { Tour } from '../_tour/Tour';
import type { TourStep } from '../_tour/Tour';
import { putImage } from '../_data/images';
import { MAX_IMAGE_BYTES, remapImageKeys } from '../_data/imageFormat';
import type { Remapped } from '../_data/imageFormat';
import { prepareImage } from '../_editor/prepareImage';
import { NewDocumentDialog } from '../_editor/dialogs';
import { schema } from '../_editor/editorSchema';
import { summaryLine } from '../_editor/findings';
import { checkDocument } from '../_engine/check';
import { ImportError, importDocxFile } from '../_import/importDocx';
import './home.css';

/**
 * The desk (/desk), home after sign-in: not a dashboard. The tutorial when there
 * are no documents; otherwise one aligned grid of sheets, with filters and
 * sorting once there are enough documents to need them.
 */

type SortKey = 'urgency' | 'recent' | 'name';
type Filter = OpenSeverity | 'clear' | 'all';
type Item = { question: string; docId: string };

const GRID_AT = 5;

/** The desk's first-run tour (only the steps whose controls are on screen run). */
const DESK_TOUR: TourStep[] = [
  { target: '.home-new', title: 'Start a document', body: 'Write on a blank page, or import a Word file (.docx). Imports are read in your browser and never uploaded.' },
  { target: '.home-find', title: 'Find a document', body: 'Search by title. Ctrl K (⌘K on a Mac) opens it from anywhere on your desk.' },
  { target: '.home-calls', title: 'Questions only you can answer', body: 'Some checks need a person’s judgement, like whether alt text really describes the picture. They wait for you here.' },
  { target: '.tour-account', title: 'Display, Help and more', body: 'Change the theme or text size, read how every check works, or sign out.' },
];
/** 12 fills 2, 3, 4 and 6 columns alike, so the first page never ends ragged. */
const PAGE = 12;
const NOTES = 3;

const SORTS: { key: SortKey; label: string; said: string }[] = [
  { key: 'urgency', label: 'Urgency', said: 'urgency' },
  { key: 'recent', label: 'Recent', said: 'most recently checked' },
  { key: 'name', label: 'A–Z', said: 'name' },
];

/** A count, not a verdict (patterns-suggestion.md, Layer 3). */
const WORDS: Record<OpenSeverity, string> = { blocker: 'blocking', violation: 'failing AA', advisory: 'advisory', manual: 'need your call' };

const total = (d: DocSummary) => OPEN_SEVERITIES.reduce((sum, s) => sum + (d.counts[s] ?? 0), 0);
const worst = (d: DocSummary): OpenSeverity | null => OPEN_SEVERITIES.find((s) => (d.counts[s] ?? 0) > 0) ?? null;
const has = (d: DocSummary, f: Filter) => f === 'all' || (f === 'clear' ? total(d) === 0 : (d.counts[f] ?? 0) > 0);
const filterLabel = (f: Exclude<Filter, 'all'>) => (f === 'clear' ? 'No open findings' : SEVERITY_ENCODING[f].label);
const checked = (when: string) => `Checked ${when === 'Yesterday' ? 'yesterday' : when}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Never "compliant": an empty findings list still needs a person's read. */
function status(d: DocSummary): string {
  const open = OPEN_SEVERITIES.filter((s) => (d.counts[s] ?? 0) > 0);
  if (!open.length) return 'No open findings — still needs a human read';
  const list = open.map((s) => `${d.counts[s]} ${WORDS[s]}`).join(', ');
  return d.counts.blocker ? `Can’t publish yet — ${list}` : list;
}

/** What's on the desk, in plain numbers: no verdicts, nothing "compliant". */
function summary(docs: DocSummary[], questions: number): string {
  const blocked = docs.filter((d) => d.counts.blocker).length;
  return [
    `${plural(docs.length, 'document')}.`,
    blocked ? `${blocked} can’t be published yet.` : '',
    questions ? `${plural(questions, 'question')} ${questions === 1 ? 'needs' : 'need'} your call.` : '',
  ].filter(Boolean).join(' ');
}

const greeting = (hour: number) => (hour < 12 ? 'Good morning.' : hour < 18 ? 'Good afternoon.' : 'Good evening.');

/* ---------- pieces ---------- */

function Sheet({ d, onDelete }: { d: DocSummary; onDelete?: (d: DocSummary) => void }) {
  const w = worst(d);
  const sheet = (
    <Link
      href={`/editor/${d.id}`}
      className="home-sheet"
      aria-label={`${d.title}. ${status(d)}. ${checked(d.lastChecked)}. Open in editor.`}
    >
      {w ? <SeverityBadge severity={w} /> : <span className="home-sheet__none">No open findings</span>}
      <span className="home-sheet__title">{d.title}</span>
      {d.excerpt ? <span className="home-sheet__excerpt" aria-hidden="true">{d.excerpt}</span> : null}
      <span className="home-sheet__status">{status(d)}</span>
      <span className="home-sheet__when">{checked(d.lastChecked)}</span>
    </Link>
  );
  if (!onDelete) return sheet;
  // Hover or focus fades a veil over the sheet with Open and Delete. Open is
  // only a label: clicks fall through to the sheet link, so assistive tech
  // meets one link and one button, not a duplicate Open.
  return (
    <div className="home-card">
      {sheet}
      <div className="home-card__veil">
        <span className="home-card__open ada-button ada-button--primary" aria-hidden="true">Open</span>
        <button type="button" className="home-card__delete ada-button ada-button--secondary" aria-label={`Delete ${d.title}`} onClick={() => onDelete(d)}>Delete</button>
      </div>
    </div>
  );
}

/** A question only a person can answer. The visible text is the link's whole
 *  name, so voice control can say what it sees (SC 2.5.3). */
function Note({ item, doc }: { item: Item; doc: string }) {
  return (
    <Link href={`/editor/${item.docId}`} className="home-note">
      <Glyph severity="manual" className="home-note__glyph" />
      <span className="home-note__q">{item.question}</span>
      <span className="home-note__doc">{doc}</span>
    </Link>
  );
}

/** Radix dialog shell for the homepage's two modals. They open from state,
 *  not a Dialog.Trigger, so remember the opener and return focus to it. */
function HomeDialog({ open, onClose, title, hideTitle, description, className, children }: {
  open: boolean; onClose: () => void; title: string; hideTitle?: boolean; description?: string; className?: string; children: ReactNode;
}) {
  const returnTo = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="home-scrim" />
        <Dialog.Content
          className={`home-dialog ${className ?? ''}`}
          {...(description ? {} : { 'aria-describedby': undefined })}
          onOpenAutoFocus={() => { returnTo.current = document.activeElement as HTMLElement | null; }}
          onCloseAutoFocus={(e) => {
            if (!returnTo.current?.isConnected) return;
            e.preventDefault();
            returnTo.current.focus();
          }}
        >
          {hideTitle ? <VisuallyHidden><Dialog.Title>{title}</Dialog.Title></VisuallyHidden> : <Dialog.Title className="home-dialog__title">{title}</Dialog.Title>}
          {description ? <Dialog.Description className="home-dialog__desc">{description}</Dialog.Description> : null}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ImportDialog({ open, onClose, onFile, error, busy }: {
  open: boolean; onClose: () => void; onFile: (file: File) => void; error: string; busy: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const errorId = useId();
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };
  return (
    <HomeDialog
      open={open}
      onClose={onClose}
      title="Import a Word file"
      description="The file is read in your browser, not uploaded. Ada checks it as soon as it opens."
    >
      <label
        className="home-drop"
        data-dragging={dragging}
        aria-busy={busy}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        <input
          type="file"
          className="ada-visually-hidden"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          {...(error ? { 'aria-describedby': errorId } : {})}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            e.target.value = ''; // choosing the same file again must fire change again
            if (file) onFile(file);
          }}
        />
        <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></svg>
        {busy ? (
          <span className="home-drop__title">Importing…</span>
        ) : (
          <>
            <span className="home-drop__title home-drop__title--drag">{dragging ? 'Let go to import it' : 'Drag a Word file here'}</span>
            <span className="home-drop__title home-drop__title--tap">Choose a Word file</span>
            <span className="home-drop__or">or <span className="home-drop__pick">choose one from your computer</span></span>
          </>
        )}
        <span className="home-drop__types">Word documents (.docx)</span>
      </label>
      {error ? <p id={errorId} role="alert" className="home-alert">{error}</p> : null}
      <div className="home-dialog__footer">
        <Dialog.Close asChild><Button variant="secondary">Cancel</Button></Dialog.Close>
      </div>
    </HomeDialog>
  );
}

/** shadcn-style command search: titles, owners and conformance targets. */
function SearchDialog({ open, onClose, docs }: { open: boolean; onClose: () => void; docs: DocSummary[] }) {
  const router = useRouter();
  const announce = useAnnounce();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  useEffect(() => { if (open) { setQuery(''); setActive(0); } }, [open]);

  const q = query.trim().toLowerCase();
  const results = q
    ? docs.filter((d) => [d.title, d.owner, d.targets.join(' ')].some((f) => f.toLowerCase().includes(q))).slice(0, 8)
    : [...docs].sort((a, b) => a.order - b.order).slice(0, 5);
  const current = Math.min(active, results.length - 1);

  // One count once typing pauses, not a stream of them.
  useEffect(() => {
    if (!open || !q) return;
    const n = results.length;
    const timer = setTimeout(() => announce(`${n === 8 ? 'At least 8 documents match' : n === 1 ? '1 document matches' : `${n} documents match`} “${query.trim()}”.`), 500);
    return () => clearTimeout(timer);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (d?: DocSummary) => {
    if (!d) return;
    onClose();
    router.push(`/editor/${d.id}`);
  };
  const onKey = (e: KeyboardEvent) => {
    if (!results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((current + 1) % results.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((current - 1 + results.length) % results.length); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(results[current]); }
  };
  const bold = (title: string) => {
    const at = q ? title.toLowerCase().indexOf(q) : -1;
    if (at < 0) return title;
    return <>{title.slice(0, at)}<mark>{title.slice(at, at + q.length)}</mark>{title.slice(at + q.length)}</>;
  };

  return (
    <HomeDialog open={open} onClose={onClose} title="Find a document" hideTitle className="home-search">
      <div className="home-search__field">
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" /></svg>
        <input
          type="text"
          role="combobox"
          aria-label="Search documents by title, owner or target"
          aria-expanded={results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          {...(results.length ? { 'aria-activedescendant': `${listId}-${current}` } : {})}
          placeholder="Search documents…"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(0); }}
          onKeyDown={onKey}
        />
        <kbd className="home-search__esc" aria-hidden="true">Esc</kbd>
        <Dialog.Close className="home-search__cancel">Cancel</Dialog.Close>
      </div>
      <div className="home-search__results">
        {results.length ? (
          <>
            <div id={`${listId}-label`} className="home-search__group">{q ? 'Documents' : 'Recently checked'}</div>
            <ul role="listbox" id={listId} aria-labelledby={`${listId}-label`} className="home-search__list">
              {results.map((d, n) => {
                const w = worst(d);
                return (
                  <li
                    key={d.id}
                    id={`${listId}-${n}`}
                    role="option"
                    aria-selected={n === current}
                    className="home-search__option"
                    onClick={() => choose(d)}
                    onMouseMove={() => { if (n !== current) setActive(n); }}
                  >
                    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5" /></svg>
                    <span className="home-search__title">{bold(d.title)}</span>
                    <span className="home-search__meta">
                      {w ? <SeverityBadge severity={w} /> : <span className="home-sheet__none">No open findings</span>}
                      <span>{d.lastChecked}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <div className="home-search__empty">
            <span className="home-search__empty-title">{`Nothing matches “${query.trim()}”`}</span>
            <span>Search looks at titles, owners and conformance targets. Try a shorter word.</span>
          </div>
        )}
      </div>
      <div className="home-search__legend" aria-hidden="true">
        <span><kbd>↑↓</kbd>Move</span>
        <span><kbd>↵</kbd>Open</span>
        <span><kbd>Esc</kbd>Close</span>
      </div>
    </HomeDialog>
  );
}

/* ---------- the page ---------- */

export function Home() {
  const announce = useAnnounce();
  const router = useRouter();
  const [dash, setDash] = useState<DashboardData | null>(null);
  const [hello, setHello] = useState('Hello.');
  const [shortcut, setShortcut] = useState('Ctrl K');
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);
  const importingRef = useRef(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<SortKey>('urgency');
  const [showAll, setShowAll] = useState(false);

  // The store is browser-only and the hour is the reader's, so both are read
  // after hydration; the server render is the header alone.
  useEffect(() => {
    seedIfEmpty();
    setDash(loadDashboardData());
    setHello(greeting(new Date().getHours()));
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setShortcut('⌘K');
    // Another device's changes (a refresh), a conflict's copy: the desk follows.
    return subscribeDocs(() => setDash(loadDashboardData()));
  }, []);

  const docs = dash?.docs ?? [];
  const mode = !dash ? null : docs.length === 0 ? 'empty' : 'desk';
  const hasDocs = mode === 'desk';

  useEffect(() => {
    if (!hasDocs) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen((o) => !o); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [hasDocs]);

  const storageNote = isCloud
    ? 'Browser storage is full, so this document isn’t kept in this browser. Keep this tab open until the editor says Saved; then it’s in your account.'
    : 'Browser storage is full or unavailable, so this document is kept for this session only.';

  // A new document starts with its title as the h1: the structure the checker
  // and screen readers rely on is there from the first keystroke.
  const onCreate = (title: string) => {
    const { nodes: N } = schema;
    const content = N.doc!.create(null, [N.heading!.create({ level: 1 }, schema.text(title)), N.paragraph!.create()]);
    const { id, persisted } = createDoc({ title, header: '', footer: '', content: content.toJSON() as Record<string, unknown>, importNotes: [] });
    if (!persisted) saveDoc(id, { importNotes: [storageNote] });
    setNewOpen(false);
    router.push(`/editor/${id}`);
    announce(`Created ${title}.`);
  };

  const onFile = async (file: File) => {
    if (importingRef.current) return;
    importingRef.current = true;
    setImporting(true);
    setImportError('');
    announce(`Importing ${file.name}…`);
    try {
      const imported = await importDocxFile(file);
      const findings = checkDocument(imported.content, { prose: true });
      // The pictures first, so a document is never saved (or synced) ahead of
      // them. Large photos are shrunk as they would be if inserted, and the
      // document then refers to the shrunk copy.
      let unsaved = 0;
      const shrunk = new Map<string, Remapped>();
      for (const [key, image] of imported.images) {
        try {
          const prepared = await prepareImage(image.bytes);
          if (prepared.bytes.length > MAX_IMAGE_BYTES) { unsaved++; continue; }
          const stored = await putImage(prepared.bytes);
          if (stored.key !== key) shrunk.set(key, stored);
        } catch {
          unsaved++;
        }
      }
      const imageNote = unsaved ? [`${unsaved === 1 ? '1 image' : `${unsaved} images`} couldn’t be saved in this browser, so ${unsaved === 1 ? 'it shows' : 'they show'} as unavailable.`] : [];
      const { content, sections: [headerImage, footerImage] } = remapImageKeys(imported.content.toJSON() as Record<string, unknown>, [imported.headerImage, imported.footerImage], shrunk);
      const { id, persisted } = createDoc({
        title: imported.title,
        header: imported.header,
        footer: imported.footer,
        headerImage: headerImage ?? null,
        footerImage: footerImage ?? null,
        content,
        importNotes: [...imported.notes, ...imageNote],
      });
      const notes = [...imported.notes, ...imageNote];
      if (!persisted) { notes.push(storageNote); saveDoc(id, { importNotes: notes }); }
      router.push(`/editor/${id}`);
      // The announcer lives in the root layout, so this survives the navigation.
      announce([`Imported ${imported.title}.`, `${summaryLine(findings)}.`, ...notes].join(' '));
    } catch (error) {
      // Visible and announced once, by role="alert".
      setImportError(error instanceof ImportError ? error.userMessage : 'This file couldn’t be imported.');
    } finally {
      importingRef.current = false;
      setImporting(false);
    }
  };


  const titleOf = (id: string) => docs.find((d) => d.id === id)?.title ?? '';
  const items = dash?.manualItems ?? [];
  const openImport = () => { setImportError(''); setImportOpen(true); };
  const [deleteError, setDeleteError] = useState('');
  const deleteDocument = async (d: DocSummary) => {
    if (!window.confirm(`Delete “${d.title}”? This can’t be undone.`)) return;
    const sheetsNow = () => [...document.querySelectorAll<HTMLElement>('.home-main .home-sheet')];
    const at = sheetsNow().findIndex((el) => el.getAttribute('href') === `/editor/${d.id}`);
    setDeleteError('');
    if (!(await removeDoc(d.id))) { setDeleteError(d.title); return; }
    setDash(loadDashboardData());
    announce(`Deleted ${d.title}.`);
    // The Delete button went with its sheet: land on the sheet that took its
    // place, or the empty desk's heading when none are left.
    requestAnimationFrame(() => {
      const left = sheetsNow();
      (left[Math.min(Math.max(at, 0), left.length - 1)] ?? document.getElementById('how-heading'))?.focus();
    });
  };

  return (
    <div className="home">
      <header className="home-header">
        <span className="ada-brand"><span className="ada-brand__mark" aria-hidden="true"><BrandMark /></span>Ada Editor</span>
        <div className="home-actions">
          {hasDocs ? (
            <button type="button" className="home-find" aria-haspopup="dialog" aria-keyshortcuts="Meta+K Control+K" onClick={() => setSearchOpen(true)}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" /></svg>
              <span className="home-find__label">Find a document</span>
              <kbd aria-hidden="true">{shortcut}</kbd>
            </button>
          ) : null}
          <Popover
            label="New document"
            variant="primary"
            showLabel
            className="home-new"
            icon={<svg aria-hidden="true" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 2.5v11M2.5 8h11" /></svg>}
          >
            <li>
              <button type="button" className="home-pop__item" onClick={() => setNewOpen(true)}>
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5M12 11v6M9 14h6" /></svg>
                <span><strong>Create a document</strong><span>Start on a blank page</span></span>
              </button>
            </li>
            <li>
              <button type="button" className="home-pop__item" onClick={openImport}>
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></svg>
                <span><strong>Import a Word file</strong><span>A .docx, checked as it opens</span></span>
              </button>
            </li>
          </Popover>
          <AccountMenu buttonClassName="home-round" />
        </div>
      </header>
      <NewDocumentDialog open={newOpen} onCreate={onCreate} onClose={() => setNewOpen(false)} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onFile={(f) => void onFile(f)} error={importError} busy={importing} />
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} docs={docs} />

      <main className="home-main">
        <div className="home-hello">
          <h1>{hello}</h1>
          {hasDocs ? <p>{summary(docs, items.length)}</p> : null}
        </div>
        {deleteError && hasDocs ? <p role="alert" className="home-alert">“{deleteError}” couldn’t be deleted. Check your connection and try again.</p> : null}
        {mode === 'empty' ? <EmptyDesk onNew={() => setNewOpen(true)} onImport={openImport} /> : null}

        {mode === 'desk' ? (
          <Desk
            docs={docs}
            items={items}
            titleOf={titleOf}
            filter={filter}
            sort={sort}
            showAll={showAll}
            onFilter={(f, said) => { setFilter(f); setShowAll(false); announce(said); }}
            onSort={(s) => { setSort(s.key); announce(`Sorted by ${s.said}.`); }}
            onShowAll={(n) => { setShowAll(true); announce(`Showing all ${n} documents.`); }}
            onDelete={(doc) => void deleteDocument(doc)}
          />
        ) : null}
      </main>
      <Tour name="desk" ready={Boolean(dash)} steps={DESK_TOUR} />
    </div>
  );
}

function EmptyDesk({ onNew, onImport }: { onNew: () => void; onImport: () => void }) {
  return (
    <div className="home-empty">
      <section aria-labelledby="how-heading" className="home-how">
        <h2 id="how-heading" tabIndex={-1}>Your desk is empty. Here’s how it works.</h2>
        <ol>
          <li><span><strong>Write, or bring a file.</strong> Start on a blank page or import a Word file. It lands here as a sheet.</span></li>
          <li><span><strong>Ada checks as you go.</strong> Each sheet wears a badge — blocks access, fails AA, advisory — so you can see what stands between it and publishing.</span></li>
          <li><span><strong>Some calls are yours.</strong> When a machine can’t decide — is this image decorative? — it leaves you a note here.</span></li>
        </ol>
        <div className="home-how__actions">
          <Button variant="primary" onClick={onNew}>Create a document</Button>
          <Button variant="ghost" onClick={onImport}>Import a Word file</Button>
        </div>
        <p className="home-how__help">New to accessibility checks? <Link href="/help">How Ada Editor works</Link></p>
      </section>
    </div>
  );
}

function Desk({ docs, items, titleOf, filter, sort, showAll, onFilter, onSort, onShowAll, onDelete }: {
  docs: DocSummary[];
  items: Item[];
  titleOf: (id: string) => string;
  filter: Filter;
  sort: SortKey;
  showAll: boolean;
  onFilter: (f: Filter, said: string) => void;
  onSort: (s: (typeof SORTS)[number]) => void;
  onShowAll: (n: number) => void;
  onDelete: (d: DocSummary) => void;
}) {
  const chips = (['all', ...OPEN_SEVERITIES, 'clear'] as Filter[])
    .map((f) => ({ f, count: docs.filter((d) => has(d, f)).length }))
    .filter((c) => c.f === 'all' || c.count > 0);
  const rank = (d: DocSummary) => { const w = worst(d); return w ? SEVERITY_RANK[w] : SEVERITY_RANK.checked; };
  const rows = docs.filter((d) => has(d, filter)).sort(
    sort === 'urgency' ? (a, b) => rank(a) - rank(b) || total(b) - total(a)
      : sort === 'recent' ? (a, b) => a.order - b.order
        : (a, b) => a.title.localeCompare(b.title),
  );
  const shown = showAll ? rows : rows.slice(0, PAGE);
  const manualDocs = docs.filter((d) => has(d, 'manual')).length;
  const controls = docs.length >= GRID_AT;

  return (
    <div className="home-stack">
      {items.length ? (
        <section aria-labelledby="calls-heading" className="home-calls">
          <div className="home-section__head">
            <h2 id="calls-heading">Needs your call</h2>
            <p>Questions a checker can’t decide</p>
            {controls && items.length > NOTES ? (
              <button type="button" className="home-textbtn" onClick={() => onFilter('manual', `${SEVERITY_ENCODING.manual.label}: ${plural(manualDocs, 'document')}.`)}>
                {`See all ${items.length}`}
              </button>
            ) : null}
          </div>
          <ul role="list" className="home-calls__list">
            {items.slice(0, NOTES).map((item) => <li key={`${item.docId}:${item.question}`}><Note item={item} doc={titleOf(item.docId)} /></li>)}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="all-heading" className="home-all">
        <div className="home-all__bar">
          <h2 id="all-heading">Your documents</h2>
          {controls ? (
            <>
              <div role="group" aria-label="Filter by status" className="home-chips">
                {chips.map(({ f, count }) => (
                  <button
                    key={f}
                    type="button"
                    className="home-chip"
                    aria-pressed={filter === f}
                    onClick={() => onFilter(f, f === 'all' ? 'Showing all documents.' : `${filterLabel(f)}: ${plural(count, 'document')}.`)}
                  >
                    {f === 'all' ? 'All' : filterLabel(f)}<span>{count}</span>
                  </button>
                ))}
              </div>
              <div role="group" aria-label="Sort documents" className="home-sort">
                {SORTS.map((s) => (
                  <button key={s.key} type="button" aria-pressed={sort === s.key} onClick={() => onSort(s)}>{s.label}</button>
                ))}
              </div>
            </>
          ) : null}
        </div>
        <ul role="list" aria-label="Documents" className="home-grid">
          {shown.map((d) => <li key={d.id}><Sheet d={d} onDelete={onDelete} /></li>)}
        </ul>
        {!showAll && rows.length > PAGE ? (
          <button type="button" className="home-more" onClick={() => onShowAll(rows.length)}>{`Show all ${rows.length}`}</button>
        ) : null}
      </section>
    </div>
  );
}
