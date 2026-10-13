import { PRACTICE_ON, PRACTICE_PREFIX } from './practice';
import { SEEDS, buildSeedDocument } from './seed';
import { createDoc } from './store';
import { isCloud } from './supabase';
import { markTourSeen, tourSeen } from './tour';

/* Kept apart from practice.ts so the sign-up page can read the flag without
 * loading the store and the editor schema. */

/** Puts the practice document on an empty account desk, once per person.
 *  Returns whether it did. The hearing notice is the local seed people
 *  already practise on, so its planted problems are known to the checker. */
export function givePracticeDoc(docCount: number): boolean {
  if (!PRACTICE_ON || !isCloud || docCount > 0 || tourSeen('practice')) return false;
  const seed = SEEDS.find((s) => s.id === 'hearing-notice');
  if (!seed) return false;
  markTourSeen('practice');
  createDoc({
    title: `${PRACTICE_PREFIX}${seed.content.title}`,
    header: seed.content.header,
    footer: seed.content.footer,
    content: buildSeedDocument(seed.content).toJSON() as Record<string, unknown>,
    importNotes: [],
  });
  return true;
}
