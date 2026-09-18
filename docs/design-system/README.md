# Ada-editor design system

A design system for a writing tool that checks documents for accessibility
compliance. Derived from an audit of Grammarly — substantially by rejecting what
it does.

**Start here:** [the audit](../audit/grammarly-ux-audit.md), then
[principles](./principles.md).

| Document | What it covers |
|---|---|
| [Grammarly audit](../audit/grammarly-ux-audit.md) | What we took, adapted and refused, with the arithmetic |
| [Principles](./principles.md) | Five rules, in priority order |
| [Tokens](./tokens.md) | Three-tier tokens and every measured contrast ratio |
| [Suggestion pattern](./patterns-suggestion.md) | The core finding-reporting pattern |
| [Conformance bar](./accessibility-standard.md) | What the app itself is held to, and known gaps |

## The one-paragraph version

Grammarly encodes its four suggestion categories in underline colour alone, on a
brand green that measures 2.26:1 against white — below even the 3:1 non-text
threshold. A better palette can help — measured with CIEDE2000, a CVD-safe four-colour set
is achievable — but only by abandoning the conventional red/amber severity ramp,
whose two colours sit on the exact axis red-green deficiency removes. So
colour here is decorative, meaning is carried by underline shape, glyph and
visible text, and a verifier in CI fails the build if any severity starts
depending on colour. The findings list — not the inline underline — is the
canonical interface, because no ARIA mechanism reliably exposes an arbitrary
inline annotation. And nothing in the system ever tells a user their document is
compliant, because automated checking cannot know that.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Editor | **ProseMirror** (via Tiptap core, MIT) | `Decoration`/`DecorationSet` annotates ranges without mutating the document — exactly this use case, and the most battle-tested at it |
| Primitives | **Radix UI** | Focus management and ARIA wiring are functional requirements here; unstyled, so tokens drive everything |
| Framework | **Next.js** (App Router) | Editor mounts as a client component; route handlers will host the checking service |
| Styling | **Tailwind v4 `@theme`** + CSS custom properties | v4 is CSS-first, so the tokens *are* the theme — no JS config to drift |

Tiptap *core* is MIT; several Pro extensions are paid. Verify licensing before
adding any extension, and fall back to raw ProseMirror if one is gated.

## Layout

```
design-system/
  tokens.json           source of truth — edit this
  tokens.css            GENERATED
  tailwind-theme.css    GENERATED
  preview.html          GENERATED from the real components (server-rendered)
  preview/harness.js    GENERATED hydration bundle (gitignored; npm run preview:build)
  primitives/
    severity.ts         GENERATED from tokens.json `encoding`
    primitives.css      component styles (no literal colours)
    Button.tsx  SeverityBadge.tsx  IssueCard.tsx  IssueList.tsx
    Glyph.tsx  LiveAnnouncer.tsx  VisuallyHidden.tsx
    issueUnderline.ts   ProseMirror decoration plugin
scripts/
  build-tokens.mjs      tokens.json -> css + ts
  build-preview.mjs     real components -> design-system/preview.html
  verify-tokens.mjs     token gate: contrast, CVD, encoding, css vars
  verify-a11y.mjs       component gate: axe, accessibility tree, keyboard, forced-colors
  verify-orca.mjs       screen reader gate: drives Orca, asserts on what it says
  a11y-stack.sh         Xvfb + dbus + AT-SPI, so Orca can run headlessly
  test-verifier.mjs     tests for the gates themselves
  palette-ceiling.mjs   how much colour separation is achievable at all
  serve-preview.mjs     static server (the preview needs HTTP, not file://)
  harness/              the React tree both the preview and the gate render
```

## Usage

```
npm install
npm run verify        # typecheck + both gates, end to end
npm run preview       # serve the preview at http://127.0.0.1:8080

node scripts/verify-tokens.mjs --pair '#15C39A' '#FFFFFF'
node scripts/palette-ceiling.mjs
```

`verify-tokens.mjs`, `palette-ceiling.mjs` and `serve-preview.mjs` are
dependency-free. The typecheck, the preview build and the accessibility gate
need `npm install`.

`design-system/preview.html` is **generated from the real components** by
`build-preview.mjs` — it is server-rendered and then hydrates, so it is the same
tree the accessibility gate verifies. It must be served (`npm run preview`), not
opened from disk: Chromium blocks ES modules on a `file://` origin, and the page
is silently inert without them.

```css
@import "tailwindcss";
@import "./design-system/tokens.css";
@import "./design-system/tailwind-theme.css";
@import "./design-system/primitives/primitives.css";
```

## Status

The token layer, the primitives, and both gates are complete and checked. The
components typecheck under `strict`, render, and pass axe-core plus an
accessibility-tree and keyboard audit. The application, the WCAG rule engine,
persistence and auth do not exist.

It has been run with a real screen reader — Orca 46.1, driven headlessly — which
found and fixed a focus-management defect the automated gate had missed. NVDA,
JAWS and VoiceOver are still untested. See
[`screen-reader-test-plan.md`](./screen-reader-test-plan.md) for what Orca
actually said, and [known gaps](./accessibility-standard.md#known-gaps) for the
rest.
