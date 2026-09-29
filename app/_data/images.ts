import { getClient } from './supabase';
import { MAX_IMAGE_BYTES, sha256Hex, sniffImage, validImageKey } from './imageFormat';
import type { ImageMime } from './imageFormat';

/**
 * Image bytes, kept out of the document: a figure stores only a key (the
 * SHA-256 of its bytes), and this module keeps the bytes behind it.
 *
 * Every image lives in this browser's IndexedDB, scoped to local mode or to
 * one account, so a shared browser never shows one account's pictures to
 * another. With an account the private `images` bucket is the copy that
 * lasts, at `<uid>/<key>`: an image added here is marked pending until sync
 * uploads it (before the document that uses it), and one this browser has
 * never seen is downloaded on first view and cached.
 *
 * Browser only: without IndexedDB (the Node gates, prerender) every call does
 * nothing, and reads find nothing.
 */

export interface StoredImage {
  blob: Blob;
  mime: ImageMime;
  width: number;
  height: number;
}

interface Row extends StoredImage {
  scope: string;
  key: string;
  /** Added here and not yet in the account's bucket. */
  pending: boolean;
}

export class ImageError extends Error {
  constructor(readonly reason: 'type' | 'size' | 'quota', message: string) {
    super(message);
  }
}

const BUCKET = 'images';
const DB = 'ada-images';
const STORE = 'blobs';

/** 'local', a user id, or null (cloud mode with nobody signed in: nothing is kept). */
let scope: string | null = 'local';
let cloud = false;

/** Called by the store as it switches between local mode and accounts. */
export function setImageScope(next: { uid: string | null; cloud: boolean } | null): void {
  releaseAll();
  scope = next ? next.uid ?? 'local' : null;
  cloud = next?.cloud ?? true;
}

let opening: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  opening ??= new Promise((resolve) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: ['scope', 'key'] });
      store.createIndex('scope', 'scope');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return opening;
}

function request<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return db().then((d) => new Promise<T | undefined>((resolve, reject) => {
    if (!d) { resolve(undefined); return; }
    const tx = d.transaction(STORE, mode);
    const req = run(tx.objectStore(STORE));
    let result: T | undefined;
    req.onsuccess = () => { result = req.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error ?? req.error);
    tx.onabort = () => reject(tx.error ?? req.error);
  }));
}

const isQuota = (e: unknown) => e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED');

async function readRow(key: string): Promise<Row | undefined> {
  if (scope === null) return undefined;
  return request<Row>('readonly', (s) => s.get([scope!, key]) as IDBRequest<Row>);
}

async function writeRow(row: Row): Promise<void> {
  try {
    await request('readwrite', (s) => s.put(row));
  } catch (e) {
    throw isQuota(e) ? new ImageError('quota', 'There’s no room left in this browser to keep the image.') : e;
  }
}

/**
 * Keep `bytes` and return the key and displayed size a figure stores. Refuses
 * anything that isn't a PNG, JPEG, GIF or WebP by its bytes, or over 10 MB.
 */
export async function putImage(bytes: Uint8Array): Promise<{ key: string; mime: ImageMime; width: number; height: number }> {
  if (bytes.length > MAX_IMAGE_BYTES) throw new ImageError('size', 'That image is over 10 MB. Use a smaller copy.');
  const kind = sniffImage(bytes);
  if (kind?.kind !== 'image') throw new ImageError('type', 'That file isn’t a PNG, JPEG, GIF or WebP image.');
  const key = await sha256Hex(bytes);
  if (scope !== null) {
    const existing = await readRow(key);
    // Already here: an upload still owed stays owed; an uploaded one stays done.
    if (!existing) {
      await writeRow({ scope, key, blob: new Blob([bytes as BlobPart], { type: kind.mime }), mime: kind.mime, width: kind.width, height: kind.height, pending: cloud });
    }
  }
  return { key, mime: kind.mime, width: kind.width, height: kind.height };
}

/** The image behind `key`: from this browser, or (with an account) downloaded
 *  from the bucket and cached. Null when it can't be had. */
export async function getImage(rawKey: string): Promise<StoredImage | null> {
  const key = validImageKey(rawKey);
  if (!key || scope === null) return null;
  const row = await readRow(key).catch(() => undefined);
  if (row) return row;
  const client = getClient();
  if (!cloud || !client || scope === 'local') return null;
  const { data, error } = await client.storage.from(BUCKET).download(`${scope}/${key}`);
  if (error || !data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  const kind = sniffImage(bytes);
  // What the bucket hands back must still be what the key says it is.
  if (kind?.kind !== 'image' || (await sha256Hex(bytes)) !== key) return null;
  const image = { blob: new Blob([bytes as BlobPart], { type: kind.mime }), mime: kind.mime, width: kind.width, height: kind.height };
  await writeRow({ scope, key, ...image, pending: false }).catch(() => undefined);
  return image;
}

/* ---------- object URLs for the editor ---------- */

const urls = new Map<string, { url: Promise<string | null>; count: number }>();

/** An object URL for `key`, shared by everything showing it; pair with releaseUrl. */
export function acquireUrl(key: string): Promise<string | null> {
  const held = urls.get(key);
  if (held) { held.count++; return held.url; }
  const url = getImage(key).then((image) => (image ? URL.createObjectURL(image.blob) : null));
  urls.set(key, { url, count: 1 });
  return url;
}

export function releaseUrl(key: string): void {
  const held = urls.get(key);
  if (!held || --held.count > 0) return;
  urls.delete(key);
  void held.url.then((url) => { if (url) URL.revokeObjectURL(url); });
}

function releaseAll(): void {
  for (const { url } of urls.values()) void url.then((u) => { if (u) URL.revokeObjectURL(u); });
  urls.clear();
}

/* ---------- the account's bucket (sync.ts) ---------- */

/** Upload whichever of `keys` are still owed to the bucket. Throws when the
 *  network fails, so the document that needs them isn't pushed without them. */
export async function uploadPending(keys: readonly string[]): Promise<void> {
  const client = getClient();
  if (!cloud || !client || scope === null || scope === 'local') return;
  for (const key of keys) {
    const row = await readRow(key);
    if (!row?.pending) continue;
    const { error } = await client.storage.from(BUCKET).upload(`${scope}/${key}`, row.blob, { contentType: row.mime, upsert: false });
    const e = error as (Error & { status?: number; statusCode?: string }) | null;
    // Content-addressed: "already there" is the same image, so it's done.
    const duplicate = e && (e.status === 409 || e.statusCode === '409' || /exists|duplicate/i.test(e.message));
    if (e && !duplicate) {
      if (e.status === undefined) throw e; // the network, not a refusal: try again later
      console.error(`Image upload refused for ${key}`, e);
      continue;
    }
    await writeRow({ ...row, pending: false });
  }
}

/** Keys added in this browser and not yet uploaded. */
export async function pendingKeys(): Promise<string[]> {
  if (scope === null) return [];
  const rows = await request<Row[]>('readonly', (s) => s.index('scope').getAll(scope!) as IDBRequest<Row[]>).catch(() => []);
  return (rows ?? []).filter((r) => r.pending).map((r) => r.key);
}

/** Delete these keys from the account's bucket (best effort). False if the
 *  bucket refused or couldn't be reached. */
export async function removeRemote(uid: string, keys: readonly string[]): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  for (let i = 0; i < keys.length; i += 1000) {
    const { error } = await client.storage.from(BUCKET).remove(keys.slice(i, i + 1000).map((k) => `${uid}/${k}`));
    if (error) { console.error('Image delete failed', error); return false; }
  }
  return true;
}

/** The account's stored images and when each was uploaded (ms), or null if
 *  the listing failed. Anything in the folder that isn't a key is left out. */
export async function listRemote(uid: string): Promise<{ key: string; uploaded: number }[] | null> {
  const client = getClient();
  if (!client) return null;
  const found: { key: string; uploaded: number }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.storage.from(BUCKET).list(uid, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) return null;
    for (const f of data ?? []) {
      const key = validImageKey(f.name);
      const uploaded = f.created_at ? Date.parse(f.created_at) : NaN;
      if (key && Number.isFinite(uploaded)) found.push({ key, uploaded });
    }
    if (!data || data.length < 1000) return found;
  }
}

/** Owe these keys to the bucket again, where this browser still has them: an
 *  image swept from the bucket that an undo here brings back is re-uploaded
 *  with the document, instead of saved as a key with nothing behind it. */
export async function markPending(keys: readonly string[]): Promise<void> {
  if (!cloud || scope === null || scope === 'local') return;
  for (const key of keys) {
    const row = await readRow(key).catch(() => undefined);
    if (row && !row.pending) await writeRow({ ...row, pending: true }).catch(() => undefined);
  }
}

/* When this browser last swept the account's folder (sync.ts), so it happens
   once a day rather than on every page load. Lost storage only means an
   earlier sweep. */
const sweptKey = (uid: string) => `ada.images.swept.${uid}`;

export function sweptAt(uid: string): number {
  try { return Number(window.localStorage.getItem(sweptKey(uid))) || 0; } catch { return 0; }
}

export function markSwept(uid: string): void {
  try { window.localStorage.setItem(sweptKey(uid), String(Date.now())); } catch { /* a sweep tomorrow is harmless */ }
}

/** Empty the account's whole folder. False if any of it couldn't be removed. */
export async function purgeFolder(uid: string): Promise<boolean> {
  const client = getClient();
  if (!client) return true;
  for (;;) {
    const { data, error } = await client.storage.from(BUCKET).list(uid, { limit: 1000 });
    if (error) return false;
    if (!data?.length) return true;
    const { error: removeError } = await client.storage.from(BUCKET).remove(data.map((f) => `${uid}/${f.name}`));
    if (removeError) return false;
  }
}

/** Forget an account's images in this browser (sign-out, account deletion). */
export async function clearImageScope(uid: string): Promise<void> {
  if (scope === uid) releaseAll();
  try { window.localStorage.removeItem(sweptKey(uid)); } catch { /* nothing kept */ }
  const keys = await request<IDBValidKey[]>('readonly', (s) => s.index('scope').getAllKeys(uid)).catch(() => []);
  for (const k of keys ?? []) await request('readwrite', (s) => s.delete(k)).catch(() => undefined);
}
