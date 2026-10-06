/**
 * localStorage-backed document store (§3 of docs/audit/checking-engine-plan.md).
 *
 * Two modes. Local mode (no Supabase env vars: CI, plain `npm run dev`) is the
 * original scope: one implicit local user, lost on "clear browsing data".
 * Cloud mode (a signed-in account, see ./sync.ts) keeps this same synchronous
 * store as the working copy — one cache per user — and Supabase behind it as
 * a write-behind: every write marks the doc dirty, sync pushes dirty docs, and
 * a dirty doc survives a closed tab to be pushed on the next visit. Callers
 * (the 500ms autosave, the pagehide/unmount flush) stay synchronous.
 *
 * Findings are NOT stored. They are recomputed by running the rule engine
 * over the loaded doc — rules are cheap and deterministic, and caching results
 * risks staleness bugs (§3, confirmed by §9.6: at realistic scale, capped by
 * localStorage's ~5MB quota, recompute-on-load is single-digit milliseconds).
 *
 * Every localStorage access is guarded: private mode, quota exhaustion or a
 * corrupt payload falls back to an in-memory copy so the app keeps working for
 * the session, and SSR (no window) never touches it.
 */
import type { Node as PMNode } from 'prosemirror-model';
import type { OpenSeverity } from '../../design-system/primitives/openSeverity';
import type { EditorFinding } from '../_editor/findings';
import { dismissKeyOf, sectionFindings } from '../_editor/findings';
import { schema } from '../_editor/editorSchema';
import { checkDocument } from '../_engine/check';
import { SEEDS, buildSeedDocument } from './seed';
import { setImageScope } from './images';
import { validImageKey } from './imageFormat';
import { dimension } from '../_editor/editorSchema';
import type { DocSummary, SeedDoc } from './seed';

export type DocJSON = Record<string, unknown>;

/** A header or footer image: its alt text and, when it has one, its picture's
 *  key (images.ts) and displayed size. */
export interface SectionImage {
  id: string;
  alt: string;
  image: string | null;
  width: number | null;
  height: number | null;
}

/** A section image from untrusted JSON (localStorage, a pulled row), or null. */
export function sectionImageOf(v: unknown): SectionImage | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== 'string' || !/^(?:header|footer)-img-\d{1,9}$/.test(o.id)) return null;
  return {
    id: o.id,
    alt: typeof o.alt === 'string' ? o.alt.slice(0, 2000) : '',
    image: validImageKey(o.image),
    width: dimension(o.width),
    height: dimension(o.height),
  };
}

export interface StoredDoc {
  id: string;
  title: string;
  owner: string;
  targets: string[];
  /** Header/footer band text, and each band's image (alignment and spacing
   *  aren't kept). */
  header: string;
  footer: string;
  headerImage: SectionImage | null;
  footerImage: SectionImage | null;
  content: DocJSON;
  /** Epoch ms of the last full check. */
  lastChecked: number;
  /**
   * Dismissal keys (`dismissKeyOf`) the user dismissed. Keys are content-
   * derived, so editing the flagged text naturally revives the finding — a
   * dismissal only ever covers the exact text it was made against, and for
   * duplicate findings only while the number of duplicates is unchanged.
   * Grows only by explicit user action and is never pruned, so an exact revert
   * of the text stays dismissed.
   */
  dismissed: string[];
  /** What an imported file held that the editor could not (tables flattened,
   *  footnotes left out…), shown until the user dismisses it. */
  importNotes: string[];
  /** Cloud mode: the server revision this copy was edited from. A save only
   *  lands while the server still has it (sync.ts); absent until the server
   *  has the document (or for a copy cached before revisions existed). */
  revision?: number;
}

/** `ada.docs.v1` in local mode; `ada.docs.v1:<uid>` per signed-in account, so
 *  a shared browser never shows one account's documents to another. null:
 *  cloud mode with no account attached — reads are empty and writes go
 *  nowhere, so a late autosave after sign-out can't land anywhere. */
let storageKey: string | null = 'ada.docs.v1';
/** Cloud mode: the server decides seeding (sync.ts), and writes mark docs dirty. */
let cloud = false;

/** In-memory fallback when localStorage is unavailable, corrupt, or full. */
let memoryDocs: Map<string, StoredDoc> | null = null;
/** Set once a write fails (quota, private mode): reads must stop trusting the
 *  stale on-disk copy, or every save silently evaporates. */
let diskFailed = false;
/** Ids written locally but not yet confirmed by the server (cloud mode). */
let memoryDirty: Set<string> | null = null;
let onDirty: ((ids: string[]) => void) | null = null;
/** Screens showing documents: told when documents change other than by their
 *  own typing (a pull, another device's version, a conflict resolved). */
const docListeners = new Set<(ids: readonly string[]) => void>();

export function subscribeDocs(listener: (ids: readonly string[]) => void): () => void {
  docListeners.add(listener);
  return () => { docListeners.delete(listener); };
}

const docsChanged = (ids: readonly string[]) => { for (const l of [...docListeners]) l(ids); };

/** Switch the store to a signed-in account's cache, or back to local mode (null). */
export function setStoreUser(uid: string | null): void {
  storageKey = uid ? `ada.docs.v1:${uid}` : 'ada.docs.v1';
  cloud = uid !== null;
  memoryDocs = null;
  memoryDirty = null;
  diskFailed = false;
  setImageScope({ uid, cloud });
}

/** Cloud mode with no account: the store holds nothing and keeps nothing. */
export function detachStore(): void {
  storageKey = null;
  cloud = true;
  memoryDocs = null;
  memoryDirty = null;
  diskFailed = false;
  setImageScope(null);
}

/** sync.ts listens here to schedule a push after each local write. */
export function onDocsDirty(listener: ((ids: string[]) => void) | null): void {
  onDirty = listener;
}

const hasLocalStorage = (): boolean => {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false; // some browsers throw on mere access in private mode
  }
};

/**
 * Structural validation for stored entries. The payload is same-origin, but
 * "parseable JSON" is not "valid StoredDoc": a truncated write, manual
 * tampering, or a future schema change against a v1 payload must not crash the
 * dashboard or brick the editor. Entries that fail the shape check are
 * dropped; content that passes it but fails nodeFromJSON is handled by the
 * guarded readers below.
 */
export function sanitizeStoredDocs(parsed: unknown): StoredDoc[] {
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((v): v is Omit<StoredDoc, 'dismissed' | 'importNotes' | 'headerImage' | 'footerImage'> & { dismissed?: unknown; importNotes?: unknown; headerImage?: unknown; footerImage?: unknown } => {
      if (typeof v !== 'object' || v === null) return false;
      const d = v as Record<string, unknown>;
      return typeof d.id === 'string' && d.id.length > 0 &&
        typeof d.title === 'string' && typeof d.owner === 'string' &&
        Array.isArray(d.targets) && d.targets.every((t) => typeof t === 'string') &&
        typeof d.header === 'string' &&
        typeof d.footer === 'string' &&
        typeof d.content === 'object' && d.content !== null &&
        typeof d.lastChecked === 'number';
    })
    // Normalize the optional field: payloads written before dismissals existed
    // have none, and localStorage is a trust boundary — keep strings only.
    .map((d): StoredDoc => {
      // savedAt: a pulled row's updated_at, for the conflict dialog only.
      const { revision: raw, savedAt: _savedAt, ...rest } = d as typeof d & { revision?: unknown; savedAt?: unknown };
      const revision = revisionOf(raw);
      return {
        ...rest,
        dismissed: strings(d.dismissed),
        importNotes: strings(d.importNotes),
        headerImage: sectionImageOf(d.headerImage),
        footerImage: sectionImageOf(d.footerImage),
        ...(revision ? { revision } : {}),
      };
    });
}

function revisionOf(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
}

/** The one-time seed, built from the demo content (§7 step 7). */
function seedDocs(seeds: readonly SeedDoc[] = SEEDS): Map<string, StoredDoc> {
  const now = Date.now();
  const map = new Map<string, StoredDoc>();
  seeds.forEach((seed, i) => {
    map.set(seed.id, {
      id: seed.id,
      title: seed.title,
      owner: seed.owner,
      targets: [...seed.targets],
      header: seed.content.header,
      footer: seed.content.footer,
      headerImage: null,
      footerImage: null,
      content: buildSeedDocument(seed.content).toJSON() as DocJSON,
      // Staggered so the "most recently checked" order has a stable shape.
      lastChecked: now - i * 60_000,
      dismissed: [],
      importNotes: [],
    });
  });
  return map;
}

function readAll(): Map<string, StoredDoc> {
  if (storageKey === null) return new Map();
  if (!diskFailed && hasLocalStorage()) {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw !== null) {
        const docs = sanitizeStoredDocs(JSON.parse(raw));
        return new Map(docs.map((d) => [d.id, d]));
      }
    } catch {
      // Corrupt or unreadable: fall through to a fresh in-memory seed.
    }
  }
  // Cloud mode never invents documents: an account's docs come from the server.
  if (!memoryDocs) memoryDocs = cloud ? new Map() : seedDocs();
  return memoryDocs;
}

/** Returns whether the write reached localStorage (false: this session only). */
function writeAll(docs: Map<string, StoredDoc>): boolean {
  if (storageKey === null) return false;
  if (!diskFailed && hasLocalStorage()) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify([...docs.values()]));
      return true;
    } catch {
      // Quota or private mode: keep the session running in memory — and stop
      // reading the stale on-disk copy, so saves stay visible this session.
      diskFailed = true;
      // Cloud mode: the server has the truth, so drop the stale disk copy too.
      // Left there, the next visit would reload it — dirty flags and all — and
      // push old text over this session's edits.
      if (cloud) removeFromDisk(storageKey, `${storageKey}:dirty`);
    }
  }
  memoryDocs = docs;
  return false;
}

/** Local mode only: populate the store from the seed content on first visit
 *  (or after corruption). The eight seeds are the verification gates' fixtures;
 *  accounts never get them. ponytail: Vercel Preview has no Supabase env vars,
 *  so it runs in local mode and shows them; set Preview's env vars if it should
 *  look like production. */
export function seedIfEmpty(): void {
  if (cloud) return; // an account starts empty
  if (!diskFailed && hasLocalStorage()) {
    try {
      const raw = window.localStorage.getItem(storageKey ?? '');
      // A stored empty list is a desk someone emptied: keep it empty. Only a
      // first visit (nothing stored) or a payload with no usable docs reseeds.
      const parsed: unknown = raw === null ? null : JSON.parse(raw);
      if (Array.isArray(parsed) && (parsed.length === 0 || sanitizeStoredDocs(parsed).length > 0)) return;
    } catch {
      // corrupt: reseed below
    }
    writeAll(seedDocs());
    return;
  }
  if (!memoryDocs) memoryDocs = seedDocs();
}

export function docFromJSON(json: DocJSON): PMNode {
  return schema.nodeFromJSON(json);
}

/**
 * Parse stored content, rejecting anything that is not a top-level doc node:
 * a valid non-doc node (paragraph JSON from a truncated write or tampering)
 * parses fine but would crash the editor mount, which requires schema.topNodeType.
 */
function parseStoredDoc(content: DocJSON): PMNode | null {
  try {
    const node = docFromJSON(content);
    return node.type === schema.nodes.doc ? node : null;
  } catch {
    return null;
  }
}

export function loadDoc(id: string): StoredDoc | null {
  seedIfEmpty();
  const stored = readAll().get(id) ?? null;
  if (!stored) return null;
  // Probe the PM payload: an entry that passes the shape check but no longer
  // parses (schema drift, truncated write) is reported missing — the editor
  // route shows its recoverable not-found panel instead of crashing.
  return parseStoredDoc(stored.content) ? stored : null;
}

export function saveDoc(id: string, patch: Partial<Pick<StoredDoc, 'content' | 'header' | 'footer' | 'headerImage' | 'footerImage' | 'lastChecked' | 'dismissed' | 'importNotes'>>): void {
  const all = readAll();
  const existing = all.get(id);
  if (!existing) return;
  all.set(id, { ...existing, ...patch });
  writeAll(all);
  // lastChecked alone is bookkeeping (the editor stamps it on every open and
  // check). Pushing a whole doc for it would put this tab's copy over newer
  // edits made elsewhere just for viewing it.
  if (Object.keys(patch).some((k) => k !== 'lastChecked')) markDirty([id]);
}

/** URL- and filename-safe id from a title, unique among stored docs. */
export function slugId(title: string, taken: (id: string) => boolean): string {
  const base = title.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').slice(0, 40).replace(/^-+|-+$/g, '') || 'document';
  let id = base;
  for (let n = 2; taken(id); n++) id = `${base}-${n}`;
  return id;
}

/**
 * Add a new document (an imported file). `persisted` is false when the store
 * could only keep it in memory (quota, private mode): the caller must say so,
 * or the document silently disappears on reload.
 */
export function createDoc(draft: Pick<StoredDoc, 'title' | 'header' | 'footer' | 'content' | 'importNotes'> & Partial<Pick<StoredDoc, 'headerImage' | 'footerImage'>>): { id: string; persisted: boolean } {
  seedIfEmpty();
  const all = readAll();
  const id = slugId(draft.title, (candidate) => all.has(candidate));
  all.set(id, {
    headerImage: null,
    footerImage: null,
    ...draft,
    id,
    owner: 'You',
    targets: ['WCAG 2.1 AA', 'Section 508'],
    lastChecked: Date.now(),
    dismissed: [],
  });
  const persisted = writeAll(all);
  markDirty([id]);
  docsChanged([id]);
  return { id, persisted };
}

/** Remove a document from this browser, and from what sync would push.
 *  Cloud mode deletes on the server first (sync.ts removeDoc), then here. */
export function deleteDoc(id: string, { byThisTab = false } = {}): void {
  const all = readAll();
  if (!all.delete(id)) return;
  writeAll(all);
  const dirty = readDirty();
  if (dirty.delete(id)) writeDirty(dirty);
  // A screen that deleted it moves on by itself; one deleted elsewhere is news.
  if (!byThisTab) docsChanged([id]);
}

/* ---------- cloud mode: the sync surface (see ./sync.ts) ---------- */

const dirtyKey = () => `${storageKey}:dirty`;

function removeFromDisk(...keys: string[]): void {
  if (!hasLocalStorage()) return;
  try {
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // nothing on disk to remove
  }
}

function readDirty(): Set<string> {
  if (storageKey === null) return new Set();
  if (!memoryDirty && !diskFailed && hasLocalStorage()) {
    try {
      memoryDirty = new Set(strings(JSON.parse(window.localStorage.getItem(dirtyKey()) ?? '[]')));
    } catch {
      // corrupt: treat as nothing pending; the next edit re-marks its doc
    }
  }
  return (memoryDirty ??= new Set());
}

function writeDirty(ids: Set<string>): void {
  if (storageKey === null) return;
  memoryDirty = ids;
  if (diskFailed || !hasLocalStorage()) return;
  try {
    window.localStorage.setItem(dirtyKey(), JSON.stringify([...ids]));
  } catch {
    // quota: the set lives in memory for this session, like the docs do
  }
}

function markDirty(ids: string[]): void {
  if (!cloud || storageKey === null) return;
  const dirty = readDirty();
  ids.forEach((id) => dirty.add(id));
  writeDirty(dirty);
  onDirty?.(ids);
}

/** Docs the server has not confirmed yet, as they are now. */
/** Every document in the store (sync.ts: which images are still in use here). */
export function allDocs(): StoredDoc[] {
  return [...readAll().values()];
}

export function dirtyDocs(): StoredDoc[] {
  const all = readAll();
  return [...readDirty()].flatMap((id) => all.get(id) ?? []);
}

/**
 * Replace the cache with the server's rows, except docs with unpushed local
 * edits: those win and are pushed next. Rows are validated like any stored
 * payload — the server is the other side of a trust boundary.
 */
export function applyPulled(rows: unknown): void {
  const local = readAll();
  const next = new Map(sanitizeStoredDocs(rows).map((d) => [d.id, d]));
  for (const id of readDirty()) {
    const mine = local.get(id);
    if (mine) next.set(id, mine);
  }
  writeAll(next);
  docsChanged([...next.keys()]);
}

/** The server stored these versions, now at these revisions: each copy is
 *  based on its new revision, and clean unless it was edited meanwhile. */
export function markPushed(pushed: readonly { doc: StoredDoc; revision: number }[]): void {
  if (!pushed.length) return;
  const all = readAll();
  const dirty = readDirty();
  const same = (a: StoredDoc, b: StoredDoc) => JSON.stringify({ ...a, revision: 0 }) === JSON.stringify({ ...b, revision: 0 });
  for (const { doc, revision } of pushed) {
    const current = all.get(doc.id);
    if (!current) { dirty.delete(doc.id); continue; }
    all.set(doc.id, { ...current, revision });
    if (same(current, doc)) dirty.delete(doc.id);
  }
  writeAll(all);
  writeDirty(dirty);
}

/** Take the server's version of a document (validated like any stored
 *  payload), with nothing left to push. False if it didn't pass. */
export function replaceDoc(row: unknown): boolean {
  const [doc] = sanitizeStoredDocs([row]);
  if (!doc) return false;
  const all = readAll();
  all.set(doc.id, doc);
  writeAll(all);
  const dirty = readDirty();
  if (dirty.delete(doc.id)) writeDirty(dirty);
  docsChanged([doc.id]);
  return true;
}

/** Base this copy on `revision` and push it again (keep mine, in a conflict). */
export function rebaseDoc(id: string, revision: number | undefined): void {
  const all = readAll();
  const doc = all.get(id);
  if (!doc) return;
  const next: StoredDoc = { ...doc };
  if (revision === undefined) delete next.revision; else next.revision = revision;
  all.set(id, next);
  writeAll(all);
  markDirty([id]);
}

/** Whether this document has edits the server hasn't confirmed. */
export const isDirty = (id: string): boolean => readDirty().has(id);

export function hasCachedDocs(): boolean {
  return readAll().size > 0;
}

/** Sign-out: nothing of the account stays in this browser, and nothing
 *  written afterwards (a closing editor's flush) is kept. */
export function clearStore(): void {
  if (storageKey !== null) removeFromDisk(storageKey, dirtyKey());
  detachStore();
}

export interface DashboardData {
  docs: DocSummary[];
  /** Manual-severity findings across docs, in doc order: what is genuinely
   *  "waiting on a human", not a scripted demo list. */
  manualItems: { question: string; docId: string }[];
}

/**
 * Everything the homepage renders, in one parse+check pass per doc (§3/§9.6:
 * recompute on load, never cache). Dismissed findings are excluded everywhere,
 * so the dashboard and the editor cannot disagree about what is open.
 */
export function loadDashboardData(): DashboardData {
  seedIfEmpty();
  const sorted = [...readAll().values()].sort((a, b) => b.lastChecked - a.lastChecked);
  const now = Date.now();
  const docs: DocSummary[] = [];
  const manualItems: { question: string; docId: string }[] = [];
  for (const d of sorted) {
    // Unparseable or non-doc content: skip the doc rather than crash the
    // dashboard; loadDoc's probe reports it as missing if it is opened directly.
    const parsed = parseStoredDoc(d.content);
    if (!parsed) continue;
    const dismissed = new Set(d.dismissed);
    const findings = [...checkDocument(parsed, { prose: true }).filter((f) => !dismissed.has(dismissKeyOf(f))), ...sectionFindings(d, d.dismissed)];
    docs.push({
      id: d.id,
      title: d.title,
      owner: d.owner,
      targets: d.targets,
      counts: countsOf(findings),
      lastChecked: relativeTime(d.lastChecked, now),
      order: docs.length,
    });
    for (const f of findings) {
      // The homepage keys notes by docId+title, so keep that pair unique.
      if (f.severity === 'manual' && !manualItems.some((m) => m.docId === d.id && m.question === f.title)) manualItems.push({ question: f.title, docId: d.id });
    }
  }
  return { docs, manualItems };
}

/* ---------- pure helpers (verified by scripts/verify-rules.mjs) ---------- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** Dashboard-style relative timestamp: '2 min ago', 'Yesterday', 'Mar 3'. */
export function relativeTime(ts: number, now: number): string {
  const mins = Math.floor((now - ts) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  if (hours < 48) return 'Yesterday';
  const d = new Date(ts);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** Severity counts for DocSummary.counts: only present severities appear. */
export function countsOf(findings: readonly EditorFinding[]): Partial<Record<OpenSeverity, number>> {
  const out: Partial<Record<OpenSeverity, number>> = {};
  for (const f of findings) out[f.severity] = (out[f.severity] ?? 0) + 1;
  return out;
}
