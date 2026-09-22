/**
 * The real WCAG rules, ported from the validated spike (scripts/spike/rules.mjs)
 * to walk the live ProseMirror doc instead of a DOM. Rule bodies are mechanical
 * ports — same thresholds, severities, titles and explanations; only the
 * traversal layer changed (querySelectorAll → PM node walks), which is what
 * gives exact from/to positions in the coordinate space Issue already requires.
 *
 * Two of the spike's 13 rules are deliberately absent (§5 of
 * docs/audit/checking-engine-plan.md): `table-no-header` (the schema has no
 * table node) and `document-language` (no language field exists in the data
 * model; the spike itself flagged it as noise).
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
  GENERIC_LINK_TEXT,
  REDUNDANT_ALT_PREFIX,
  collapseSpaces,
  gradeLevel,
  sentenceSpans,
} from './textHelpers';

const FIGURE = schema.nodes.figure!;
const PARAGRAPH = schema.nodes.paragraph!;
const HEADING = schema.nodes.heading!;
const LINK = schema.marks.link!;

export type RuleKind = 'structural' | 'prose';

export interface RuleInfo {
  id: string;
  criterion: string;
  /** structural rules run live per keystroke; prose rules only on blur/Recheck (§8.1). */
  kind: RuleKind;
}

export const RULES: readonly RuleInfo[] = [
  { id: 'img-alt-missing', criterion: '1.1.1 Non-text Content', kind: 'structural' },
  { id: 'img-alt-suspicious', criterion: '1.1.1 Non-text Content', kind: 'structural' },
  { id: 'link-text-generic', criterion: '2.4.4 Link Purpose (In Context)', kind: 'structural' },
  { id: 'link-text-raw-url', criterion: '2.4.4 Link Purpose (In Context)', kind: 'structural' },
  { id: 'link-text-ambiguous', criterion: '2.4.4 Link Purpose (In Context)', kind: 'structural' },
  { id: 'heading-skip', criterion: '1.3.1 Info and Relationships', kind: 'structural' },
  { id: 'heading-empty', criterion: '1.3.1 Info and Relationships', kind: 'structural' },
  { id: 'document-no-h1', criterion: '2.4.10 Section Headings', kind: 'structural' },
  { id: 'colour-only-reference', criterion: '1.4.1 Use of Color', kind: 'prose' },
  { id: 'reading-level', criterion: '3.1.5 Reading Level', kind: 'prose' },
  { id: 'long-sentence', criterion: '3.1.5 Reading Level', kind: 'prose' },
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
  hint: string;
  fix?: FindingFix;
  anchor: RawAnchor;
}

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
  /** Per-block rule results, with blockRange/figure anchors. */
  findings: RawFinding[];
}

/** One summarized block plus where it lives. Assembled by check.ts's walk. */
export interface BlockEntry {
  pos: number;
  contentSize: number;
  summary: BlockSummary;
}

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

function linkRuns(node: PMNode): LinkRun[] {
  const runs: LinkRun[] = [];
  let offset = 0;
  let current: LinkRun | null = null;
  node.content.forEach((child) => {
    const mark = LINK.isInSet(child.marks);
    const href = mark ? String(mark.attrs.href ?? '') : null;
    if (href !== null) {
      if (current && current.href === href) {
        current.text += child.text ?? '';
        current.to = offset + child.nodeSize;
      } else {
        current = { text: child.text ?? '', href, from: offset, to: offset + child.nodeSize };
        runs.push(current);
      }
    } else {
      current = null;
    }
    offset += child.nodeSize;
  });
  return runs;
}

/* ---------- per-block rules ---------- */

export function summarizeBlock(node: PMNode): BlockSummary {
  const findings: RawFinding[] = [];

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
      if (REDUNDANT_ALT_PREFIX.test(trimmed)) {
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
        const tooTerse = trimmed.split(/\s+/).length < 2 && trimmed.length < 12;
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
        }
      }
    }
    return { text: '', headingLevel: null, links: [], figure: { id, alt, label }, findings };
  }

  const { text, offsets } = blockChars(node);
  const links = linkRuns(node);
  const headingLevel = node.type === HEADING ? (node.attrs.level as number) : null;

  for (const run of links) {
    const label = collapseSpaces(run.text);
    const key = label.toLowerCase().replace(/[.!?:]+$/, '');
    if (key && GENERIC_LINK_TEXT.has(key)) {
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

  // Prose-heuristic rules apply to paragraphs only (the spike graded <p>/<li>;
  // list items hold paragraphs in this schema), and are gated to blur/Recheck
  // by check.ts's callers so they never flag a sentence still being typed.
  if (node.type === PARAGRAPH) {
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

  return { text, headingLevel, links, figure: null, findings };
}

/* ---------- cross-block rules ---------- */

export function crossBlockFindings(entries: readonly BlockEntry[]): RawFinding[] {
  const out: RawFinding[] = [];

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
        snippet: `h${level}`,
        hint: 'Fix the heading level',
        // Mechanical: the only correct level is one below its parent.
        fix: { kind: 'headingLevel', level: previous + 1 },
        anchor: { kind: 'docRange', from: e.pos + 1, to: e.pos + 1 + e.contentSize },
      });
    }
    previous = level;
  }

  // document-no-h1
  let headings = 0;
  let hasH1 = false;
  for (const e of entries) {
    if (e.summary.headingLevel === null) continue;
    headings++;
    if (e.summary.headingLevel === 1) hasH1 = true;
  }
  if (headings > 0 && !hasH1) {
    out.push({
      ruleId: 'document-no-h1',
      severity: 'violation',
      criterion: crit('document-no-h1'),
      title: 'Document has no top-level heading',
      explanation: 'There is no h1, so the document has no stated title in its structure.',
      snippet: '',
      hint: 'Add a top-level heading',
      anchor: { kind: 'document' },
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
