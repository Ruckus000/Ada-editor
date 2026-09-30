/**
 * Contact form rules shared by the page and the server route, so the form
 * says no for the same reasons the server would.
 */

/** Leading zero bits the proof of work needs: ~65k SHA-256s on average, a
 *  second or two in a browser, while the sender is still typing. */
export const POW_BITS = 16;
/** Faster than this after the page loaded, it wasn't a person typing. */
export const MIN_MS = 3_000;
/** A challenge older than this has to be fetched again. */
export const MAX_MS = 24 * 60 * 60_000;
export const MAX_MESSAGE = 5_000;
export const MAX_LINKS = 3;
/** Sends per sender per hour, and for everyone together. */
export const PER_IP_PER_HOUR = 3;
export const TOTAL_PER_HOUR = 30;
/** The hidden field only bots fill in. */
export const TRAP = 'website';

export const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const LINK = /\b(?:https?:\/\/|www\.)/gi;

/** A visible reason, or null when the message may go. */
export function checkMessage(message: string): string | null {
  const text = message.trim();
  if (!text) return 'Write a message first.';
  if (text.length > MAX_MESSAGE) return `Keep the message under ${MAX_MESSAGE.toLocaleString('en')} characters.`;
  if ((text.match(LINK) ?? []).length > MAX_LINKS) return `Include at most ${MAX_LINKS} links.`;
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
