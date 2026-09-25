import type { Node as PMNode } from 'prosemirror-model';
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
 * replaces the from..to range; the other fixes exist because the
 * machine-decidable rule fixes are not text replacements — applying them as
 * text would write a literal "h2" into a heading, replace a figure node with
 * its alt string, or overwrite text whose only problem is its colours.
 */
export type FindingFix =
  | { kind: 'text' }
  | { kind: 'headingLevel'; level: number }
  | { kind: 'figureAlt'; alt: string }
  /** Remove text colour and highlight over the range: default black on white is 21:1. */
  | { kind: 'defaultColours' }
  /** Mark the range as being in another language (a BCP 47 tag). */
  | { kind: 'lang'; lang: string }
  /** Set the document's own language (a BCP 47 tag). */
  | { kind: 'docLang'; lang: string };

export interface EditorFinding extends Issue {
  severity: OpenSeverity;
  excerpt: string;
  hint: string;
  /** The flagged text as it was when checked, shown struck through beside the fix. */
  original?: string;
  anchor: Anchor;
  fix?: FindingFix;
  /** What a dismissal of this finding records; `id` when absent. The engine
   *  sets it for duplicate findings (see `dismissKey` in check.ts). */
  dismissKey?: string;
}

/** The key a dismissal is stored and matched under. */
export const dismissKeyOf = (f: EditorFinding): string => f.dismissKey ?? f.id;

/** Triage order: severity first, then document position — never insertion
 *  order, or carried prose findings would drift to the bottom of their group
 *  between gated runs. Section findings carry from: 0 and lead their group. */
export const sortFindings = (list: EditorFinding[]) =>
  [...list].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.from - b.from);

/**
 * Carry findings through a transaction's position mapping. Text findings move
 * with their text; one whose range collapses (the text was deleted) is dropped
 * — unless it was a caret to begin with (an empty heading has no text to
 * range over), which moves as a caret;
 * figure/section/document findings don't track text positions and pass through.
 *
 * Identity-preserving (§9.4): elements that didn't move keep their objects,
 * and when nothing at all moved the SAME array is returned, so the caller's
 * reconcile can skip the render and the decoration rebuild on the common
 * no-op edit. A `flatMap` here would allocate per keystroke and silently
 * defeat both guarantees.
 */
export function carryPositions(
  list: EditorFinding[],
  map: (pos: number, bias: 1 | -1) => number,
): EditorFinding[] {
  let changed = false;
  const out: EditorFinding[] = [];
  for (const f of list) {
    if (f.anchor.kind !== 'text') {
      out.push(f);
      continue;
    }
    const from = map(f.from, 1);
    const to = map(f.to, -1);
    if (from === f.from && to === f.to) {
      out.push(f);
      continue;
    }
    changed = true;
    if (f.from === f.to) out.push({ ...f, from, to: from });
    else if (to > from) out.push({ ...f, from, to });
  }
  return changed || out.length !== list.length ? out : list;
}

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

/**
 * Floor for the editor's image-id counter: above every `img-N` in the
 * document AND every N referenced by a persisted `img-alt-*` or
 * `img-long-description:*` dismissal (both are keyed on the figure id).
 * Dismissals outlive the figure they were made against; without the second
 * term, deleting a dismissed image and inserting a new one would reissue the
 * id, and the stale dismissal would silently swallow the NEW image's
 * missing-alt blocker — the one failure this product must never have.
 */
export function imageIdFloor(doc: PMNode, dismissed: Iterable<string> = []): number {
  let max = 0;
  doc.descendants((node) => {
    const m = /^img-(\d+)$/.exec(String(node.attrs.id ?? ''));
    if (m) max = Math.max(max, Number(m[1]));
    return true;
  });
  for (const id of dismissed) {
    const m = /^(?:img-alt-|img-long-description:)(?:header-|footer-)?img-(\d+)(?:~\d+)?$/.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
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

