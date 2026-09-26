import { useSyncExternalStore } from 'react';
import { getClient } from './supabase';
import { applyPulled, clearStore, dirtyDocs, markClean, onDocsDirty, seedAccount, setStoreUser } from './store';
import type { StoredDoc } from './store';

/**
 * Write-behind from the local store to public.documents (cloud mode only).
 * The store stays the synchronous working copy; this pulls an account's docs
 * once per sign-in and pushes whatever the store marks dirty.
 *
 * ponytail: last push wins — two devices editing the same document at once
 * overwrite each other. Upgrade: an updated_at precondition on the upsert
 * (optimistic concurrency) when people report lost edits.
 */

// PostgREST aliases map snake_case columns onto StoredDoc's fields.
const COLUMNS = 'id,title,owner,targets,header,footer,content,lastChecked:last_checked,dismissed,importNotes:import_notes';
const PUSH_DELAY = 1000;
const RETRY_DELAY = 30_000;

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
let loadedUid: string | null = null;
let loading: { uid: string; promise: Promise<void> } | null = null;

function schedulePush(delay = PUSH_DELAY): void {
  clearTimeout(timer);
  if (status === 'saved') setStatus('saving');
  timer = setTimeout(() => { void push(); }, delay);
}

const toRow = (d: StoredDoc) => ({
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
  updated_at: new Date().toISOString(),
});

/** Push every dirty doc. Never throws: a failure leaves the docs dirty (they
 *  survive in this browser) and shows `unsynced` until a retry lands. */
function push(): Promise<void> {
  const client = getClient();
  if (!client) return Promise.resolve();
  inFlight ??= (async () => {
    try {
      const docs = dirtyDocs();
      if (!docs.length) { setStatus('saved'); return; }
      const { error } = await client.from('documents').upsert(docs.map(toRow));
      if (error) throw error;
      docs.forEach(markClean);
      if (dirtyDocs().length) schedulePush();
      else setStatus('saved');
    } catch (error) {
      console.error('Sync failed', error);
      setStatus('unsynced');
      schedulePush(RETRY_DELAY);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * Point the store at this account and pull its docs, once per sign-in. A new
 * account (nothing on the server) gets the sample documents. Throws when the
 * server can't be reached; the caller decides whether the cache is enough.
 */
export function loadAccount(uid: string): Promise<void> {
  const client = getClient();
  if (!client || loadedUid === uid) return Promise.resolve();
  // A second caller mid-load (a quick navigation, Strict Mode's double effect)
  // shares the pull instead of running it — and the seeding — twice.
  if (loading?.uid === uid) return loading.promise;
  const promise = (async () => {
    setStoreUser(uid);
    onDocsDirty(() => schedulePush());
    const { data, error } = await client.from('documents').select(COLUMNS);
    if (error) throw error;
    applyPulled(data);
    if (data.length === 0) seedAccount();
    loadedUid = uid;
    await push();
  })().finally(() => { loading = null; });
  loading = { uid, promise };
  return promise;
}

/** Resolves false when edits never reached the server and the person chose
 *  to keep them rather than sign out. */
export async function signOut(confirmDiscard: () => boolean): Promise<boolean> {
  const client = getClient();
  if (!client) return true;
  await push();
  if (dirtyDocs().length && !confirmDiscard()) return false;
  clearTimeout(timer);
  onDocsDirty(null);
  await client.auth.signOut();
  clearStore();
  loadedUid = null;
  setStatus('saved');
  return true;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { if (loadedUid) void push(); });
}
