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
  preview.html          visual harness; real stylesheets, hand-written markup
  primitives/
    severity.ts         GENERATED from tokens.json `encoding`
    primitives.css      component styles (no literal colours)
    Button.tsx  SeverityBadge.tsx  IssueCard.tsx  IssueList.tsx
    Glyph.tsx  LiveAnnouncer.tsx  VisuallyHidden.tsx
    issueUnderline.ts   ProseMirror decoration plugin
scripts/
  build-tokens.mjs      tokens.json -> css + ts
  verify-tokens.mjs     the thing that says no
  test-verifier.mjs     tests for the thing that says no
  palette-ceiling.mjs   how much colour separation is achievable at all
```

## Usage

```
node scripts/build-tokens.mjs
node scripts/verify-tokens.mjs --verbose
node scripts/verify-tokens.mjs --pair '#15C39A' '#FFFFFF'
node scripts/test-verifier.mjs
node scripts/palette-ceiling.mjs
```

Both scripts are dependency-free Node — they run without `npm install`.

Open `design-system/preview.html` in a browser to see the whole system. Add the
`grayscale` class to `<body>` to run the colour-independence test from
[principle 1](./principles.md#1-colour-is-never-the-only-channel).

```css
@import "tailwindcss";
@import "./design-system/tokens.css";
@import "./design-system/tailwind-theme.css";
@import "./design-system/primitives/primitives.css";
```

## Status

The token layer, the verifier and the primitives are complete and checked. The
application, the WCAG rule engine, persistence and auth do not exist yet. The
React components are written against declared dependencies that are **not
installed** in this repository, so they have not been compiled or rendered —
treat them as specification-grade, and expect to fix import-level details when
the app is first scaffolded.

The most significant outstanding gap is that **nothing here has been tested with
a screen reader.** See [known gaps](./accessibility-standard.md#known-gaps).
