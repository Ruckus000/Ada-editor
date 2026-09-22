import { Button, Glyph, VisuallyHidden } from 'ada-editor';

const row = { display: 'flex', gap: 'var(--ada-space-2)', flexWrap: 'wrap', alignItems: 'center' } as const;

export const Variants = () => (
  <div style={row}>
    <Button variant="primary">Apply fix</Button>
    <Button variant="secondary">Go to text</Button>
    <Button variant="ghost">Dismiss</Button>
  </div>
);

/** When no machine fix exists, "Go to text" is promoted to primary. */
export const NoFixActions = () => (
  <div style={row}>
    <Button variant="primary">Go to text</Button>
    <Button variant="ghost">Dismiss</Button>
  </div>
);

/** Icon-only buttons still carry an accessible name. */
export const IconOnly = () => (
  <div style={row}>
    <Button variant="secondary" iconOnly>
      <Glyph severity="advisory" />
      <VisuallyHidden>Show advisory findings</VisuallyHidden>
    </Button>
    <Button variant="ghost" iconOnly>
      <Glyph severity="checked" />
      <VisuallyHidden>Show passed rules</VisuallyHidden>
    </Button>
  </div>
);
