/**
 * Pure string analysis for the checking engine, ported verbatim from the
 * rule-set spike (scripts/spike/rules.mjs). The spike's 156 `reading-level`
 * findings on a 28-document corpus were validated against exactly this
 * syllable counter and grade formula — a readability library with different
 * syllable-counting would silently change validated numbers, so none is used
 * (and none may be added: zero new runtime dependencies).
 *
 * No DOM, no ProseMirror — these are pure functions on strings, verified by
 * scripts/verify-rules.mjs.
 *
 * One deliberate deviation from the spike: `sentenceSpans` replaces its
 * lookbehind-based sentence split. Lookbehind is unsupported by Safari 12,
 * which the shipped browserslist still includes, and SWC will not transpile a
 * regex literal — the pattern would throw at module parse. Capture-and-rejoin
 * gives identical results without it. (This file must never contain the
 * two-character sequence question-mark-angle-bracket: verify-rules.mjs
 * enforces that at the source-text level, comments included.)
 */

/** Link labels that say nothing about the destination (2.4.4). */
export const GENERIC_LINK_TEXT: ReadonlySet<string> = new Set([
  'click here', 'here', 'read more', 'more', 'learn more', 'link', 'this',
  'this link', 'click', 'details', 'see more', 'continue', 'go', 'download',
]);

/** Words that describe an appearance the reader may not be able to perceive. */
export const COLOUR_WORDS = /\b(red|green|blue|yellow|orange|purple|pink|grey|gray|black|white)\b/i;
/** Only a problem when the colour is doing the pointing. */
export const COLOUR_REFERENCE = /\b(the|in|marked|shown|highlighted|coloured|colored|see)\s+\w{0,12}\s*(red|green|blue|yellow|orange|purple|pink)\b/i;

export const REDUNDANT_ALT_PREFIX = /^\s*(image|picture|photo|graphic|icon|screenshot)\s+(of|showing)\s+/i;
/** Alt text naming an image whose details rarely fit in alt text (WCAG G74).
 *  Whole words only: "graphic", "photograph" and "roadmap" are not charts. */
export const COMPLEX_IMAGE = /\b(chart|graph|diagram|map|infographic|flowchart|schematic)s?\b/i;
/** Alt text that already points to a long description nearby (G74's own
 *  instruction): "details below", "described in the text". A bare "below" is
 *  not enough: "Map of parcels below the dam" still needs asking.
 *  ponytail: a few phrasings; widen when an author's pointer ("see the table
 *  that follows") goes unrecognised. */
export const DESCRIPTION_POINTER = /\b(described|(details|description|see)\s+below)\b/i;

/** What the spike's `text(node)` did to extracted text. */
export const collapseSpaces = (s: string): string => s.replace(/\s+/g, ' ').trim();

export const syllables = (word: string): number => {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
};

/** Flesch-Kincaid grade level; null when the passage is too short to grade. */
export const gradeLevel = (prose: string): number | null => {
  const sentences = prose.split(/[.!?]+\s/).filter((s) => s.trim().length > 12);
  const words = prose.split(/\s+/).filter((w) => /[a-z]/i.test(w));
  if (sentences.length === 0 || words.length < 25) return null;
  const sylls = words.reduce((sum, w) => sum + syllables(w), 0);
  return 0.39 * (words.length / sentences.length) + 11.8 * (sylls / words.length) - 15.59;
};

export interface SentenceSpan {
  /** Index of the sentence's first character in the input. */
  from: number;
  /** Index one past its terminator (exclusive). */
  to: number;
}

/**
 * Sentence boundaries as index spans, so callers can map a flagged sentence
 * back to a document range.
 *
 * Lookbehind-free equivalent of the spike's terminator-lookbehind split: a
 * sentence ends at a `.`, `!` or `?` followed by whitespace or end of text.
 */
export function sentenceSpans(text: string): SentenceSpan[] {
  const spans: SentenceSpan[] = [];
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if ((ch === '.' || ch === '!' || ch === '?') && (next === undefined || /\s/.test(next))) {
      spans.push({ from: start, to: i + 1 });
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j]!)) j++;
      start = j;
      i = j;
      continue;
    }
    i++;
  }
  if (start < text.length) spans.push({ from: start, to: text.length });
  return spans;
}
