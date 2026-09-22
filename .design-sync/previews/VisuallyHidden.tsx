import { Button, Glyph, VisuallyHidden } from 'ada-editor';

/** The accessible name of an icon-only control. */
export const IconButtonLabel = () => (
  <Button variant="secondary" iconOnly>
    <Glyph severity="blocker" />
    <VisuallyHidden>Show findings that block access</VisuallyHidden>
  </Button>
);

/** Extra context for screen readers: visible text reads "Go to text". */
export const ActionContext = () => (
  <Button variant="primary">
    Go to text
    <VisuallyHidden> for Image has no alternative text</VisuallyHidden>
  </Button>
);
