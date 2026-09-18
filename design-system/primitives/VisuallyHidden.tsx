import type { ReactNode } from 'react';

/**
 * Visible to assistive technology, not to sighted users. Uses the clip-rect
 * pattern rather than `display:none` or `visibility:hidden`, both of which
 * remove the element from the accessibility tree entirely.
 */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="ada-visually-hidden">{children}</span>;
}
