# Ada-editor conventions

An accessibility-first editor UI: WCAG 2.1 AA is the floor, not a goal. Every rule below exists to keep designs from introducing a violation.

## Setup

- Link `styles.css` once; it imports `tokens/tokens.css` (all `--ada-*` custom properties) and `_ds_bundle.css` (the `ada-*` component classes). Nothing else is needed for styling. No theme provider exists.
- Wrap the app root in **`LiveAnnouncer`** once. `IssueList` announces every apply/dismiss outcome through it. Without the wrapper the list still renders, but screen-reader users hear nothing when a finding is resolved.
- Theme follows `prefers-color-scheme` automatically. Pin it with `data-theme="light"` or `data-theme="dark"` on `<html>`. Forced-colors (Windows High Contrast) is handled in the tokens; don't override it.

## Styling idiom: tokens + BEM classes, no utility classes

Write your own layout with inline styles or CSS using `var(--ada-*)` tokens only. Never use literal colours or pixel sizes.

| Family | Tokens |
|---|---|
| Surface | `--ada-surface-canvas`, `-raised`, `-sunken`, `-overlay` |
| Text | `--ada-text-primary`, `-secondary`, `-tertiary`, `-inverse` |
| Border | `--ada-border-subtle`, `-default`, `-control` |
| Action | `--ada-action-primary-bg`/`-fg`, `--ada-action-secondary-bg`/`-fg` |
| Severity | `--ada-severity-{blocker,violation,advisory,manual,checked}-{fg,bg}` |
| Space | `--ada-space-1` (4px) … `--ada-space-6` (32px) |
| Radius | `--ada-radius-sm`, `-md`, `-lg` |
| Type | `--ada-type-size-{xs,sm,base,lg,xl}`, `--ada-type-family-{ui,doc,mono}`, `--ada-type-line-height-{tight,body}`, `--ada-type-measure` (66ch) |
| Target / focus | `--ada-target-min` (24px), `--ada-target-comfortable` (44px), `--ada-focus-ring`, `--ada-focus-width` |

Component classes you may reuse on your own markup: `ada-visually-hidden`, `ada-editor` (the document surface: doc serif, 66ch measure), `ada-issues` (sunken findings panel). Don't invent new `ada-*` class names.

## Accessibility rules the components assume

- **Severity is never colour alone.** Show it with `SeverityBadge` (glyph + visible text label). Never use a bare coloured dot or an icon-only badge. Severity values: `blocker`, `violation`, `advisory`, `manual`, `checked`.
- Body text is never below `--ada-type-size-base` (16px). Interactive targets are never below 24px, and `Button` enforces this. There is no small or xs size.
- `Button` has `variant` `primary | secondary | ghost` and `iconOnly`. Icon-only buttons must contain a `VisuallyHidden` label. No disabled style exists, so hide unavailable actions instead of disabling them.
- Never show a green "compliant" or success state. An empty findings list says automated checks cannot confirm compliance.

## Data shape

`IssueList` and `IssueCard` take `Issue` objects: `{ id, severity, title, explanation, criterion, from, to, suggestion? }`. `criterion` is a WCAG criterion string like `"1.1.1 Non-text Content"`. Omit `suggestion` when no machine fix exists, which is the common case. The card then promotes "Go to text" to the primary action.

## Example

```jsx
const { LiveAnnouncer, IssueList } = window.AdaEditor;
const issues = [
  { id: 'alt-missing', severity: 'blocker', title: 'Image has no alternative text',
    explanation: 'Screen readers will announce nothing for this chart.',
    criterion: '1.1.1 Non-text Content', from: 34, to: 66 },
];
<LiveAnnouncer>
  <div style={{ display: 'flex', gap: 'var(--ada-space-6)', background: 'var(--ada-surface-canvas)' }}>
    <main className="ada-editor">…document…</main>
    <IssueList issues={issues} onAccept={apply} onDismiss={dismiss} onReveal={reveal} />
  </div>
</LiveAnnouncer>
```

Per-component docs: `components/general/<Name>/<Name>.prompt.md`. Full token list: `tokens/tokens.css`.
