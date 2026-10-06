import { getClient } from './supabase';

/**
 * Which first-run tours this person has seen or turned down. Kept in this
 * browser and in the account's user metadata (like display settings), so a
 * tour declined on the iPad isn't offered again on the laptop.
 */
export type TourName = 'desk' | 'editor';
type Seen = Partial<Record<TourName, boolean>>;
const KEY = 'ada.tour';

function read(): Seen {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    return { desk: o.desk === true, editor: o.editor === true };
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

export const tourSeen = (name: TourName): boolean => read()[name] === true;

export function markTourSeen(name: TourName): void {
  const seen = { ...read(), [name]: true };
  write(seen);
  void saveToAccount(seen);
}

/** "Take the tour" in Help: offer both again. */
export async function resetTours(): Promise<void> {
  write({});
  await saveToAccount({});
}

/** Signing in on this device: seen anywhere counts as seen here. */
export function adoptTours(fromAccount: unknown): void {
  if (!fromAccount || typeof fromAccount !== 'object') return;
  const o = fromAccount as Record<string, unknown>;
  const here = read();
  write({ desk: here.desk === true || o.desk === true, editor: here.editor === true || o.editor === true });
}
