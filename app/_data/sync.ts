import { useSyncExternalStore } from 'react';
import { getClient } from './supabase';
import { allDocs, applyPulled, clearStore, deleteDoc, detachStore, dirtyDocs, loadDoc, markClean, onDocsDirty, seedAccount, setStoreUser } from './store';
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
 * ponytail: last push wins. A tab pulls once per sign-in, so a document
 * edited on another device since then is overwritten if it is also EDITED in
 * this tab (merely opening it no longer pushes). Upgrade: an updated_at
 * precondition on the upsert (optimistic concurrency) plus a re-pull on focus,
 * when people report lost edits across devices.
 */

// PostgREST aliases map snake_case columns onto StoredDoc's fields.
const COLUMNS = 'id,title,owner,targets,header,footer,headerImage:header_image,footerImage:footer_image,content,lastChecked:last_checked,dismissed,importNotes:import_notes';
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

export type SyncStatus = 'saved' | 'saving' | 'unsynced';

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
  updated_at: new Date().toISOString(),
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

const pending = () => dirtyDocs().filter((d) => !rejected.has(d.id));
const settle = () => setStatus(rejected.size ? 'unsynced' : 'saved');

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
      return error ?? new Error('Network error');
    }
    return client.from('documents').upsert(toRow(d, ownerId)).then(
      ({ error }) => error,
      (error: unknown) => error ?? new Error('Network error'),
    );
  }));
  if (ownerId !== attachedUid) return; // signed out or switched while in flight
  let retry = false;
  const pushed = docs.filter((d, i) => {
    const error = results[i];
    if (!error) return true;
    console.error(`Sync failed for ${d.id}`, error);
    // SQLSTATE class 22/23 (bad data, a failed CHECK): the same row will be
    // refused again. Anything else — network, an expired token — is retried.
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && /^2[23]/.test(code)) rejected.add(d.id);
    else retry = true;
    return false;
  });
  markClean(pushed);
  if (retry) { setStatus('unsynced'); schedulePush(RETRY_DELAY); }
  else if (pending().length) schedulePush();
  else settle();
}

/**
 * Point the store at this account and pull its docs, once per sign-in. A new
 * account (nothing on the server) gets the sample document, once. Throws when the
 * server can't be reached; the caller decides whether the cache is enough.
 */
export function loadAccount(uid: string): Promise<void> {
  const client = getClient();
  if (!client || loadedUid === uid) return Promise.resolve();
  // A second caller mid-load (a quick navigation, Strict Mode's double effect)
  // shares the pull instead of running it — and the seeding — twice.
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
    applyPulled(rows);
    // The sample is a first-visit gift, not a floor: once given, an account
    // that deletes everything stays empty. The flag lives in the user's own
    // metadata; losing it only means the sample is offered once more.
    if (rows.length === 0) {
      const { data } = await client.auth.getSession();
      if (!data.session?.user.user_metadata?.sample_seeded) {
        seedAccount();
        void client.auth.updateUser({ data: { sample_seeded: true } }).then(({ error }) => { if (error) console.error('Could not record the sample', error); });
      }
    }
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
  if (!client) { deleteDoc(id); return true; }
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
  deleteDoc(id);
  rejected.delete(id);
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
  setStatus('saved');
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { if (attachedUid) void push(); });
}
