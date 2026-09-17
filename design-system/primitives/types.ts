import type { Severity } from './severity';

/** A single finding. `from`/`to` are ProseMirror document positions. */
export interface Issue {
  id: string;
  severity: Severity;
  /** Short imperative title, e.g. "Image has no alternative text". */
  title: string;
  /** Why this matters, in plain language. Shown without needing to expand. */
  explanation: string;
  /** The WCAG success criterion, e.g. "1.1.1 Non-text Content". */
  criterion: string;
  from: number;
  to: number;
  /** Replacement text. Absent when the fix is not machine-decidable — which is
   *  the normal case for `manual`, and the reason `manual` exists. */
  suggestion?: string;
}
