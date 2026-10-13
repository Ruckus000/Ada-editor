import { getClient } from './supabase';

/**
 * Which first-run tours this person has seen or turned down, and whether the
 * practice document was put on their desk. Kept in this browser and in the
 * account's user metadata (like display settings), so a tour declined on the
 * iPad isn't offered again on the laptop, and a deleted practice document
 * doesn't come back.
 */
export type TourName = 'desk' | 'editor';
export type FirstRun = TourName | 'practice';
type Seen = Partial<Record<FirstRun, boolean>>;
const NAMES: readonly FirstRun[] = ['desk', 'editor', 'practice'];
const KEY = 'ada.tour';

function read(): Seen {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    return Object.fromEntries(NAMES.map((n) => [n, o[n] === true]));
  } catch { return {}; }
}

function write(seen: Seen): void {
  try { localStorage.setItem(KEY, JSON.stringify(seen)); } catch { /* storage blocked: offered again next visit */ }
}

async function saveToAccount(seen: Seen): Promise<void> {
  const client = getClient();
  if (!client) return;
  const { data } = await client.auth.getSession();
  if (!data.session) return;
  const { error } = await client.auth.updateUser({ data: { tour: seen } });
  if (error) console.error('Could not save the tour to the account', error);
}

export const tourSeen = (name: FirstRun): boolean => read()[name] === true;

export function markTourSeen(name: FirstRun): void {
  const seen = { ...read(), [name]: true };
  write(seen);
  void saveToAccount(seen);
}

/** "Take the tour" in Help: offer both again (the practice document stays
 *  given: replaying the tour doesn't put a second one on the desk). */
export async function resetTours(): Promise<void> {
  const kept: Seen = read().practice ? { practice: true } : {};
  write(kept);
  await saveToAccount(kept);
}

/** Signing in on this device: seen anywhere counts as seen here. */
export function adoptTours(fromAccount: unknown): void {
  if (!fromAccount || typeof fromAccount !== 'object') return;
  const o = fromAccount as Record<string, unknown>;
  const here = read();
  write(Object.fromEntries(NAMES.map((n) => [n, here[n] === true || o[n] === true])));
}
