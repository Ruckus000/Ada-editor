/**
 * localStorage-backed document store (§3 of docs/audit/checking-engine-plan.md).
 *
 * Scoping decision, stated explicitly: there is no auth, no accounts and no
 * backend in this product, so v1 persists documents for one implicit local
 * user. Known limitations: no cross-device sync, no collaboration, lost on
 * "clear browsing data".
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
import { schema } from '../_editor/editorSchema';
import { checkDocument } from '../_engine/check';
import { SEEDS, buildSeedDocument } from './seed';
import type { DocSummary } from './seed';

export type DocJSON = Record<string, unknown>;

export interface StoredDoc {
  id: string;
  title: string;
  owner: string;
  targets: string[];
  /** Header/footer band text. Section images are not persisted in v1 —
   *  same as today's reload behavior. */
  header: string;
  footer: string;
  content: DocJSON;
  /** Epoch ms of the last full check. */
  lastChecked: number;
}

const STORAGE_KEY = 'ada.docs.v1';

/** In-memory fallback when localStorage is unavailable or corrupt. */
let memoryDocs: Map<string, StoredDoc> | null = null;

const hasLocalStorage = (): boolean => {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false; // some browsers throw on mere access in private mode
  }
};

/** The one-time seed, built from the demo content (§7 step 7). */
function seedDocs(): Map<string, StoredDoc> {
  const now = Date.now();
  const map = new Map<string, StoredDoc>();
  SEEDS.forEach((seed, i) => {
    map.set(seed.id, {
      id: seed.id,
      title: seed.title,
      owner: seed.owner,
      targets: [...seed.targets],
      header: seed.content.header,
      footer: seed.content.footer,
      content: buildSeedDocument(seed.content).toJSON() as DocJSON,
      // Staggered so the "most recently checked" order has a stable shape.
      lastChecked: now - i * 60_000,
    });
  });
  return map;
}

function readAll(): Map<string, StoredDoc> {
  if (hasLocalStorage()) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return new Map((parsed as StoredDoc[]).map((d) => [d.id, d]));
        }
      }
    } catch {
      // Corrupt or unreadable: fall through to a fresh in-memory seed.
    }
  }
  if (!memoryDocs) memoryDocs = seedDocs();
  return memoryDocs;
}

function writeAll(docs: Map<string, StoredDoc>): void {
  if (hasLocalStorage()) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...docs.values()]));
      return;
    } catch {
      // Quota or private mode: keep the session running in memory.
    }
  }
  memoryDocs = docs;
}

/** Populate the store from the seed content on first visit (or after corruption). */
export function seedIfEmpty(): void {
  if (hasLocalStorage()) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed) && parsed.length > 0) return;
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

export function loadDoc(id: string): StoredDoc | null {
  seedIfEmpty();
  return readAll().get(id) ?? null;
}

export function saveDoc(id: string, patch: Partial<Pick<StoredDoc, 'content' | 'header' | 'footer' | 'lastChecked'>>): void {
  const all = readAll();
  const existing = all.get(id);
  if (!existing) return;
  all.set(id, { ...existing, ...patch });
  writeAll(all);
}

/** The dashboard's document list, with counts computed by the real engine (§3). */
export function loadDocSummaries(): DocSummary[] {
  seedIfEmpty();
  const sorted = [...readAll().values()].sort((a, b) => b.lastChecked - a.lastChecked);
  const now = Date.now();
  return sorted.map((d, order) => ({
    id: d.id,
    title: d.title,
    owner: d.owner,
    targets: d.targets,
    counts: countsOf(checkDocument(docFromJSON(d.content), { prose: true })),
    lastChecked: relativeTime(d.lastChecked, now),
    order,
  }));
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
