import disposable from './disposable-domains.json';

/**
 * Content signals that hold a message for review. Never a refusal: a real
 * person can paste four links, write in capitals or use a throwaway address,
 * and their report still lands, just in the held list. Every rule is here,
 * in plain code, so a held message's `held_reason` can be traced to one.
 */

const DISPOSABLE = new Set(disposable.domains);
const MAX_LINKS = 3;
const LINK = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;
/** Link shorteners hide the destination; spam leans on them. */
const SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'cutt.ly', 'rebrand.ly', 'shorturl.at',
  'tiny.cc', 'rb.gy', 'bl.ink', 't.ly', 's.id', 'v.gd', 'clck.ru',
]);
/** Kept short and specific: the phrases contact-form spam is made of, not
 *  words a barrier report might contain. */
const PHRASES = [
  /\bseo (?:services?|agency|expert)\b/i, /\bbacklinks?\b/i, /\bguest post(?:ing)?\b/i, /\bcasino\b/i,
  /\bcrypto(?:currency)? (?:investment|trading|signals)\b/i, /\bviagra\b|\bcialis\b/i, /\bpayday loans?\b/i,
  /\b(?:rank|ranking) (?:your|on) (?:website|google)\b/i, /\bwhatsapp me\b/i,
];

/** Registrable domain and its parents: a.b.mailinator.com matches mailinator.com. */
function domainAndParents(domain: string): string[] {
  const parts = domain.toLowerCase().split('.');
  return parts.slice(0, -1).map((_, i) => parts.slice(i).join('.'));
}

export const isDisposable = (email: string) => domainAndParents(email.split('@').pop() ?? '').some((d) => DISPOSABLE.has(d));

/** The first reason to hold this message, or null. */
export function holdReason(message: string, email: string | null): string | null {
  if (email && isDisposable(email)) return 'disposable-email';
  const links = message.match(LINK) ?? [];
  if (links.length > MAX_LINKS) return 'many-links';
  for (const l of links) {
    const host = l.replace(/^https?:\/\//i, '').split(/[/?#:]/)[0]?.toLowerCase().replace(/^www\./, '') ?? '';
    if (SHORTENERS.has(host)) return 'link-shortener';
  }
  if (PHRASES.some((p) => p.test(message))) return 'spam-phrase';
  const letters = message.replace(/[^\p{L}]/gu, '');
  if (letters.length >= 20 && letters.replace(/[^\p{Lu}]/gu, '').length / letters.length > 0.7) return 'shouting';
  if (/(.)\1{11,}/u.test(message)) return 'repetition';
  const words = message.toLowerCase().match(/\p{L}{3,}/gu) ?? [];
  if (words.length >= 12) {
    const counts = new Map<string, number>();
    for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
    if (Math.max(...counts.values()) / words.length > 0.4) return 'repetition';
  }
  return null;
}
