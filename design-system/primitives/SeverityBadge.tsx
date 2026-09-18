import { Glyph } from './Glyph';
import { SEVERITY_ENCODING } from './severity';
import type { Severity } from './severity';
import { VisuallyHidden } from './VisuallyHidden';

/**
 * Glyph + visible text label + colour, in that order of importance.
 *
 * The label is never hidden at small sizes and there is no icon-only variant.
 * Removing the text would leave shape and colour, and shape alone is not a
 * reliable carrier for users who have not learned the shape vocabulary yet.
 */
export function SeverityBadge({ severity, showCriterion }: { severity: Severity; showCriterion?: string }) {
  const { label, wcag } = SEVERITY_ENCODING[severity];
  return (
    <span className="ada-badge" data-severity={severity}>
      <Glyph severity={severity} className="ada-badge__glyph" />
      <span className="ada-badge__label">{label}</span>
      <VisuallyHidden>{` (${wcag}${showCriterion ? `, ${showCriterion}` : ''})`}</VisuallyHidden>
    </span>
  );
}
