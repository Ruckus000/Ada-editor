'use client';

import * as Dialog from '@radix-ui/react-dialog';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties, DragEvent, KeyboardEvent, ReactNode, TouchEvent } from 'react';
import { Button, OPEN_SEVERITIES, SEVERITY_ENCODING, SEVERITY_RANK, SeverityBadge, VisuallyHidden, useAnnounce } from '../../design-system/primitives';
import type { OpenSeverity } from '../../design-system/primitives';
import type { DocSummary } from '../_data/seed';
import { SAMPLE_ID, createDoc, loadDashboardData, saveDoc, seedIfEmpty } from '../_data/store';
import type { DashboardData } from '../_data/store';
import { isCloud } from '../_data/supabase';
import { removeDoc, signOut } from '../_data/sync';
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
 * The homepage after sign-in: a desk, not a dashboard. Three layouts, chosen
 * by how many documents there are — the tutorial when the only document is
 * the sample, loose sheets up to four, a filterable grid from five. Layout
 * breakpoints are CSS; the only width-dependent behaviour (the question pad)
 * renders every note and lets CSS show one at a time on phones.
 */

type SortKey = 'urgency' | 'recent' | 'name';
type Filter = OpenSeverity | 'clear' | 'all';
type Item = { question: string; docId: string };

const GRID_AT = 5;
/** 12 fills 2, 3, 4 and 6 columns alike, so the first page never ends ragged. */
const PAGE = 12;
const NOTES = 3;
const DESK = [{ drop: 0, tilt: -3 }, { drop: 2.5, tilt: 2 }, { drop: 0.625, tilt: -1.5 }, { drop: 3.5, tilt: 3 }];
const GRID_TILT = [-1.5, 1, -0.5, 1.5, -1, 0.5];
const NOTE_TILT = [2.5, -2, 1.5];

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

const greeting = (hour: number) => (hour < 12 ? 'Good morning.' : hour < 18 ? 'Good afternoon.' : 'Good evening.');

/** Placeholder text lines, varied per document so sheets don't look stamped. */
function lineWidths(id: string, n: number) {
  let seed = [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7);
  return Array.from({ length: n }, () => (seed = (seed * 37 + 11) % 997, 55 + (seed % 45)));
}

/* ---------- pieces ---------- */

function Sheet({ d, lines, tilt, note, onDelete }: { d: DocSummary; lines: number; tilt: number; note?: string; onDelete?: (d: DocSummary) => void }) {
  const w = worst(d);
  const sheet = (
    <Link
      href={`/editor/${d.id}`}
      className="home-sheet"
      style={{ '--tilt': `${tilt}deg` } as CSSProperties}
      aria-label={`${d.title}. ${note ?? status(d)}. ${checked(d.lastChecked)}. Open in editor.`}
    >
      <span className="home-sheet__lines" aria-hidden="true">
        {lineWidths(d.id, lines).map((pct, i) => <i key={i} style={{ inlineSize: `${pct}%` }} />)}
      </span>
      <span className="home-sheet__meta">
        {w ? <SeverityBadge severity={w} /> : <span className="home-sheet__none">No open findings</span>}
        <span className="home-sheet__title">{d.title}</span>
        <span className="home-sheet__status">{note ?? status(d)}</span>
        {note ? null : <span className="home-sheet__when">{checked(d.lastChecked)}</span>}
      </span>
      <svg className="home-sheet__chevron" aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m6 3 5 5-5 5" /></svg>
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

function Note({ item, doc, tilt }: { item: Item; doc: string | null; tilt: number }) {
  const from = doc === null ? 'From the sample' : doc;
  return (
    <Link href={`/editor/${item.docId}`} className="home-note" style={{ '--tilt': `${tilt}deg` } as CSSProperties} aria-label={`Your call: ${item.question}. ${doc === null ? from : `In ${doc}`}.`}>
      <span className="home-eyebrow">Your call</span>
      <span className="home-note__q">{item.question}</span>
      <span className="home-note__doc">{from}</span>
    </Link>
  );
}

/** Notes side by side on wide screens; on phones a pad you flip one note at a
 *  time (arrows or swipe). Every note is rendered; CSS hides the others. */
function NotePad({ items, titleOf }: { items: Item[]; titleOf: (id: string) => string }) {
  const announce = useAnnounce();
  const [at, setAt] = useState(0);
  const touchX = useRef(0);
  const i = at % items.length;
  const go = (step: number) => {
    const next = (i + step + items.length) % items.length;
    setAt(next);
    announce(`Question ${next + 1} of ${items.length}: ${items[next]!.question}`);
  };
  return (
    <div className="home-pad">
      <ul
        role="list"
        className="home-pad__notes"
        onTouchStart={(e: TouchEvent) => { touchX.current = e.touches[0]!.clientX; }}
        onTouchEnd={(e: TouchEvent) => {
          const dx = e.changedTouches[0]!.clientX - touchX.current;
          if (items.length > 1 && Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        }}
      >
        {items.map((item, n) => (
          <li key={`${item.docId}:${item.question}`} data-current={n === i}>
            <Note item={item} doc={titleOf(item.docId)} tilt={NOTE_TILT[n % NOTE_TILT.length]!} />
          </li>
        ))}
      </ul>
      {items.length > 1 ? (
        <div className="home-pad__controls">
          <span className="home-pad__pos" aria-hidden="true">{`${i + 1} of ${items.length}`}</span>
          <Button variant="ghost" iconOnly className="home-round" onClick={() => go(-1)}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m10 3-5 5 5 5" /></svg>
            <VisuallyHidden>Previous question</VisuallyHidden>
          </Button>
          <Button variant="ghost" iconOnly className="home-round" onClick={() => go(1)}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m6 3 5 5-5 5" /></svg>
            <VisuallyHidden>Next question</VisuallyHidden>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** A button that shows a small panel of links/actions (disclosure pattern:
 *  Tab moves through the items). Closes on Escape, outside click, focus
 *  leaving, or choosing an item — and hands focus back to its button first,
 *  so a dialog opened from an item returns focus somewhere that still exists. */
function Popover({ label, variant, icon, children }: { label: string; variant: 'primary' | 'ghost'; icon: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('focusin', away);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('focusin', away); };
  }, [open]);
  const close = () => { setOpen(false); button.current?.focus(); };
  return (
    <div ref={wrap} className="home-pop" onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Escape' && open) { e.stopPropagation(); close(); } }}>
      <Button ref={button} variant={variant} iconOnly className="home-round" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        {icon}
        <VisuallyHidden>{label}</VisuallyHidden>
      </Button>
      {open ? <ul role="list" id={id} className="home-pop__panel" onClick={close}>{children}</ul> : null}
    </div>
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
  }, []);

  const docs = dash?.docs ?? [];
  const mode = !dash ? null : docs.length === 0 || (docs.length === 1 && docs[0]!.id === SAMPLE_ID) ? 'empty' : docs.length >= GRID_AT ? 'grid' : 'desk';
  const hasDocs = mode === 'desk' || mode === 'grid';

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

  // Edits that never reached the server would be lost with the cache, so ask.
  const onSignOut = async () => {
    const done = await signOut(() => window.confirm('Some changes haven’t reached your account yet. If you sign out now, they will be lost. Sign out anyway?'));
    if (done) router.replace('/sign-in');
  };

  const titleOf = (id: string) => docs.find((d) => d.id === id)?.title ?? '';
  const items = dash?.manualItems ?? [];
  const openImport = () => { setImportError(''); setImportOpen(true); };
  const [removeError, setRemoveError] = useState(false);
  const removeSample = async () => {
    const sample = docs.find((d) => d.id === SAMPLE_ID);
    if (!sample || !window.confirm(`Remove the sample, “${sample.title}”? This can’t be undone.`)) return;
    setRemoveError(false);
    if (!(await removeDoc(SAMPLE_ID))) { setRemoveError(true); return; }
    setDash(loadDashboardData());
    announce('Sample removed. Your desk is empty.');
    // The button that had focus is gone with the sample: land on the page heading.
    requestAnimationFrame(() => document.getElementById('how-heading')?.focus());
  };
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
        <div className="home-hello">
          <span className="home-eyebrow home-brand">Ada Editor</span>
          <h1>{hello}</h1>
        </div>
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
          <Popover
            label="Account"
            variant="ghost"
            icon={<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="8.5" r="3.5" /><path d="M5 19.5c1.2-3.2 4-5 7-5s5.8 1.8 7 5" /></svg>}
          >
            <li><Link href="/privacy" className="home-pop__item home-pop__item--plain">Privacy</Link></li>
            {isCloud
              ? <li><button type="button" className="home-pop__item home-pop__item--plain" onClick={() => void onSignOut()}>Sign out</button></li>
              // Local mode has no account to leave: say so, rather than leave people hunting for Sign out.
              : <li className="home-pop__note">No account on this copy of Ada Editor. Documents are kept in this browser only.</li>}
          </Popover>
        </div>
      </header>
      <NewDocumentDialog open={newOpen} onCreate={onCreate} onClose={() => setNewOpen(false)} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onFile={(f) => void onFile(f)} error={importError} busy={importing} />
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} docs={docs} />

      <main className="home-main">
        {deleteError && hasDocs ? <p role="alert" className="home-alert">“{deleteError}” couldn’t be deleted. Check your connection and try again.</p> : null}
        {mode === 'empty' ? <EmptyDesk sample={docs[0]} note={items.find((m) => m.docId === SAMPLE_ID)} onImport={openImport} onRemove={() => void removeSample()} removeError={removeError} /> : null}

        {mode === 'desk' ? (
          <div className="home-stack">
            <section aria-labelledby="docs-heading">
              <h2 id="docs-heading" className="home-eyebrow">Your documents</h2>
              <ul role="list" className="home-desk">
                {docs.map((d, i) => (
                  <li key={d.id} style={{ '--drop': `${DESK[i]!.drop}rem` } as CSSProperties}>
                    <Sheet d={d} lines={7} tilt={DESK[i]!.tilt} onDelete={(doc) => void deleteDocument(doc)} />
                  </li>
                ))}
              </ul>
            </section>
            {items.length ? (
              <section aria-labelledby="calls-heading" className="home-calls">
                <h2 id="calls-heading" className="home-eyebrow home-eyebrow--manual">Your calls</h2>
                <NotePad items={items.slice(0, NOTES)} titleOf={titleOf} />
              </section>
            ) : null}
          </div>
        ) : null}

        {mode === 'grid' ? (
          <GridDesk
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
    </div>
  );
}

function EmptyDesk({ sample, note, onImport, onRemove, removeError }: {
  sample: DocSummary | undefined; note: Item | undefined; onImport: () => void; onRemove: () => void; removeError: boolean;
}) {
  return (
    <div className="home-empty">
      <section aria-labelledby="how-heading" className="home-how">
        <h2 id="how-heading" tabIndex={-1}>Your desk is empty. Here’s how it works.</h2>
        <ol>
          <li><span><strong>Write, or bring a file.</strong> Use the + to start blank or import a Word file. It lands here as a sheet.</span></li>
          <li><span><strong>Ada checks as you go.</strong> Each sheet wears a badge — blocks access, fails AA, advisory — so you can see what stands between it and publishing.</span></li>
          <li><span><strong>Some calls are yours.</strong> When a machine can’t decide — is this image decorative? — it leaves you a note{note ? ' like the one beside the sample' : ''}.</span></li>
        </ol>
        <div className="home-how__actions">
          {sample ? <Link href={`/editor/${sample.id}`} className="ada-button ada-button--primary">Open the sample</Link> : null}
          <Button variant={sample ? 'ghost' : 'primary'} onClick={onImport}>Import a Word file</Button>
          {sample ? <Button variant="ghost" onClick={onRemove}>Remove the sample</Button> : null}
        </div>
        {removeError ? <p role="alert" className="home-alert">The sample couldn’t be removed. Check your connection and try again.</p> : null}
      </section>
      {sample ? (
        <div className="home-sample">
          <Sheet d={sample} lines={7} tilt={2.5} note="A sample to practise on. Nothing you do here is published." />
          {note ? <Note item={note} doc={null} tilt={-2} /> : null}
          <span className="home-sample__caption" aria-hidden="true">Your first document will land about here.</span>
        </div>
      ) : null}
    </div>
  );
}

function GridDesk({ docs, items, titleOf, filter, sort, showAll, onFilter, onSort, onShowAll, onDelete }: {
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

  return (
    <div className="home-stack">
      {items.length ? (
        <section aria-labelledby="calls-heading" className="home-calls">
          <div className="home-calls__bar">
            <h2 id="calls-heading" className="home-eyebrow home-eyebrow--manual">Waiting on your call</h2>
            <button type="button" className="home-textbtn" onClick={() => onFilter('manual', `${SEVERITY_ENCODING.manual.label}: ${plural(manualDocs, 'document')}.`)}>
              {`See all ${items.length}`}
            </button>
          </div>
          <NotePad items={items.slice(0, NOTES)} titleOf={titleOf} />
        </section>
      ) : null}

      <section aria-labelledby="all-heading" className="home-all">
        <div className="home-all__bar">
          <div className="home-all__title">
            <h2 id="all-heading">Your desk</h2>
            <span>{filter === 'all' ? plural(docs.length, 'document') : `${rows.length} of ${docs.length}`}</span>
          </div>
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
        </div>
        <ul role="list" aria-label="Documents" className="home-grid">
          {shown.map((d, i) => <li key={d.id}><Sheet d={d} lines={5} tilt={GRID_TILT[i % GRID_TILT.length]!} onDelete={onDelete} /></li>)}
        </ul>
        {!showAll && rows.length > PAGE ? (
          <button type="button" className="home-more" onClick={() => onShowAll(rows.length)}>{`Show all ${rows.length}`}</button>
        ) : null}
      </section>
    </div>
  );
}
