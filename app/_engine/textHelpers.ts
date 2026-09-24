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

/* ---------- language of parts (WCAG 3.1.2) ---------- */

/** The 15 languages HHS requires taglines for (Section 1557 notices), in its
 *  order: the Language menu, and every language the detector can name. */
export const LANGUAGES: readonly { code: string; name: string }[] = [
  { code: 'es', name: 'Spanish' }, { code: 'zh', name: 'Chinese' }, { code: 'vi', name: 'Vietnamese' },
  { code: 'ko', name: 'Korean' }, { code: 'tl', name: 'Tagalog' }, { code: 'ru', name: 'Russian' },
  { code: 'ar', name: 'Arabic' }, { code: 'ht', name: 'Haitian Creole' }, { code: 'fr', name: 'French' },
  { code: 'pl', name: 'Polish' }, { code: 'pt', name: 'Portuguese' }, { code: 'it', name: 'Italian' },
  { code: 'de', name: 'German' }, { code: 'ja', name: 'Japanese' }, { code: 'fa', name: 'Persian' },
];

const primaryTag = (tag: string): string => tag.split('-')[0]!.toLowerCase();

/** "es-MX" → "Spanish"; a tag outside the list is shown as itself. */
export const languageName = (tag: string): string =>
  LANGUAGES.find((l) => l.code === primaryTag(tag))?.name ?? tag;

const LANG_TAG = /^[a-z]{2,3}(-[a-z0-9]{1,8})*$/i;
// English in its two- and three-letter forms, "undetermined" and "no linguistic content".
const NOT_FOREIGN: ReadonlySet<string> = new Set(['en', 'eng', 'und', 'zxx']);

/** A well-formed BCP 47 tag, English included. */
export const isLangTag = (tag: string): boolean => LANG_TAG.test(tag);

/**
 * A well-formed BCP 47 tag for a language other than the page's.
 * ponytail: every page is English (exportHtml sets lang="en"), so English is
 * never a change of language; compare with the document's own language once
 * documents have one (the deferred 3.1.1 work).
 */
export const isForeignLangTag = (tag: string): boolean =>
  LANG_TAG.test(tag) && !NOT_FOREIGN.has(primaryTag(tag));

const wordSet = (s: string): ReadonlySet<string> => new Set(s.split(' '));

// Common words, lower-cased. No list holds an English word ("son", "pour",
// "die", "per", "non", "ale", "pale" …), and name particles are ignored
// outright, so "Maria de la Cruz" or "Van der Berg" reads as nobody's language.
const ENGLISH = wordSet('the and of to is are was were be been for with that this it you your we our they their a an in on at as by from or not have has will can if which who what when there here would should may must does');
const NAME_PARTICLES = wordSet('de del la le du da di van von der den dos das do');
// ponytail: about 25–40 words per language, weighted toward the phrasing of
// language-assistance taglines. Upgrade trigger: a real passage the detector
// misses or misnames.
const LATIN: readonly [string, ReadonlySet<string>][] = [
  ['es', wordSet('el los las al y que en por para con un una uno unos es está están su se lo les más pero si sí como este esta estos estas usted ustedes puede tiene tienen llame ayuda información servicios gratuitos gratis idioma habla español atención disponible también cuando donde muy sobre entre asistencia lingüística disposición necesita')],
  ['fr', wordSet('les des un une et est sont dans avec vous nous sur pas qui que ce cette ces au aux ou mais votre vos être avez êtes français langue gratuit gratuitement appelez parlez à été il elle ils leur peut également disposition linguistique numéro si')],
  ['ht', wordSet('ou nan pou ak yo li se ki gen pa mwen nou sa sou kreyòl gratis rele èd sèvis disponib ka konn fè anpil lè kote avèk genyen moun atansyon si')],
  ['tl', wordSet('ang ng mga sa ay na ka ikaw kung nagsasalita maaari kang gumamit serbisyo tulong wika nang walang bayad tumawag ito para siya kami namin hindi po lamang paunawa')],
  ['pl', wordSet('się jest nie na że dla jak lub są być od po za przez jeśli jeżeli mówisz możesz skorzystać bezpłatnej pomocy językowej zadzwoń numer uwaga polsku oraz tak')],
  ['pt', wordSet('os um uma é em não que se por para mais você vocês está são seu sua na ao pelo pela ligue atenção português fala serviços gratuitos grátis assistência linguística disposição também muito disponíveis encontram')],
  ['it', wordSet('il gli una uno è con che sono della delle dei alla nel questo questa anche lei parla italiano disposizione servizi gratuiti assistenza linguistica chiamare numero più sia caso lingua parlata disponibili attenzione')],
  ['de', wordSet('und ist sind nicht für auf ein eine einen dem zu wenn oder auch ich wir ihr sich werden kann können bei nach über zur zum noch nur wie sprechen stehen kostenlos sprachliche hilfsdienstleistungen verfügung rufen achtung deutsch')],
  ['vi', wordSet('của và các là có không được cho bạn nếu tiếng việt những này người một với dịch vụ hỗ trợ ngôn ngữ miễn phí dành gọi số chú ý nói trong khi để đến về')],
];

interface Guess { lang: string; strong: boolean }

const letterCount = (s: string, re: RegExp): number => s.match(re)?.length ?? 0;

/**
 * What language one clause is in, or null for English or undecidable. `strong`
 * is enough to flag on its own; a weak guess (a word or two, like "ATENCIÓN"
 * or "Llame al 311") only joins a strong neighbour of the same language.
 */
function guessClause(clause: string): Guess | null {
  const letters = letterCount(clause, /\p{L}/gu);
  if (letters === 0) return null;
  // Other alphabets: a majority of the letters, and more than a name's worth
  // to stand alone (a name's worth may still join a passage beside it).
  const hangul = letterCount(clause, /\p{Script=Hangul}/gu);
  const kana = letterCount(clause, /[\p{Script=Hiragana}\p{Script=Katakana}]/gu);
  const cjk = hangul + kana + letterCount(clause, /\p{Script=Han}/gu);
  if (cjk * 2 >= letters) return { lang: hangul * 2 >= cjk ? 'ko' : kana > 0 ? 'ja' : 'zh', strong: cjk >= 6 };
  const cyrillic = clause.match(/\p{Script=Cyrillic}+/gu) ?? [];
  // A full Russian name is three capitalised words ("Сковорода Никита
  // Андреевич"); a sentence always has lower-case ones.
  const cyrillicLower = cyrillic.filter((w) => /^\p{Ll}/u.test(w)).length;
  if (cyrillic.join('').length * 2 >= letters) return { lang: 'ru', strong: cyrillic.length >= 3 && cyrillicLower >= 2 };
  const arabic = clause.match(/\p{Script=Arabic}+/gu) ?? [];
  if (arabic.join('').length * 2 >= letters) {
    // Persian writes پ چ ژ گ and its own kaf and yeh (ک ی); Arabic has none of them.
    // ponytail: the script has no capitals, so a name of three or more words
    // can pass as a sentence. Upgrade trigger: one does.
    return { lang: /[پچژگکی]/u.test(clause) ? 'fa' : 'ar', strong: arabic.length >= 3 };
  }
  // ponytail: Hebrew, Greek, Devanagari and other scripts outside the list are
  // not flagged. Upgrade trigger: a document carrying one of them.

  // Latin alphabet: count common words. A capitalised word after the first is
  // a name, so it counts for no language; handles, emails, URLs and
  // abbreviations ("ak239", "x@y.com", "e.g.", "et al.") are no language's words.
  const tokens = clause.replace(/\bet al\b/gi, ' ').split(/\s+/)
    .filter((chunk) => !/[\d@/]|\p{L}\.\p{L}/u.test(chunk))
    .flatMap((chunk) => chunk.match(/\p{L}+/gu) ?? []);
  let english = 0;
  const scores = new Map<string, number>();
  tokens.forEach((raw, i) => {
    if (i > 0 && /^\p{Lu}/u.test(raw)) return;
    const word = raw.toLowerCase();
    if (NAME_PARTICLES.has(word)) return;
    if (ENGLISH.has(word)) english++;
    for (const [lang, set] of LATIN) if (set.has(word)) scores.set(lang, (scores.get(lang) ?? 0) + 1);
  });
  const [best, next] = [...scores].sort((a, b) => b[1] - a[1]);
  if (!best || best[1] <= english) return null;
  const lang = next && next[1] === best[1] ? 'unknown' : best[0];
  if (tokens.length >= 3 && best[1] >= 2) return { lang, strong: true };
  // Weak is for a label or a fragment ("ATENCIÓN", "Llame al 311"), never a
  // sentence: "Los Angeles County provides free meals." must not join a
  // Spanish neighbour and be marked Spanish.
  return english === 0 && lang !== 'unknown' && tokens.length <= 3 ? { lang, strong: false } : null;
}

const CLAUSE_BREAK = /[:;()"“”«»—–]/;
const EDGE = /[\s\p{P}]/u;

export interface LanguageRun {
  from: number;
  to: number;
  /** A LANGUAGES code, or 'unknown' when two languages score alike. */
  lang: string;
}

/**
 * Passages of `text` that read as another language, as index spans. Clauses
 * (sentences split again at colons, dashes, brackets and quotes) are judged one
 * by one, so "Spanish-language help: Llame al 311 para ayuda." flags only the
 * Spanish; neighbouring clauses in the same language join into one passage.
 */
export function languageRuns(text: string): LanguageRun[] {
  const clauses: { from: number; to: number; guess: Guess | null }[] = [];
  const push = (from: number, to: number) => {
    while (from < to && EDGE.test(text[from]!)) from++;
    while (to > from && EDGE.test(text[to - 1]!)) to--;
    if (from < to) clauses.push({ from, to, guess: guessClause(text.slice(from, to)) });
  };
  for (const s of sentenceSpans(text)) {
    let start = s.from;
    for (let i = s.from; i < s.to; i++) {
      if (CLAUSE_BREAK.test(text[i]!)) {
        push(start, i);
        start = i + 1;
      }
    }
    push(start, s.to);
  }
  const runs: LanguageRun[] = [];
  let group: typeof clauses = [];
  const flush = () => {
    if (group.some((c) => c.guess!.strong)) {
      runs.push({ from: group[0]!.from, to: group.at(-1)!.to, lang: group[0]!.guess!.lang });
    }
    group = [];
  };
  for (const c of clauses) {
    if (!c.guess || (group.length > 0 && group[0]!.guess!.lang !== c.guess.lang)) flush();
    if (c.guess) group.push(c);
  }
  flush();
  return runs;
}
