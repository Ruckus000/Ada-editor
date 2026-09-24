/**
 * The checking engine's entry point: run every rule over a ProseMirror doc and
 * turn raw rule output into EditorFindings with stable, content-derived ids —
 * then reconcile a fresh run against the findings the editor already shows, so
 * a card only disappears when its own flagged text changes or is dismissed,
 * never because of an edit elsewhere in the document (§4).
 *
 * Two performance guarantees from §9 are load-bearing here, not optional:
 * - Per-textblock memoization (§9.1): ProseMirror keeps untouched nodes
 *   reference-identical across edits, so a WeakMap keyed on the node object
 *   turns every unchanged block into a cache hit. The memo stores block-
 *   RELATIVE offsets; the live walk supplies absolute positions, because
 *   positions shift on edits elsewhere while node identity doesn't.
 * - Identity preservation (§9.4): unchanged findings keep their object, an
 *   unchanged finding set keeps its array, so the editor can skip re-rendering
 *   the findings list entirely on the common no-op keystroke.
 */
import type { Node as PMNode } from 'prosemirror-model';
import type { Anchor, EditorFinding } from '../_editor/findings';
import { dismissKeyOf } from '../_editor/findings';
import type { BlockEntry, BlockSummary, RawFinding } from './rules';
import { PROSE_RULE_IDS, crossBlockFindings, isCheckableBlock, summarizeBlock } from './rules';

/** Cached per-block rule results, keyed by node identity (§9.1). */
const blockMemo = new WeakMap<PMNode, BlockSummary>();

const EXCERPT_MAX = 60;

/** Whether an id belongs to a prose-heuristic rule (gated per §8.1). */
const isProseId = (id: string): boolean => {
  for (const ruleId of PROSE_RULE_IDS) {
    if (id === ruleId || id.startsWith(`${ruleId}:`)) return true;
  }
  return false;
};

/**
 * Stable id per §4 as corrected by §9.3: derived from the flagged text, never
 * from positions or sibling ordinals, so it changes iff the flagged text
 * changes. Duplicate snippets get a collision ordinal counted in document
 * order. img-alt-missing keeps the exact `img-alt-${figureId}` id the editor's
 * figure reconcile has always used, so dismissals and the alt dialog's
 * un-dismiss-on-clear stay continuous.
 */
function baseId(f: RawFinding): string {
  if (f.ruleId === 'img-alt-missing' && f.anchor.kind === 'figure') {
    return `img-alt-${f.anchor.figureId}`;
  }
  // Keyed on the image, not its alt: the finding tells the author to edit the
  // alt ("details below"), and following that advice must not undo a dismissal.
  if (f.ruleId === 'img-long-description' && f.anchor.kind === 'figure') {
    return `${f.ruleId}:${f.anchor.figureId}`;
  }
  // A contrast finding is about the text AND its colours: a dismissal made at
  // 3.96:1 must not keep hiding the same text recoloured to 1.2:1.
  if (f.ruleId === 'contrast-minimum' && f.original) return `${f.ruleId}:${f.snippet}|${f.original}`;
  return f.snippet ? `${f.ruleId}:${f.snippet}` : f.ruleId;
}

function stableId(base: string, seen: Map<string, number>): string {
  const n = seen.get(base) ?? 0;
  seen.set(base, n + 1);
  return n === 0 ? base : `${base}#${n + 1}`;
}

/**
 * What a dismissal records. Ordinals shift when an earlier duplicate is
 * deleted — the surviving twin inherits the base id — so a dismissal keyed on
 * the id alone would silently hide a finding nobody judged. Duplicates
 * therefore key on id AND how many there are: any change to the count voids
 * the dismissal (the finding shows again, the safe direction), and an exact
 * revert restores it. Unique findings key on the bare id, so dismissals
 * stored before this existed keep working.
 */
const dismissKey = (id: string, count: number): string => (count > 1 ? `${id}~${count}` : id);

const excerptOf = (snippet: string): string =>
  snippet.length > EXCERPT_MAX ? `${snippet.slice(0, EXCERPT_MAX - 1)}…` : snippet;

/**
 * Run the engine over a document.
 *
 * `prose: false` runs only the structural rules — safe on every keystroke,
 * because they cannot false-positive on partial input. `prose: true` adds the
 * prose-heuristic rules and is reserved for blur and the explicit Recheck
 * action, so they never flag a sentence still being typed (§8.1).
 */
export function checkDocument(doc: PMNode, opts: { prose: boolean }): EditorFinding[] {
  const entries: BlockEntry[] = [];
  doc.descendants((node, pos) => {
    if (!isCheckableBlock(node)) return true;
    let summary = blockMemo.get(node);
    if (!summary) {
      summary = summarizeBlock(node);
      blockMemo.set(node, summary);
    }
    entries.push({ pos, contentSize: node.content.size, summary });
    // Inline children carry nothing the block summary hasn't already seen.
    return false;
  });

  const raw: { finding: RawFinding; blockPos: number }[] = [];
  for (const e of entries) {
    for (const f of e.summary.findings) {
      if (!opts.prose && PROSE_RULE_IDS.has(f.ruleId)) continue;
      raw.push({ finding: f, blockPos: e.pos });
    }
  }
  for (const f of crossBlockFindings(entries)) {
    if (!opts.prose && PROSE_RULE_IDS.has(f.ruleId)) continue;
    raw.push({ finding: f, blockPos: -1 });
  }

  const seen = new Map<string, number>();
  const mapped: EditorFinding[] = [];
  const keyed: [EditorFinding, string][] = [];
  for (const { finding: f, blockPos } of raw) {
    let from: number;
    let to: number;
    let anchor: Anchor;
    switch (f.anchor.kind) {
      case 'blockRange':
        from = blockPos + 1 + f.anchor.from;
        to = blockPos + 1 + f.anchor.to;
        anchor = { kind: 'text' };
        break;
      case 'docRange':
        from = f.anchor.from;
        to = f.anchor.to;
        anchor = { kind: 'text' };
        break;
      case 'figure':
        from = blockPos;
        to = blockPos + 1;
        anchor = { kind: 'figure', figureId: f.anchor.figureId };
        break;
      case 'document':
        from = 0;
        to = 0;
        anchor = { kind: 'document' };
        break;
      default: {
        const unreachable: never = f.anchor;
        throw new Error(`unknown raw anchor: ${JSON.stringify(unreachable)}`);
      }
    }
    const base = baseId(f);
    const out: EditorFinding = {
      id: stableId(base, seen),
      severity: f.severity,
      title: f.title,
      explanation: f.explanation,
      criterion: f.criterion,
      excerpt: excerptOf(f.snippet),
      hint: f.hint,
      from,
      to,
      anchor,
    };
    // The diff UI shows original → suggestion; only the machine-decidable
    // fixes set one, and none is a text replacement (see FindingFix).
    if (f.fix) {
      out.fix = f.fix;
      if (f.fix.kind === 'headingLevel') {
        out.original = f.original ?? f.snippet;
        out.suggestion = `h${f.fix.level}`;
      } else if (f.fix.kind === 'figureAlt') {
        out.original = f.snippet;
        out.suggestion = f.fix.alt;
      } else if (f.fix.kind === 'defaultColours') {
        out.original = f.original ?? f.snippet;
        out.suggestion = 'default colours';
      }
    }
    mapped.push(out);
    keyed.push([out, base]);
  }
  // Counts are final only once every finding is numbered.
  for (const [f, base] of keyed) {
    const count = seen.get(base) ?? 1;
    if (count > 1) f.dismissKey = dismissKey(f.id, count);
  }
  mapped.sort((a, b) => a.from - b.from);
  return mapped;
}

export interface ReconcileOptions {
  /** Set on structural-only runs: prose findings from `prev` are carried
   *  forward (their positions already mapped through the transaction) instead
   *  of dropped, until the next blur/Recheck run recomputes them (§8.1). */
  keepProse?: boolean;
}

const sameFinding = (a: EditorFinding, b: EditorFinding): boolean =>
  a.from === b.from && a.to === b.to &&
  a.severity === b.severity && a.criterion === b.criterion &&
  a.title === b.title && a.explanation === b.explanation &&
  a.excerpt === b.excerpt && a.hint === b.hint &&
  a.suggestion === b.suggestion && a.original === b.original &&
  a.dismissKey === b.dismissKey &&
  JSON.stringify(a.fix ?? null) === JSON.stringify(b.fix ?? null);

/**
 * Merge a fresh engine run into the findings the editor currently shows:
 * - ids in both keep the existing OBJECT (activeId/focus/scroll state stays
 *   valid, and the caller can skip re-rendering when the array is identical);
 * - engine-owned ids only in `prev` are dropped (fixed, dismissed, or edited
 *   away) — except prose findings on a structural run with `keepProse`;
 * - ids only in `next` are added, filtered through the dismissed set;
 * - header/footer section findings are never engine-owned and pass through.
 */
export function reconcile(
  prev: EditorFinding[],
  next: EditorFinding[],
  dismissed: ReadonlySet<string>,
  opts: ReconcileOptions = {},
): EditorFinding[] {
  const prevById = new Map<string, EditorFinding>();
  for (const f of prev) prevById.set(f.id, f);

  const result: EditorFinding[] = [];
  for (const nf of next) {
    if (dismissed.has(dismissKeyOf(nf))) continue;
    const pf = prevById.get(nf.id);
    result.push(pf && sameFinding(pf, nf) ? pf : nf);
  }
  const nextIds = new Set(next.map((f) => f.id));
  for (const pf of prev) {
    if (pf.anchor.kind === 'section') {
      result.push(pf);
    } else if (opts.keepProse && isProseId(pf.id) && !nextIds.has(pf.id)) {
      result.push(pf);
    }
  }

  // Order carries no meaning (every consumer sorts or looks up by id), and the
  // rebuild order differs from prev's — carried prose is appended — so compare
  // as a set, or the first structural run after a full run re-renders for nothing.
  const kept = new Set(prev);
  if (result.length === prev.length && result.every((f) => kept.has(f))) return prev;
  return result;
}
