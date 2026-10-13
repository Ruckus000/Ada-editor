/**
 * The practice document: one sample notice with problems planted in it, put
 * on a new account's desk once. Off unless NEXT_PUBLIC_PRACTICE_DOC=1, because
 * it writes a document into every new account (open question: quota). It is
 * given once: deleted, it doesn't come back (tour.ts records it). Local mode
 * already has the eight seeds, so the flag only changes accounts.
 */
export const PRACTICE_ON = process.env.NEXT_PUBLIC_PRACTICE_DOC === '1';

/** How the first-visit desk recognises it. Renamed, it's just a document. */
export const PRACTICE_PREFIX = 'Practice: ';

export const isPractice = (title: string): boolean => title.startsWith(PRACTICE_PREFIX);
