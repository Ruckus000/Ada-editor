import { Glyph, SEVERITIES, SEVERITY_ENCODING } from 'ada-editor';

const row = { display: 'flex', gap: 'var(--ada-space-5)', flexWrap: 'wrap' } as const;
const cell = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--ada-space-1)',
  fontSize: 'var(--ada-type-size-xs)',
  color: 'var(--ada-text-secondary)',
} as const;

/** Each glyph in its severity colour. Glyphs draw with currentColor. */
export const AllGlyphs = () => (
  <div style={row}>
    {SEVERITIES.map((s) => (
      <div key={s} style={cell}>
        <span style={{ color: `var(--ada-severity-${s}-fg)`, display: 'inline-flex' }}>
          <Glyph severity={s} />
        </span>
        {SEVERITY_ENCODING[s].label}
      </div>
    ))}
  </div>
);

/** Shape alone identifies severity — same set with colour removed. */
export const Monochrome = () => (
  <div style={{ ...row, color: 'var(--ada-text-primary)' }}>
    {SEVERITIES.map((s) => (
      <Glyph key={s} severity={s} />
    ))}
  </div>
);
