import type { Severity } from './severity';
import { SEVERITY_ENCODING } from './severity';

/**
 * Severity glyphs. Each outline is distinct in silhouette, so the shape alone
 * identifies the severity at 1-bit colour depth, in forced-colors mode, and
 * under every form of colour-vision deficiency.
 *
 * `currentColor` throughout: the glyph inherits whatever the OS forces in
 * high-contrast mode instead of fighting it.
 */
const PATHS: Record<string, string> = {
  octagon: 'M6.2 1h7.6L19 6.2v7.6L13.8 19H6.2L1 13.8V6.2z',
  triangle: 'M10 1.6 19 18H1z',
  'circle-i': 'M10 1a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  'diamond-q': 'M10 1 19 10l-9 9-9-9z',
  check: 'M4 1h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3V4a3 3 0 0 1 3-3z',
};

const MARKS: Record<string, string> = {
  'circle-i': 'M10 5.2v1.6M10 9v5.6',
  'diamond-q': 'M8.4 8.2a1.7 1.7 0 1 1 1.9 1.8v1.4M10 14.2v.1',
  check: 'M6 10.2l2.7 2.7L14 7.6',
  octagon: 'M10 5.4v5.4M10 13.4v.1',
  triangle: 'M10 7.4v4.2M10 14.2v.1',
};

export function Glyph({ severity, className }: { severity: Severity; className?: string }) {
  const key = SEVERITY_ENCODING[severity].glyph;
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[key]} />
      {MARKS[key] ? <path d={MARKS[key]} /> : null}
    </svg>
  );
}
