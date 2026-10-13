import { PRACTICE_ID, PRACTICE_ON, PRACTICE_TITLE } from './practice';
import { SEEDS, buildSeedDocument } from './seed';
import { createDoc } from './store';
import { isCloud } from './supabase';
import { markTourSeen, tourSeen } from './tour';
import { report } from '../_site/sentry';

/* Kept apart from practice.ts so the sign-up page can read the flag without
 * loading the store and the editor schema. */

/** Puts the practice document on an empty account desk, once per person.
 *  Returns whether it did. The hearing notice is the local seed people
 *  already practise on, so its planted problems are known to the checker. */
export function givePracticeDoc(docCount: number): boolean {
  if (!PRACTICE_ON || !isCloud || docCount > 0 || tourSeen('practice')) return false;
  const seed = SEEDS.find((s) => s.id === 'hearing-notice');
  if (!seed) return false;
  const { id, persisted } = createDoc({
    title: PRACTICE_TITLE,
    header: seed.content.header,
    footer: seed.content.footer,
    content: buildSeedDocument(seed.content).toJSON() as Record<string, unknown>,
    importNotes: [],
  });
  // Recorded only once it is kept: a copy this browser couldn't store comes
  // back next visit (unless sync got it to the server, which fills the desk).
  if (persisted) markTourSeen('practice');
  if (id !== PRACTICE_ID) report(new Error(`Practice document got id ${id}`));
  return true;
}
