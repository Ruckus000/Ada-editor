import { useSyncExternalStore } from 'react';
import { adoptDisplay } from './display';
import { adoptTours } from './tour';
import { getClient } from './supabase';
import { allDocs, applyPulled, clearStore, createDoc, deleteDoc, detachStore, dirtyDocs, isDirty, loadDoc, markPushed, onDocsDirty, rebaseDoc, replaceDoc, setStoreUser } from './store';
import { imageKeysOf } from './imageFormat';
import { clearImageScope, listRemote, markPending, markSwept, pendingKeys, purgeFolder, removeRemote, sweptAt, uploadPending } from './images';
import type { StoredDoc } from './store';

/**
 * Write-behind from the local store to public.documents (cloud mode only).
 * The store stays the synchronous working copy; this pulls an account's docs
 * once per sign-in and pushes whatever the store marks dirty. A document's
 * images go to the account's private bucket first (images.ts), so a row never
 * reaches the server before the pictures it refers to.
 *
 * Edits on two devices: each copy remembers the server revision it was
 * edited from, and a save updates the row only while the server still has
 * that revision. If another device saved first, nothing is overwritten: the
 * document waits as a conflict until the person chooses what to keep
 * (resolveConflict). Coming back to the tab (focus, visibility, online)
 * fetches what changed elsewhere, so a clean copy is rarely stale at all.
 */

// PostgREST aliases map snake_case columns onto StoredDoc's fields.
const COLUMNS = 'id,title,owner,targets,header,footer,headerImage:header_image,footerImage:footer_image,content,lastChecked:last_checked,dismissed,importNotes:import_notes,revision,savedAt:updated_at';
const PUSH_DELAY = 1000;
/** PostgREST caps a response at its max-rows setting (1000 by default). The
 *  pull pages until it holds the exact row count, advancing by what actually
 *  arrived, so no cap can silently drop documents from the cache. */
const PAGE = 1000;
const RETRY_DELAY = 30_000;
const DAY = 24 * 60 * 60 * 1000;
/** An image the sweep may remove was uploaded at least this long ago. */
const SWEEP_GRACE = 7 * DAY;
/** Keys per "which rows use these?" query, keeping its URL short. */
const KEY_BATCH = 100;

/** Coming back to the tab fetches what changed at most this often. */
const REFRESH_GAP = 5000;
/** Ids per "send me these rows" request, keeping its URL short. */
const ID_BATCH = 100;

export type SyncStatus = 'saved' | 'saving' | 'unsynced' | 'conflict';

let status: SyncStatus = 'saved';
const listeners = new Set<() => void>();
const setStatus = (next: SyncStatus) => {
  if (next === status) return;
  status = next;
  listeners.forEach((l) => l());
};

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => status,
    () => 'saved',
  );
}

let timer: ReturnType<typeof setTimeout> | undefined;
let inFlight: Promise<void> | null = null;
/** The account the store points at, and the one whose docs were pulled. They
 *  differ only while a pull hasn't landed (offline start from the cache). */
let attachedUid: string | null = null;
let loadedUid: string | null = null;
/** Docs the server refused as invalid (a CHECK, e.g. content over 2 MB): kept
 *  in this browser, not retried until edited again — retrying can't succeed. */
const rejected = new Set<string>();
let loading: { uid: string; promise: Promise<void> } | null = null;
/** Ids the server had at the last pull or refresh: a copy that has no
 *  revision but is on the server was cached before revisions existed. */
const onServer = new Set<string>();

/* ---------- conflicts: saved on another device since this copy's revision ---------- */

export interface Conflict {
  id: string;
  title: string;
  /** The server's version as it is now (a row, as pulled), or null: deleted there. */
  server: Record<string, unknown> | null;
  /** When the other device saved it (ISO), if still there. */
  savedAt: string | null;
}

const conflicts = new Map<string, Conflict>();
const conflictListeners = new Set<() => void>();
let conflictList: Conflict[] = [];
const conflictsChanged = () => {
  conflictList = [...conflicts.values()];
  conflictListeners.forEach((l) => l());
};

/** Documents waiting for the person to choose what to keep, oldest first. */
export function useConflicts(): Conflict[] {
  return useSyncExternalStore(
    (l) => { conflictListeners.add(l); return () => { conflictListeners.delete(l); }; },
    () => conflictList,
    () => EMPTY,
  );
}
const EMPTY: Conflict[] = [];

/** What the person keeps: this device's edits, the other device's version,
 *  or both (this device's edits become a new document). Returns the copy's
 *  id for "both". */
export function resolveConflict(id: string, choice: 'mine' | 'theirs' | 'both'): string | null {
  const c = conflicts.get(id);
  if (!c) return null;
  if (openEditor?.id === id) openEditor.flush();
  conflicts.delete(id);
  conflictsChanged();
  const mine = loadDoc(id);
  let copy: string | null = null;
  if (choice === 'mine') {
    // Based on the version there now (or, deleted there, a new row).
    if (!c.server) onServer.delete(id);
    rebaseDoc(id, c.server ? Number(c.server.revision) || undefined : undefined);
  } else {
    if (choice === 'both' && mine) {
      copy = createDoc({
        title: `${mine.title} (edits from this device)`.slice(0, 500),
        header: mine.header,
        footer: mine.footer,
        headerImage: mine.headerImage,
        footerImage: mine.footerImage,
        content: mine.content,
        importNotes: mine.importNotes,
      }).id;
    }
    if (c.server) replaceDoc(c.server);
    else { onServer.delete(id); deleteDoc(id); }
  }
  settle();
  return copy;
}

/** The same document either way (another tab of this browser saved these
 *  very edits): no one needs asking. */
function sameEdits(server: Record<string, unknown>, mine: StoredDoc): boolean {
  const pick = (d: Record<string, unknown>) => JSON.stringify([d.title, d.header, d.footer, d.headerImage ?? null, d.footerImage ?? null, d.content, d.dismissed ?? [], d.importNotes ?? []]);
  return pick(server) === pick(mine as unknown as Record<string, unknown>);
}

/* ---------- pushing ---------- */

function schedulePush(delay = PUSH_DELAY): void {
  clearTimeout(timer);
  if (status === 'saved') setStatus('saving');
  timer = setTimeout(() => { void push(); }, delay);
}

// owner_id is explicit, not left to the column default: if the session ever
// belonged to a different account than the store, RLS rejects the write
// instead of filing this account's document under the other one.
const toRow = (d: StoredDoc, ownerId: string) => ({
  owner_id: ownerId,
  id: d.id,
  title: d.title,
  owner: d.owner,
  targets: d.targets,
  header: d.header,
  footer: d.footer,
  content: d.content,
  last_checked: d.lastChecked,
  dismissed: d.dismissed,
  import_notes: d.importNotes,
  header_image: d.headerImage,
  footer_image: d.footerImage,
  // Which images the document uses: what a deletion checks before removing one.
  image_keys: imageKeysOf(d.content, [d.headerImage, d.footerImage]),
  // No updated_at or revision: the server stamps both (documents_stamp).
});

/** Push every dirty doc. Never throws: a failure leaves the docs dirty (they
 *  survive in this browser) and shows `unsynced` until a retry lands. One push
 *  at a time; a caller mid-push gets the push already running. */
function push(): Promise<void> {
  const client = getClient();
  if (!client) return Promise.resolve();
  // Cleared in .finally, never inside pushOnce: a push with nothing to send
  // finishes before its first await, and a synchronous clear there would run
  // before this assignment — leaving a settled promise here forever, and sync
  // silently dead for the rest of the tab.
  inFlight ??= pushOnce(client).finally(() => { inFlight = null; });
  return inFlight;
}

const pending = () => dirtyDocs().filter((d) => !rejected.has(d.id) && !conflicts.has(d.id));
const settle = () => setStatus(conflicts.size ? 'conflict' : rejected.size ? 'unsynced' : 'saved');

type Saved = { revision: number } | { conflict: true } | { error: unknown };
type Client = NonNullable<ReturnType<typeof getClient>>;

/** Save one document: an update only from the revision it was edited from; an
 *  insert for a new one. Either finding the server moved on is a conflict. */
async function save(client: Client, d: StoredDoc, ownerId: string): Promise<Saved> {
  const row = toRow(d, ownerId);
  const done = ({ data, error }: { data: { revision: unknown }[] | null; error: unknown }): Saved => {
    if (error) return (error as { code?: unknown }).code === '23505' ? { conflict: true } : { error };
    const revision = Number(data?.[0]?.revision);
    return Number.isSafeInteger(revision) && revision > 0 ? { revision } : { conflict: true };
  };
  const failed = (error: unknown): Saved => ({ error: error ?? new Error('Network error') });
  const table = client.from('documents');
  if (d.revision !== undefined) {
    return table.update(row).eq('owner_id', ownerId).eq('id', d.id).eq('revision', d.revision).select('revision').then(done, failed);
  }
  // Cached before revisions existed and already on the server: saved as it
  // always was, once; from then on it has a revision.
  if (onServer.has(d.id)) return table.upsert(row).select('revision').then(done, failed);
  return table.insert(row).select('revision').then(done, failed);
}

async function pushOnce(client: NonNullable<ReturnType<typeof getClient>>): Promise<void> {
  const ownerId = attachedUid;
  const docs = pending();
  if (!ownerId || !docs.length) { settle(); return; }
  // One upsert per doc, so a doc the server refuses can't hold the others back.
  // Its images first: if they can't be uploaded, the doc waits with them.
  const results = await Promise.all(docs.map(async (d) => {
    try {
      await uploadPending(imageKeysOf(d.content, [d.headerImage, d.footerImage]));
    } catch (error) {
      return { error: error ?? new Error('Network error') } as Saved;
    }
    return save(client, d, ownerId);
  }));
  if (ownerId !== attachedUid) return; // signed out or switched while in flight
  let retry = false;
  const pushed: { doc: StoredDoc; revision: number }[] = [];
  const clashed: StoredDoc[] = [];
  docs.forEach((d, i) => {
    const result = results[i]!;
    if ('revision' in result) { pushed.push({ doc: d, revision: result.revision }); onServer.add(d.id); return; }
    if ('conflict' in result) { clashed.push(d); return; }
    const { error } = result;
    console.error(`Sync failed for ${d.id}`, error);
    // SQLSTATE class 22/23 (bad data, a failed CHECK): the same row will be
    // refused again. Anything else — network, an expired token — is retried.
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && /^2[23]/.test(code)) rejected.add(d.id);
    else retry = true;
  });
  markPushed(pushed);
  // Saved elsewhere first: fetch that version, to show the choice with it.
  for (const d of clashed) {
    const { data, error } = await client.from('documents').select(COLUMNS).eq('owner_id', ownerId).eq('id', d.id).maybeSingle().then(
      (r) => r,
      (failure: unknown) => ({ data: null, error: failure ?? new Error('Network error') }),
    );
    if (ownerId !== attachedUid) return;
    if (error) { retry = true; continue; }
    const server = (data ?? null) as Record<string, unknown> | null;
    if (server && sameEdits(server, d)) { replaceDoc(server); continue; }
    if (!server) onServer.delete(d.id);
    conflicts.set(d.id, { id: d.id, title: d.title, server, savedAt: typeof server?.savedAt === 'string' ? server.savedAt : null });
  }
  if (clashed.length) conflictsChanged();
  if (retry) { setStatus('unsynced'); schedulePush(RETRY_DELAY); }
  else if (pending().length) schedulePush();
  else settle();
}

/**
 * Point the store at this account and pull its docs, once per sign-in. A new
 * account starts empty. Throws when the server can't be reached; the caller
 * decides whether the cache is enough.
 */
export function loadAccount(uid: string): Promise<void> {
  const client = getClient();
  if (!client || loadedUid === uid) return Promise.resolve();
  // A second caller mid-load (a quick navigation, Strict Mode's double effect)
  // shares the pull instead of running it twice.
  if (loading?.uid === uid) return loading.promise;
  const promise = (async () => {
    // Attach once: after an offline start the store already holds this
    // account's cache (and maybe edits only in memory) — don't reset it on retry.
    if (attachedUid !== uid) {
      setStoreUser(uid);
      rejected.clear();
      onDocsDirty((ids) => { ids.forEach((id) => rejected.delete(id)); schedulePush(); });
      attachedUid = uid;
    }
    const rows: unknown[] = [];
    let total = Infinity;
    while (rows.length < total) {
      const { data, count, error } = await client.from('documents').select(COLUMNS, { count: 'exact' }).order('id').range(rows.length, rows.length + PAGE - 1);
      if (error) throw error;
      rows.push(...data);
      total = count ?? rows.length;
      if (!data.length) break;
    }
    onServer.clear();
    for (const r of rows) onServer.add(String((r as { id?: unknown }).id));
    applyPulled(rows);
    // Display settings follow the person: the account's win on this device.
    const { data: signedIn } = await client.auth.getSession();
    adoptDisplay(signedIn.session?.user.user_metadata?.display);
    adoptTours(signedIn.session?.user.user_metadata?.tour);
    loadedUid = uid;
    await push();
    void sweepImages(uid);
  })().finally(() => { loading = null; });
  loading = { uid, promise };
  return promise;
}

/**
 * Delete a document. Cloud mode deletes on the server first and needs a
 * connection: nothing is queued, so a deleted document can never come back
 * from a later push or pull. Resolves false if the server refused or could
 * not be reached; the document is then untouched.
 */
export async function removeDoc(id: string): Promise<boolean> {
  const client = getClient();
  if (!client) { deleteDoc(id, { byThisTab: true }); return true; }
  const ownerId = attachedUid;
  if (!ownerId) return false;
  // Let any push in flight land first, or its upsert could recreate the row.
  await push();
  const gone = loadDoc(id);
  const keys = imageKeysOf(gone?.content, [gone?.headerImage, gone?.footerImage]);
  const { error } = await client.from('documents').delete().eq('owner_id', ownerId).eq('id', id).then(
    (result) => result,
    (failure: unknown) => ({ error: failure ?? new Error('Network error') }),
  );
  if (error) { console.error(`Delete failed for ${id}`, error); return false; }
  if (ownerId !== attachedUid) return false; // signed out or switched meanwhile
  deleteDoc(id, { byThisTab: true });
  rejected.delete(id);
  onServer.delete(id);
  if (conflicts.delete(id)) conflictsChanged();
  settle();
  void removeUnused(ownerId, keys);
  return true;
}

/**
 * After a deletion: remove the deleted document's images that nothing else
 * uses, on the server or still only in this browser. Best effort; an image
 * left behind is removed by the next sweep (sweepImages), or with the account.
 */
async function removeUnused(ownerId: string, keys: string[]): Promise<void> {
  const client = getClient();
  if (!client || !keys.length) return;
  const onServer = await keysOnServer(keys);
  if (!onServer) return;
  const inUse = keysInUse();
  await removeRemote(ownerId, keys.filter((k) => !onServer.has(k) && !inUse.has(k)));
}

/** Every key a document in this browser uses: all of the account's, as pulled,
 *  plus edits not yet pushed. */
function keysInUse(): Set<string> {
  const used = new Set<string>();
  for (const d of allDocs()) for (const k of imageKeysOf(d.content, [d.headerImage, d.footerImage])) used.add(k);
  return used;
}

/** Which of `keys` a document row on the server uses, asked now rather than
 *  taken from the pull. Null if the server couldn't answer. */
async function keysOnServer(keys: readonly string[]): Promise<Set<string> | null> {
  const client = getClient();
  if (!client) return null;
  const used = new Set<string>();
  for (let i = 0; i < keys.length; i += KEY_BATCH) {
    const { data, error } = await client.from('documents').select('image_keys').overlaps('image_keys', keys.slice(i, i + KEY_BATCH));
    if (error) return null;
    for (const row of (data ?? []) as { image_keys?: string[] }[]) for (const k of row.image_keys ?? []) used.add(k);
  }
  return used;
}

/**
 * Images taken out of a document by editing stay in the bucket, so that undo
 * can bring them back; this removes them later. Once a day per browser, after
 * sign-in's pull and push: an image no document uses (on the server, or still
 * only in this browser), uploaded more than a week ago. The week covers
 * another device between uploading a picture and saving the document that
 * uses it. An editor left open here that undoes its way back to a swept image
 * re-uploads it (markPending). Best effort: a failure waits for tomorrow.
 */
async function sweepImages(ownerId: string): Promise<void> {
  if (Date.now() - sweptAt(ownerId) < DAY) return;
  const stored = await listRemote(ownerId);
  if (!stored || ownerId !== attachedUid) return;
  const cutoff = Date.now() - SWEEP_GRACE;
  const inUse = keysInUse();
  const candidates = stored.filter((o) => o.uploaded < cutoff && !inUse.has(o.key)).map((o) => o.key);
  if (candidates.length) {
    // Another device may have saved a document using one of them since the pull.
    const onServer = await keysOnServer(candidates);
    if (!onServer || ownerId !== attachedUid) return;
    const now = keysInUse(); // and this tab, since the listing
    const unused = candidates.filter((k) => !onServer.has(k) && !now.has(k));
    if (unused.length && !(await removeRemote(ownerId, unused))) return;
    await markPending(unused);
  }
  markSwept(ownerId);
}

/** Resolves false when edits never reached the server and the person chose
 *  to keep them rather than sign out. */
export async function signOut(confirmDiscard: () => boolean): Promise<boolean> {
  const client = getClient();
  if (!client) return true;
  await push();
  // Images a document uses and not yet uploaded are unsaved work too.
  const inUse = keysInUse();
  const unsavedImages = (await pendingKeys()).some((k) => inUse.has(k));
  if ((dirtyDocs().length || unsavedImages) && !confirmDiscard()) return false;
  const uid = attachedUid;
  // Clear first: signOut() fires AuthGate's listener, which would detach the
  // store before clearStore could find the account's cache to delete.
  forget();
  clearStore();
  if (uid) await clearImageScope(uid);
  // auth-js removes the local session even when the logout request fails
  // (offline), so a shared computer is signed out either way.
  await client.auth.signOut();
  return true;
}

/** The session ended or changed underneath this tab (another tab signed out
 *  or in, the session was revoked): stop syncing and let the store go inert.
 *  The cache stays on disk, so the same account signing back in keeps any
 *  unpushed edits. */
export function detachAccount(): void {
  forget();
  detachStore();
}

/**
 * Delete the signed-in account (and, by cascade, its documents), then leave
 * nothing of it in this browser. Resolves false if the server refused, so the
 * caller can say so. Works from any page — including /privacy, where the store
 * was never attached — because it clears the account's cache by uid.
 */
export async function deleteAccount(): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  const { data } = await client.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return false;
  // Storage doesn't cascade from the account: empty its image folder first,
  // and stop if that fails rather than leave pictures nobody can delete.
  if (!(await purgeFolder(uid))) { console.error('Account deletion stopped: its images could not be removed'); return false; }
  const { error } = await client.rpc('delete_my_account');
  if (error) { console.error('Account deletion failed', error); return false; }
  forget();
  setStoreUser(uid);
  clearStore();
  await clearImageScope(uid);
  // The user is gone, so the server's logout answers 404/403; auth-js treats
  // those as signed out and removes the local session.
  await client.auth.signOut();
  return true;
}

/** The account this tab's store belongs to, if any. */
export const attachedAccount = (): string | null => attachedUid;

function forget(): void {
  clearTimeout(timer);
  onDocsDirty(null);
  attachedUid = null;
  loadedUid = null;
  rejected.clear();
  onServer.clear();
  if (conflicts.size) { conflicts.clear(); conflictsChanged(); }
  lastRefresh = 0;
  setStatus('saved');
}

/* ---------- what changed elsewhere ---------- */

let lastRefresh = 0;
let refreshing: Promise<void> | null = null;
let openEditor: { id: string; flush: () => void; typing: () => boolean } | null = null;

/** The open editor registers its unsaved typing (a debounced save not yet in
 *  the store): flushed before a refresh or a conflict choice, and a document
 *  still being typed into is never replaced underneath it. */
export function setOpenEditor(editor: typeof openEditor): void {
  openEditor = editor;
}
const typingIn = (id: string) => openEditor?.id === id && openEditor.typing();

/**
 * Bring this tab up to date with other devices: push what's here, then ask
 * the server which documents it has at which revision, and take the newer or
 * new ones this copy has no edits to. Documents gone from the server and
 * untouched here go too. A copy with edits is left to the push, which finds
 * any conflict. At most once per REFRESH_GAP; never throws.
 */
export function refresh(force = false): Promise<void> {
  if (refreshing) return refreshing;
  if (!force && Date.now() - lastRefresh < REFRESH_GAP) return Promise.resolve();
  refreshing = refreshOnce().catch((error: unknown) => { console.error('Refresh failed', error); }).finally(() => { refreshing = null; });
  return refreshing;
}

async function refreshOnce(): Promise<void> {
  const client = getClient();
  const uid = attachedUid;
  if (!client || !uid || loadedUid !== uid) return;
  lastRefresh = Date.now();
  openEditor?.flush();
  await push();
  const heads: { id: string; revision: number }[] = [];
  let total = Infinity;
  while (heads.length < total) {
    const { data, count, error } = await client.from('documents').select('id,revision', { count: 'exact' }).order('id').range(heads.length, heads.length + PAGE - 1);
    if (error || uid !== attachedUid) return;
    heads.push(...(data as { id: string; revision: number }[]));
    total = count ?? heads.length;
    if (!data.length) break;
  }
  const local = new Map(allDocs().map((d) => [d.id, d]));
  const settled = (id: string) => !isDirty(id) && !conflicts.has(id) && !typingIn(id);
  const stale = heads.filter((h) => settled(h.id) && local.get(h.id)?.revision !== Number(h.revision)).map((h) => h.id);
  const there = new Set(heads.map((h) => h.id));
  onServer.clear();
  there.forEach((id) => onServer.add(id));
  for (let i = 0; i < stale.length; i += ID_BATCH) {
    const { data, error } = await client.from('documents').select(COLUMNS).eq('owner_id', uid).in('id', stale.slice(i, i + ID_BATCH));
    if (error || uid !== attachedUid) return;
    // Edited while this was fetched: the push decides, not this.
    for (const row of (data ?? []) as Record<string, unknown>[]) if (settled(String(row.id))) replaceDoc(row);
  }
  for (const d of local.values()) if (!there.has(d.id) && d.revision !== undefined && settled(d.id)) deleteDoc(d.id);
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { if (attachedUid) void refresh(true); });
  window.addEventListener('focus', () => { if (attachedUid) void refresh(); });
  document.addEventListener('visibilitychange', () => { if (attachedUid && document.visibilityState === 'visible') void refresh(); });
}
