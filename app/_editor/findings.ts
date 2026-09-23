// Direct module imports, not the primitives barrel: this module is bundled
// into the Node-side engine verification (scripts/verify-rules.mjs), and the
// barrel would drag React components and CSS along with it.
import { SEVERITY_RANK } from '../../design-system/primitives/severity';
import { OPEN_SEVERITIES } from '../../design-system/primitives/openSeverity';
import type { OpenSeverity } from '../../design-system/primitives/openSeverity';
import type { Issue } from '../../design-system/primitives/types';

export type Section = 'header' | 'footer';

/**
 * Where a finding lives. Only `text` findings have a meaningful document range
 * and get an inline underline; figures are addressed by id because their
 * position shifts, header/footer findings live outside the document, and
 * `document` findings (e.g. no top-level heading) belong to the document as a
 * whole — no range, no underline, nowhere to navigate to.
 */
export type Anchor =
  | { kind: 'text' }
  | { kind: 'figure'; figureId: string }
  | { kind: 'section'; section: Section }
  | { kind: 'document' };

/**
 * What "Apply fix" does. Absent (or `text`) means the suggestion string
 * replaces the from..to range; the attribute fixes exist because the two
 * machine-decidable rule fixes are not text replacements — applying them as
 * text would write a literal "h2" into a heading or replace a figure node
 * with its alt string.
 */
export type FindingFix =
  | { kind: 'text' }
  | { kind: 'headingLevel'; level: number }
  | { kind: 'figureAlt'; alt: string };

export interface EditorFinding extends Issue {
  severity: OpenSeverity;
  excerpt: string;
  hint: string;
  /** The flagged text as it was when checked, shown struck through beside the fix. */
  original?: string;
  anchor: Anchor;
  fix?: FindingFix;
}

export const sortFindings = (list: EditorFinding[]) =>
  [...list].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

/** Layer-3 summary from patterns-suggestion.md: counts only, manual last. */
export function summaryLine(list: EditorFinding[]): string {
  if (list.length === 0) return 'No open findings';
  const n = (s: OpenSeverity) => list.filter((f) => f.severity === s).length;
  const words: Record<OpenSeverity, (c: number) => string> = {
    blocker: (c) => `${c} blocking`,
    violation: (c) => `${c} failing AA`,
    advisory: (c) => `${c} advisory`,
    manual: (c) => `${c} ${c === 1 ? 'needs' : 'need'} your review`,
  };
  // Manual is always shown, even at zero: it is the number that decides whether
  // the document is finished.
  return OPEN_SEVERITIES.filter((s) => s === 'manual' || n(s) > 0).map((s) => words[s](n(s))).join(' · ');
}

export function imageFinding(imageId: string, label: string, anchor: Anchor, at = 0): EditorFinding {
  return {
    id: `img-alt-${imageId}`,
    severity: 'blocker',
    title: 'Image has no alternative text',
    explanation: `Screen readers will announce nothing for this ${label}, so residents using one will miss its content entirely.`,
    criterion: '1.1.1 Non-text Content',
    excerpt: label,
    hint: 'Add a description',
    from: at,
    to: anchor.kind === 'figure' ? at + 1 : at,
    anchor,
  };
}

