/**
 * The real WCAG rules, ported from the validated spike (scripts/spike/rules.mjs)
 * to walk the live ProseMirror doc instead of a DOM. Rule bodies are mechanical
 * ports — same thresholds, severities, titles and explanations; only the
 * traversal layer changed (querySelectorAll → PM node walks), which is what
 * gives exact from/to positions in the coordinate space Issue already requires.
 *
 * One of the spike's 13 rules is deliberately absent (§5 of
 * docs/audit/checking-engine-plan.md): `table-no-header` (the schema has no
 * table node). The spike's `document-language` ("no language declared")
 * can't happen here: every document has a language (the doc node's `lang`,
 * English by default). The engine's `document-language` instead checks the
 * declared language against the text.
 *
 * Rules that only understand English (word lists, English syllables, spaces
 * between words) run only when the document is English; see `summarizeBlock`.
 *
 * Six rules are engine-only, added after the port: `document-no-headings`
 * closes the gap `document-no-h1` leaves (a document with no headings at all),
 * and the parity gate (scripts/measure-engine.mjs) pins its one corpus firing;
 * `contrast-minimum` judges colour marks, which the Markdown corpus never has;
 * `form-blank` finds fill-in blanks, of which the corpus has none;
 * `img-long-description` asks whether a chart, map or diagram needs more than
 * its alt text, and the parity gate pins its three corpus firings;
 * `language-of-parts` finds unmarked passages in another language, and is
 * silent on the whole (English) corpus, names in other alphabets included;
 * `document-language` asks when most of a document reads as a language other
 * than the one it declares (silent on the corpus, which is English).
 *
 * One severity departs from the spike: `document-no-h1` is Advisory, not
 * violation, because its criterion (2.4.10) is AAA. Each rule now declares its
 * criterion's `level`, and verify-rules asserts no AAA rule ever grades a
 * finding "Blocks access" or "Fails AA". Do not re-sync severities from the spike.
 *
 * Shape: per-block rules run inside `summarizeBlock`, whose result check.ts
 * memoizes by node identity (a WeakMap — untouched blocks are reference-identical
 * across edits, so every unchanged paragraph is a cache hit). Cross-block rules
 * run over the collected summaries. All ranges from `summarizeBlock` are
 * relative to the block's inline content; cross-block findings carry absolute
 * doc positions, because only check.ts knows where blocks live.
 */
import type { Node as PMNode } from 'prosemirror-model';
import type { OpenSeverity } from '../../design-system/primitives/openSeverity';
import type { FindingFix } from '../_editor/findings';
import { schema } from '../_editor/editorSchema';
import {
  COLOUR_REFERENCE,
  COLOUR_WORDS,
  COMPLEX_IMAGE,
  DESCRIPTION_POINTER,
  GENERIC_LINK_TEXT,
  REDUNDANT_ALT_PREFIX,
  collapseSpaces,
  gradeLevel,
  languageName,
  languageRuns,
  primaryTag,
  sentenceSpans,
} from './textHelpers';
import { BODY_PX, HEADING_PX, LINK_TEXT, PAGE_BACKGROUND, PAGE_TEXT, contrastRatio, hexOf, parseColour } from './contrast';
import type { RGB } from './contrast';

const FIGURE = schema.nodes.figure!;
const PARAGRAPH = schema.nodes.paragraph!;
const HEADING = schema.nodes.heading!;
const LINK = schema.marks.link!;
const TEXT_COLOR = schema.marks.textColor!;
const HIGHLIGHT = schema.marks.highlight!;
const FONT_SIZE = schema.marks.fontSize!;
const STRONG = schema.marks.strong!;
const UNDERLINE = schema.marks.underline!;
const LANG = schema.marks.lang!;

export type RuleKind = 'structural' | 'prose';

export interface RuleInfo {
  id: string;
  criterion: string;
  /** structural rules run live per keystroke; prose rules only on blur/Recheck (§8.1). */
  kind: RuleKind;
  /**
   * The criterion's WCAG conformance level. An AAA rule may only emit advisory
   * or manual findings: the product targets AA, and the severity scale grades
   * AAA as Advisory (verified in scripts/verify-rules.mjs).
   */
  level: 'A' | 'AA' | 'AAA';
}

export const RULES: readonly RuleInfo[] = [
  { id: 'img-alt-missing', criterion: '1.1.1 Non-text Content', level: 'A', kind: 'structural' },
  { id: 'img-alt-suspicious', criterion: '1.1.1 Non-text Content', level: 'A', kind: 'structural' },
  { id: 'img-long-description', criterion: '1.1.1 Non-text Content', level: 'A', kind: 'structural' },
  { id: 'link-text-generic', criterion: '2.4.4 Link Purpose (In Context)', level: 'A', kind: 'structural' },
  { id: 'link-text-raw-url', criterion: '2.4.4 Link Purpose (In Context)', level: 'A', kind: 'structural' },
  { id: 'link-text-ambiguous', criterion: '2.4.4 Link Purpose (In Context)', level: 'A', kind: 'structural' },
  { id: 'heading-skip', criterion: '1.3.1 Info and Relationships', level: 'A', kind: 'structural' },
  { id: 'heading-empty', criterion: '1.3.1 Info and Relationships', level: 'A', kind: 'structural' },
  { id: 'document-no-h1', criterion: '2.4.10 Section Headings', level: 'AAA', kind: 'structural' },
  { id: 'colour-only-reference', criterion: '1.4.1 Use of Color', level: 'A', kind: 'prose' },
  { id: 'reading-level', criterion: '3.1.5 Reading Level', level: 'AAA', kind: 'prose' },
  { id: 'long-sentence', criterion: '3.1.5 Reading Level', level: 'AAA', kind: 'prose' },
  { id: 'language-of-parts', criterion: '3.1.2 Language of Parts', level: 'AA', kind: 'prose' },
  { id: 'document-language', criterion: '3.1.1 Language of Page', level: 'A', kind: 'prose' },
  // Structural, not prose-gated: it must retract the moment a heading is added
  // (prose findings are carried across structural runs until blur).
  { id: 'document-no-headings', criterion: '1.3.1 Info and Relationships', level: 'A', kind: 'structural' },
  // Engine-only (the spike ran on Markdown, which carries no colours).
  { id: 'contrast-minimum', criterion: '1.4.3 Contrast (Minimum)', level: 'AA', kind: 'structural' },
  // Engine-only. Manual: a blank only fails if the document must be filled in
  // digitally, which only its author knows.
  { id: 'form-blank', criterion: '1.3.1 Info and Relationships', level: 'A', kind: 'structural' },
];

export const PROSE_RULE_IDS: ReadonlySet<string> = new Set(
  RULES.filter((r) => r.kind === 'prose').map((r) => r.id),
);

const CRITERION: Readonly<Record<string, string>> = Object.fromEntries(
  RULES.map((r) => [r.id, r.criterion]),
);
const crit = (ruleId: string) => CRITERION[ruleId] ?? '';

/** Where a raw finding points, before check.ts maps it onto an Anchor. */
export type RawAnchor =
  /** Offsets into the block's inline content (check.ts adds the block's pos + 1). */
  | { kind: 'blockRange'; from: number; to: number }
  /** Absolute document positions (cross-block rules already know them). */
  | { kind: 'docRange'; from: number; to: number }
  | { kind: 'figure'; figureId: string }
  | { kind: 'document' };

export interface RawFinding {
  ruleId: string;
  severity: OpenSeverity;
  criterion: string;
  title: string;
  explanation: string;
  /** The full flagged text, whitespace-collapsed. check.ts derives the stable id
   *  from this and truncates it for the card's excerpt. */
  snippet: string;
  /** What the diff shows struck through, when that isn't the snippet itself
   *  (heading-skip flags the heading's text but fixes its level). */
  original?: string;
  hint: string;
  fix?: FindingFix;
  anchor: RawAnchor;
}

// ponytail: two ADJACENT links sharing an href read as one link — PM coalesces
// identical-mark text, so they are the same node sequence as one link split by
// formatting (a data-model ceiling; §9.9 requires the merge). Upgrade: give the
// link mark an id attr once a real document has adjacent same-href links that
// must be flagged separately.
/** A contiguous run of text carrying the same link href (§9.9: merge on the
 *  link mark + href, never on full mark-set equality — "click **here**" is one
 *  link split across two text nodes with different complete mark sets). */
export interface LinkRun {
  text: string;
  href: string;
  /** Block-relative inline offsets. */
  from: number;
  to: number;
}

export interface BlockSummary {
  /** Whitespace-collapsed inline text ('' for figures). */
  text: string;
  headingLevel: number | null;
  links: LinkRun[];
  figure: { id: string; alt: string; label: string } | null;
  /** Fill-in blanks (form-blank), block-relative, in order. */
  blanks: { from: number; to: number }[];
  /** Per-block rule results, with blockRange/figure anchors. */
  findings: RawFinding[];
  /** Unmarked passages in a language other than the document's, block-relative. */
  languageRuns: { from: number; to: number; lang: string; snippet: string; letters: number }[];
  /** Letters in the block's text, for the document-language share. */
  letters: number;
}

/** One summarized block plus where it lives. Assembled by check.ts's walk. */
export interface BlockEntry {
  pos: number;
  contentSize: number;
  summary: BlockSummary;
}

/** Blocks the engine summarizes: textblocks and figures (the only atom block). */
export const isCheckableBlock = (node: PMNode): boolean =>
  node.isTextblock || node.type === FIGURE;

/* ---------- block text with offset mapping ---------- */

/**
 * The block's collapsed text plus a map from collapsed-string index to the
 * block-relative document offset of that character. Prose rules analyze the
 * collapsed text (what the spike's `text(node)` produced); flagged ranges need
 * real document offsets, and whitespace collapsing shifts them.
 */
function blockChars(node: PMNode): { text: string; offsets: number[] } {
  let text = '';
  const offsets: number[] = [];
  let pos = 0;
  node.content.forEach((child) => {
    const raw = child.text ?? ''; // hard breaks and other leaf inlines contribute no characters
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i]!;
      if (/\s/.test(ch)) {
        // Collapse whitespace runs to a single space, mapped to the run's start.
        if (text.length > 0 && !text.endsWith(' ')) {
          text += ' ';
          offsets.push(pos + i);
        }
      } else {
        text += ch;
        offsets.push(pos + i);
      }
    }
    pos += child.nodeSize;
  });
  if (text.endsWith(' ')) {
    text = text.slice(0, -1);
    offsets.pop();
  }
  return { text, offsets };
}

/* ---------- link runs ---------- */

/**
 * Consecutive inline children whose keys are `same` merge into one run, with
 * block-relative offsets; a child keyed null ends the current run. Shared by
 * link runs (by href), contrast runs (by failing colours) and underlined
 * blanks, which all need "text split by other formatting is still one thing".
 */
function runsBy<T>(node: PMNode, keyOf: (child: PMNode) => T | null, same: (a: T, b: T) => boolean): { key: T; text: string; from: number; to: number }[] {
  const runs: { key: T; text: string; from: number; to: number }[] = [];
  let offset = 0;
  let current: { key: T; text: string; from: number; to: number } | null = null;
  node.content.forEach((child) => {
    const key = keyOf(child);
    if (key !== null && current && same(current.key, key)) {
      current.text += child.text ?? '';
      current.to = offset + child.nodeSize;
    } else {
      current = key !== null ? { key, text: child.text ?? '', from: offset, to: offset + child.nodeSize } : null;
      if (current) runs.push(current);
    }
    offset += child.nodeSize;
  });
  return runs;
}

function linkRuns(node: PMNode): LinkRun[] {
  return runsBy(node, (child) => {
    const mark = LINK.isInSet(child.marks);
    return mark ? String(mark.attrs.href ?? '') : null;
  }, (a, b) => a === b).map((r) => ({ text: r.text, href: r.key, from: r.from, to: r.to }));
}

/* ---------- contrast ---------- */

/** What the exported page renders when a mark is absent (pinned by its stylesheet). */
const DEFAULT_FG = parseColour(PAGE_TEXT)!;
const DEFAULT_BG = parseColour(PAGE_BACKGROUND)!;
const DEFAULT_LINK = parseColour(LINK_TEXT)!;
/** Two decimals, rounded DOWN: 4.497 must not read as "4.50:1" on a card that says it fails 4.5:1. */
const floor2 = (n: number) => (Math.floor(n * 100) / 100).toFixed(2);

interface ContrastRun { key: string; text: string; from: number; to: number; fg: RGB; bg: RGB; ratio: number; need: number }

/**
 * contrast-minimum (SC 1.4.3): text whose colours fall below 4.5:1, or 3:1 for
 * large text (24px, or 18.66px bold). Only text carrying a colour mark is
 * judged; default text on the default page passes by definition. Consecutive
 * text nodes with the same failing colours merge into one finding, so text
 * split by bold or italic is flagged once.
 */
function contrastFindings(node: PMNode, headingLevel: number | null): RawFinding[] {
  const judge = (child: PMNode): Omit<ContrastRun, 'text' | 'from' | 'to'> | null => {
    const fgMark = TEXT_COLOR.isInSet(child.marks);
    const bgMark = HIGHLIGHT.isInSet(child.marks);
    if (!fgMark && !bgMark) return null;
    const fg = fgMark ? parseColour(String(fgMark.attrs.color ?? '')) : LINK.isInSet(child.marks) ? DEFAULT_LINK : DEFAULT_FG;
    const bg = bgMark ? parseColour(String(bgMark.attrs.color ?? '')) : DEFAULT_BG;
    if (!fg || !bg) return null; // a colour we can't read is not judged
    const sizeMark = FONT_SIZE.isInSet(child.marks);
    const px = sizeMark ? Number(sizeMark.attrs.size) : headingLevel ? HEADING_PX[headingLevel] ?? BODY_PX : BODY_PX;
    const bold = headingLevel !== null || !!STRONG.isInSet(child.marks);
    const need = px >= 24 || (bold && px >= 18.66) ? 3 : 4.5;
    const ratio = contrastRatio(fg, bg);
    if (ratio >= need) return null;
    return { key: `${hexOf(fg)}|${hexOf(bg)}|${need}`, fg, bg, ratio, need };
  };

  const runs: ContrastRun[] = runsBy(node, (child) => (child.isText ? judge(child) : null), (a, b) => a.key === b.key)
    .map((r) => ({ ...r.key, text: r.text, from: r.from, to: r.to }));

  // A coloured space or tab has nothing to read: SC 1.4.3 is about text.
  return runs.filter((r) => r.text.trim() !== '').map((r) => ({
    ruleId: 'contrast-minimum',
    severity: 'violation',
    criterion: crit('contrast-minimum'),
    title: `Text contrast is below ${r.need}:1`,
    explanation: `${hexOf(r.fg)} on ${hexOf(r.bg)} is ${floor2(r.ratio)}:1. ${r.need === 3 ? 'Large text' : 'Text this size'} needs at least ${r.need}:1 to be readable for people with low vision.`,
    snippet: collapseSpaces(r.text),
    original: `${hexOf(r.fg)} on ${hexOf(r.bg)}`,
    hint: 'Use default colours',
    fix: { kind: 'defaultColours' },
    anchor: { kind: 'blockRange', from: r.from, to: r.to },
  }));
}

/* ---------- fill-in blanks ---------- */

/**
 * Typed blanks: underscore lines (also signature lines and __/__/____ dates),
 * empty-box glyphs, and "[ ]" (a space required: the corpus has bare "[]" in
 * link references and type names).
 *
 * ponytail: not flagged — checked boxes (answered, or decorative), dotted
 * leaders (they collide with ellipses and table-of-contents text), "( )", and
 * Word's placeholder phrases (kept language-neutral). Upgrade trigger: a real
 * form whose blanks use one of these.
 */
const BLANK_TEXT = /[_\uFF3F]{3,}|[\u2610\u2751\u25A1\u25FB]|\[ {1,3}\]/g;

function formBlanks(node: PMNode, text: string, offsets: number[]): { from: number; to: number }[] {
  const found: { from: number; to: number }[] = [];
  for (const m of text.matchAll(BLANK_TEXT)) {
    const start = m.index ?? 0;
    // Underscores with a letter or digit on BOTH sides are an identifier
    // (MAX___RETRIES), not a blank; "Name____" still counts.
    const before = text[start - 1] ?? '';
    const after = text[start + m[0].length] ?? '';
    if (/[_\uFF3F]/.test(m[0][0]!) && /[A-Za-z0-9]/.test(before) && /[A-Za-z0-9]/.test(after)) continue;
    const from = offsets[start];
    const last = offsets[start + m[0].length - 1];
    if (from !== undefined && last !== undefined) found.push({ from, to: last + 1 });
  }
  // An underlined stretch with nothing in it: Word's underlined-tab blank (the
  // importer keeps that tab), an underlined empty text field, or typed
  // underlined spaces. Consecutive underlined text merges first, so the space in
  // an all-underlined "**foo** _bar_" belongs to a run that has words; and one
  // stray underlined space is not a blank.
  for (const r of runsBy(node, (child) => (child.isText && UNDERLINE.isInSet(child.marks) ? true : null), () => true)) {
    if (r.text.trim() === '' && (r.text.includes('\t') || r.text.length >= 3)) found.push({ from: r.from, to: r.to });
  }
  // One blank to the eye is one blank: touching or overlapping ranges merge
  // ("Name: ____" followed by underlined spaces).
  found.sort((a, b) => a.from - b.from);
  const blanks: { from: number; to: number }[] = [];
  for (const b of found) {
    const prev = blanks.at(-1);
    if (prev && b.from <= prev.to) prev.to = Math.max(prev.to, b.to);
    else blanks.push({ ...b });
  }
  return blanks;
}

/* ---------- per-block rules ---------- */

/**
 * `pageLang` is the document's language: check.ts memoizes per language. The
 * rules that only understand English skip other documents.
 * ponytail: ceiling = English word lists and English syllables; upgrade
 * trigger: an author of a non-English document asks for plain-language or
 * wording checks in their language.
 */
export function summarizeBlock(node: PMNode, pageLang = 'en'): BlockSummary {
  const findings: RawFinding[] = [];
  const english = primaryTag(pageLang) === 'en';

  if (node.type === FIGURE) {
    const id = String(node.attrs.id ?? '');
    const alt = String(node.attrs.alt ?? '');
    const label = String(node.attrs.label ?? '') || 'image';
    if (alt.trim() === '') {
      // The schema has no alt-less figure (attrs.alt defaults to ''), so the
      // spike's "explicit empty alt is a manual decorative marker" case does
      // not exist here: an empty alt is a missing alt, matching the editor's
      // existing imageFinding behavior.
      findings.push({
        ruleId: 'img-alt-missing',
        severity: 'blocker',
        criterion: crit('img-alt-missing'),
        title: 'Image has no alternative text',
        explanation: `Screen readers will announce nothing for this ${label}, so its content is unavailable.`,
        snippet: label,
        hint: 'Add a description',
        anchor: { kind: 'figure', figureId: id },
      });
    } else {
      const trimmed = alt.trim();
      if (english && REDUNDANT_ALT_PREFIX.test(trimmed)) {
        findings.push({
          ruleId: 'img-alt-suspicious',
          severity: 'advisory',
          criterion: crit('img-alt-suspicious'),
          title: 'Alternative text repeats that it is an image',
          explanation: 'Screen readers already announce the element as an image, so the prefix is read twice.',
          snippet: trimmed,
          hint: 'Remove the prefix',
          // Mechanical and safe: strip the prefix.
          fix: { kind: 'figureAlt', alt: trimmed.replace(REDUNDANT_ALT_PREFIX, '') },
          anchor: { kind: 'figure', figureId: id },
        });
      } else {
        const looksLikeFilename = /\.(png|jpe?g|gif|svg|webp)$/i.test(trimmed) || /^[\w-]+_[\w-]+$/.test(trimmed);
        // Word count by spaces: a good five-character Chinese alt is one "word".
        const tooTerse = english && trimmed.split(/\s+/).length < 2 && trimmed.length < 12;
        if (looksLikeFilename || tooTerse) {
          findings.push({
            ruleId: 'img-alt-suspicious',
            severity: 'manual',
            criterion: crit('img-alt-suspicious'),
            title: 'Alternative text may not describe the image',
            explanation: `"${trimmed}" may not convey what the image shows. Only you can tell.`,
            snippet: trimmed,
            hint: 'Confirm it describes the image',
            anchor: { kind: 'figure', figureId: id },
          });
        } else if (english && COMPLEX_IMAGE.test(trimmed) && !DESCRIPTION_POINTER.test(trimmed)) {
          // Last in the chain on purpose: one alt-text question per image at a
          // time, so "map" is asked "does this describe it?" first. Alt text
          // that already says "details below" has answered the question.
          // ponytail: ceiling = the alt must name the kind of image. The .docx
          // importer already recognises Word's native charts and SmartArt
          // (PICTURE_TAGS) but figures don't store it; upgrade when an imported
          // chart's alt text doesn't say "chart".
          findings.push({
            ruleId: 'img-long-description',
            severity: 'manual',
            criterion: crit('img-long-description'),
            title: `Does this ${label} need a long description?`,
            explanation:
              'Alt text can name a chart, map or diagram but can’t carry its data, routes or trends. ' +
              'If readers need those details, describe them in a paragraph or table next to the image, ' +
              'and mention it in the alt text (for example, “details below”).',
            snippet: trimmed,
            hint: 'Decide on a long description',
            anchor: { kind: 'figure', figureId: id },
          });
        }
      }
    }
    return { text: '', headingLevel: null, links: [], figure: { id, alt, label }, blanks: [], findings, languageRuns: [], letters: 0 };
  }

  const { text, offsets } = blockChars(node);
  const links = linkRuns(node);
  const headingLevel = node.type === HEADING ? (node.attrs.level as number) : null;

  for (const run of links) {
    const label = collapseSpaces(run.text);
    const key = label.toLowerCase().replace(/[.!?:]+$/, '');
    if (english && key && GENERIC_LINK_TEXT.has(key)) {
      findings.push({
        ruleId: 'link-text-generic',
        severity: 'violation',
        criterion: crit('link-text-generic'),
        title: 'Link text is not meaningful out of context',
        explanation: `"${label}" tells a user navigating by links nothing about the destination.`,
        // No fix: naming the destination needs a human who knows it.
        snippet: label,
        hint: 'Rewrite the link text',
        anchor: { kind: 'blockRange', from: run.from, to: run.to },
      });
    }
    if (/^https?:\/\//i.test(label) && label.length >= 25) {
      findings.push({
        ruleId: 'link-text-raw-url',
        severity: 'violation',
        criterion: crit('link-text-raw-url'),
        title: 'Link text is a raw URL',
        explanation: 'A screen reader reads the URL character by character. Give the link a human label.',
        snippet: label,
        hint: 'Give the link a label',
        anchor: { kind: 'blockRange', from: run.from, to: run.to },
      });
    }
  }

  if (headingLevel !== null && text === '') {
    findings.push({
      ruleId: 'heading-empty',
      severity: 'blocker',
      criterion: crit('heading-empty'),
      title: 'Heading is empty',
      explanation: 'An empty heading is announced as a heading with nothing in it.',
      snippet: '',
      hint: 'Add text or remove the heading',
      anchor: { kind: 'blockRange', from: 0, to: 0 },
    });
  }

  // The spike's prose heuristics (colour, grade, sentence length) apply to
  // paragraphs only (it graded <p>/<li>; list items hold paragraphs in this
  // schema), and only understand English; language of parts also reads
  // headings, below. All prose rules are gated to blur/Recheck by check.ts's
  // callers so they never flag a sentence still being typed.
  if (english && node.type === PARAGRAPH) {
    if (COLOUR_WORDS.test(text) && COLOUR_REFERENCE.test(text)) {
      findings.push({
        ruleId: 'colour-only-reference',
        severity: 'manual',
        criterion: crit('colour-only-reference'),
        title: 'Instruction may rely on colour alone',
        explanation: 'If colour is the only way to identify what this refers to, readers who cannot perceive it are excluded.',
        snippet: text,
        hint: 'Say it in words too',
        anchor: { kind: 'blockRange', from: 0, to: node.content.size },
      });
    }
    const grade = gradeLevel(text);
    if (grade !== null && grade > 12) {
      findings.push({
        ruleId: 'reading-level',
        severity: 'advisory',
        criterion: crit('reading-level'),
        title: `Passage reads at about grade ${Math.round(grade)}`,
        explanation: 'Plain language helps every reader, and is required of much public-sector writing.',
        snippet: text,
        hint: 'Simplify the passage',
        anchor: { kind: 'blockRange', from: 0, to: node.content.size },
      });
    }
    for (const span of sentenceSpans(text)) {
      const sentence = text.slice(span.from, span.to);
      const words = sentence.split(/\s+/).filter(Boolean).length;
      if (words <= 35) continue;
      const from = offsets[span.from] ?? span.from;
      const lastOffset = offsets[span.to - 1];
      const to = lastOffset === undefined ? node.content.size : lastOffset + 1;
      findings.push({
        ruleId: 'long-sentence',
        severity: 'advisory',
        criterion: crit('long-sentence'),
        title: `Sentence runs to ${words} words`,
        explanation: 'Long sentences are harder to follow, especially when heard rather than read.',
        snippet: sentence,
        hint: 'Shorten the sentence',
        anchor: { kind: 'blockRange', from, to },
      });
    }
  }
  findings.push(...contrastFindings(node, headingLevel));

  // Language also reads headings: "Ayuda en español" is a heading screen
  // readers announce with the document's pronunciation too.
  const languages = node.type === PARAGRAPH || node.type === HEADING ? foreignRuns(node, text, offsets, pageLang) : [];
  return {
    text, headingLevel, links, figure: null, blanks: formBlanks(node, text, offsets), findings,
    languageRuns: languages, letters: letterTotal(text),
  };
}

const letterTotal = (s: string): number => s.match(/\p{L}/gu)?.length ?? 0;

/**
 * Passages of a paragraph or heading that read as a language other than the
 * document's and aren't marked as one, block-relative. Marked text is blanked
 * before detection, so a marked passage is never flagged and a partly marked
 * one is judged only on what's left.
 */
function foreignRuns(node: PMNode, text: string, offsets: number[], pageLang: string): BlockSummary['languageRuns'] {
  const marked = runsBy(node, (child) => (LANG.isInSet(child.marks) ? true : null), () => true);
  let open = text;
  if (marked.length > 0) {
    open = '';
    for (let i = 0; i < text.length; i++) {
      const at = offsets[i]!;
      open += marked.some((r) => at >= r.from && at < r.to) ? ' ' : text[i];
    }
  }
  return languageRuns(open, pageLang).map((run) => {
    const lastOffset = offsets[run.to - 1];
    const snippet = text.slice(run.from, run.to);
    return {
      from: offsets[run.from] ?? run.from,
      to: lastOffset === undefined ? node.content.size : lastOffset + 1,
      lang: run.lang,
      snippet,
      letters: letterTotal(snippet),
    };
  });
}

/** Enough text in one language to say what the document is written in. */
const DOCUMENT_LANGUAGE_MIN_LETTERS = 80;

/**
 * Language of page (3.1.1) and of parts (3.1.2). When unmarked text in one
 * other language makes up two thirds of the document's letters (marked text
 * counts toward the whole: the author's marks stand), the declared language is
 * what's wrong: one document-level question, and that language's passages
 * aren't listed one by one. A bilingual notice (half and half) is not
 * "mostly" anything: its passages are what to mark. Everything else unmarked is a passage question.
 * Both are Needs your call: the guess comes from common words and alphabets,
 * and names and borrowed words need no marking.
 */
function languageFindings(entries: readonly BlockEntry[], pageLang: string): RawFinding[] {
  const out: RawFinding[] = [];
  const pageName = languageName(pageLang);
  let letters = 0;
  const byLanguage = new Map<string, number>();
  for (const e of entries) {
    letters += e.summary.letters;
    for (const r of e.summary.languageRuns) {
      if (r.lang !== 'unknown') byLanguage.set(r.lang, (byLanguage.get(r.lang) ?? 0) + r.letters);
    }
  }
  const [top] = [...byLanguage].sort((a, b) => b[1] - a[1]);
  const majority = top && top[1] >= DOCUMENT_LANGUAGE_MIN_LETTERS && top[1] * 3 >= letters * 2 ? top[0] : null;
  if (majority) {
    const name = languageName(majority);
    out.push({
      ruleId: 'document-language',
      severity: 'manual',
      criterion: crit('document-language'),
      title: `Document language is ${pageName}, but most of it reads as ${name}`,
      explanation:
        `Screen readers read the whole document with ${pageName} pronunciation. ` +
        `If it is written in ${name}, set the document language to ${name}.`,
      snippet: '',
      hint: 'Set the document language',
      fix: { kind: 'docLang', lang: majority },
      anchor: { kind: 'document' },
    });
  }
  for (const e of entries) {
    for (const r of e.summary.languageRuns) {
      if (r.lang === majority) continue;
      const known = r.lang !== 'unknown';
      const name = known ? languageName(r.lang) : 'another language';
      out.push({
        ruleId: 'language-of-parts',
        severity: 'manual',
        criterion: crit('language-of-parts'),
        title: `Text may be in ${name} but isn’t marked`,
        explanation:
          `Screen readers will read it with ${pageName} pronunciation, which can make it impossible to understand. ` +
          (known
            ? `If it is ${name}, mark it so screen readers switch voice.`
            : 'If it is, select it and choose its language from the toolbar.') +
          ` Names and words borrowed into ${pageName} don’t need marking.`,
        snippet: r.snippet,
        hint: 'Mark the language',
        ...(known ? { fix: { kind: 'lang', lang: r.lang } as const } : {}),
        anchor: { kind: 'docRange', from: e.pos + 1 + r.from, to: e.pos + 1 + r.to },
      });
    }
  }
  return out;
}

/* ---------- cross-block rules ---------- */

/** `pageLang` is the document's language, for the language rules. */
export function crossBlockFindings(entries: readonly BlockEntry[], pageLang = 'en'): RawFinding[] {
  const out: RawFinding[] = languageFindings(entries, pageLang);

  // heading-skip
  let previous = 0;
  for (const e of entries) {
    const level = e.summary.headingLevel;
    if (level === null) continue;
    if (previous && level > previous + 1) {
      out.push({
        ruleId: 'heading-skip',
        severity: 'violation',
        criterion: crit('heading-skip'),
        title: `Heading level jumps from h${previous} to h${level}`,
        explanation: 'Users navigating by heading rely on the levels describing the real structure.',
        // The heading's own text, so the id — and any dismissal — belongs to
        // this heading, not to every heading that ever skips to this level.
        snippet: e.summary.text || `h${level}`,
        original: `h${level}`,
        hint: 'Fix the heading level',
        // Mechanical: the only correct level is one below its parent.
        fix: { kind: 'headingLevel', level: previous + 1 },
        anchor: { kind: 'docRange', from: e.pos + 1, to: e.pos + 1 + e.contentSize },
      });
    }
    previous = level;
  }

  // document-no-h1 (and the counts document-no-headings reads)
  let headings = 0;
  let hasH1 = false;
  let textBlocks = 0;
  for (const e of entries) {
    if (e.summary.figure === null && e.summary.text !== '') textBlocks++;
    if (e.summary.headingLevel === null) continue;
    headings++;
    if (e.summary.headingLevel === 1) hasH1 = true;
  }
  if (headings > 0 && !hasH1) {
    out.push({
      ruleId: 'document-no-h1',
      // 2.4.10 Section Headings is AAA, and the severity scale grades AAA as
      // Advisory; "Fails AA" overstated it. The spike still says violation;
      // the parity gate compares counts and text, not severity.
      severity: 'advisory',
      criterion: crit('document-no-h1'),
      title: 'Document has no top-level heading',
      explanation: 'There is no h1, so the document has no stated title in its structure.',
      snippet: '',
      hint: 'Add a top-level heading',
      anchor: { kind: 'document' },
    });
  }

  // document-no-headings: the gap document-no-h1 leaves (it needs at least one
  // heading). No headings is not itself an AA failure (1.3.1 fails only when
  // visual headings are not marked up; requiring headings is 2.4.10, AAA), so
  // a person decides whether the document has sections.
  // ponytail: "several blocks" is a fixed count of non-empty text blocks.
  // Upgrade trigger: false positives on real letters — weigh length in words,
  // or pair it with detecting bold lines that act as headings.
  const NO_HEADINGS_MIN_BLOCKS = 5;
  if (headings === 0 && textBlocks >= NO_HEADINGS_MIN_BLOCKS) {
    out.push({
      ruleId: 'document-no-headings',
      severity: 'manual',
      criterion: crit('document-no-headings'),
      title: 'Document has no headings',
      explanation: 'Screen reader users move through a document by its headings; with none, they can only read it from top to bottom. If it has sections, or lines that work as headings (such as short bold lines that introduce a section), mark them as headings.',
      snippet: '',
      hint: 'Mark section headings',
      anchor: { kind: 'document' },
    });
  }

  // form-blank: one question per document, not one card per blank — how the
  // document will be filled in is a single decision. Anchored at the first blank.
  // ponytail: only the first blank is decorated. Upgrade trigger: users asking
  // to step through every blank.
  let blankCount = 0;
  let firstBlank: { entry: BlockEntry; from: number; to: number } | null = null;
  for (const e of entries) {
    if (!e.summary.blanks.length) continue;
    blankCount += e.summary.blanks.length;
    firstBlank ??= { entry: e, ...e.summary.blanks[0]! };
  }
  if (firstBlank) {
    out.push({
      ruleId: 'form-blank',
      severity: 'manual',
      criterion: crit('form-blank'),
      title: `Document has ${blankCount} fill-in blank${blankCount === 1 ? '' : 's'}`,
      explanation: 'Screen readers announce a blank as a run of underscores, or not at all, and it cannot be filled in on screen. If people must complete this digitally, it needs real labelled form fields in the final file. If it is for printing, say so near the form and offer an accessible way to respond, such as a phone number or email address.',
      snippet: '',
      hint: 'Decide how it will be filled in',
      anchor: { kind: 'docRange', from: firstBlank.entry.pos + 1 + firstBlank.from, to: firstBlank.entry.pos + 1 + firstBlank.to },
    });
  }

  // link-text-ambiguous: the same label pointing at different destinations,
  // anchored at the label's first occurrence.
  const byLabel = new Map<string, { hrefs: Set<string>; first: { entry: BlockEntry; run: LinkRun } }>();
  for (const e of entries) {
    for (const run of e.summary.links) {
      const label = collapseSpaces(run.text).toLowerCase();
      if (!label || label.length < 3) continue;
      let record = byLabel.get(label);
      if (!record) {
        record = { hrefs: new Set<string>(), first: { entry: e, run } };
        byLabel.set(label, record);
      }
      record.hrefs.add(run.href);
    }
  }
  for (const [label, record] of byLabel) {
    if (record.hrefs.size < 2) continue;
    out.push({
      ruleId: 'link-text-ambiguous',
      severity: 'manual',
      criterion: crit('link-text-ambiguous'),
      title: 'Same link text points to different places',
      explanation: `"${label}" is used for ${record.hrefs.size} different destinations. Whether that is confusing depends on the surrounding text.`,
      snippet: label,
      hint: 'Check the repeated link text',
      anchor: {
        kind: 'docRange',
        from: record.first.entry.pos + 1 + record.first.run.from,
        to: record.first.entry.pos + 1 + record.first.run.to,
      },
    });
  }

  return out;
}
