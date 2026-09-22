import type { Node as PMNode } from 'prosemirror-model';
import { SEVERITY_RANK } from '../../design-system/primitives';
import type { Issue } from '../../design-system/primitives';
import { OPEN_SEVERITIES } from '../_data/fixtures';
import type { DocContent, OpenSeverity } from '../_data/fixtures';
import { schema } from './editorSchema';

export type Section = 'header' | 'footer';

/**
 * Where a finding lives. Only `text` findings have a meaningful document range
 * and get an inline underline; figures are addressed by id because their
 * position shifts, and header/footer findings live outside the document.
 */
export type Anchor =
  | { kind: 'text' }
  | { kind: 'figure'; figureId: string }
  | { kind: 'section'; section: Section };

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

/** Build the ProseMirror document and anchor each seeded finding to its span. */
export function buildDocument(content: DocContent): { doc: PMNode; findings: EditorFinding[] } {
  const { marks: M, nodes: N } = schema;
  const blocks: PMNode[] = [
    N.heading!.create({ level: 1 }, schema.text(content.heading)),
    N.paragraph!.create(null, schema.text(content.subheading, [M.fontSize!.create({ size: 13 }), M.textColor!.create({ color: '#5E6C84' })])),
  ];
  for (const line of content.lines) {
    blocks.push(N.paragraph!.create(null, schema.text(line.before + line.text + line.after)));
  }
  const doc = N.doc!.create(null, blocks);

  const findings: EditorFinding[] = [];
  // The first two blocks are the heading and subheading; prose lines follow.
  doc.forEach((_block, offset, index) => {
    const line = content.lines[index - 2];
    if (!line?.finding) return;
    const from = offset + 1 + line.before.length;
    findings.push({ ...line.finding, from, to: from + line.text.length, original: line.text, anchor: { kind: 'text' } });
  });
  return { doc, findings: sortFindings(findings) };
}
