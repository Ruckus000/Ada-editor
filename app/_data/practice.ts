/**
 * The practice document: one sample notice with problems planted in it, put
 * on a new account's desk once. Off unless NEXT_PUBLIC_PRACTICE_DOC=1, because
 * it writes a document into every new account (open question: quota). It is
 * given once: deleted, it doesn't come back (tour.ts records it). Local mode
 * already has the eight seeds, so the flag only changes accounts.
 */
export const PRACTICE_ON = process.env.NEXT_PUBLIC_PRACTICE_DOC === '1';

export const PRACTICE_TITLE = 'Practice: Notice of Public Hearing';

/** Its id: the slug createDoc gives PRACTICE_TITLE on an empty desk. The
 *  first-visit desk recognises it by id, so a document someone titles
 *  "Practice: …" is just a document, and a renamed practice one still counts. */
export const PRACTICE_ID = 'practice-notice-of-public-hearing';
