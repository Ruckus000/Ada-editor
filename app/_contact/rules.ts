/**
 * Contact form rules shared by the page and the server route, so the form
 * refuses for the same reasons the server would. Refusals are only for what a
 * person can fix (empty, too long, not an email address); everything merely
 * suspicious is held for review instead (see app/_contact/score.ts).
 */

/** Puzzle difficulty in leading zero bits. BASE is ~65k SHA-256s, about a
 *  quarter second in a desktop browser; the server raises it under load, up
 *  to MAX (16x: a few seconds, mostly spent while the sender is typing). */
export const POW_BASE_BITS = 16;
export const POW_MAX_BITS = 20;
/** Faster than this after the page loaded, it wasn't a person typing. */
export const MIN_MS = 3_000;
/** A challenge older than this has to be fetched again. */
export const MAX_MS = 24 * 60 * 60_000;
export const MAX_MESSAGE = 5_000;
/** The hidden field only bots fill in. */
export const TRAP = 'website';

export const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** A visible reason, or null when the message may go. */
export function checkMessage(message: string): string | null {
  const text = message.trim();
  if (!text) return 'Write a message first.';
  if (text.length > MAX_MESSAGE) return `Keep the message under ${MAX_MESSAGE.toLocaleString('en')} characters.`;
  return null;
}

export function checkEmail(email: string): string | null {
  const text = email.trim();
  if (!text) return 'Enter the email address we should reply to.';
  if (text.length > 254 || !EMAIL_SHAPE.test(text)) return 'Enter an email address like name@example.org.';
  return null;
}

/** Counts the leading zero bits of a digest. */
export function zeroBits(bytes: Uint8Array): number {
  let bits = 0;
  for (const b of bytes) {
    if (b === 0) { bits += 8; continue; }
    return bits + Math.clz32(b) - 24;
  }
  return bits;
}
