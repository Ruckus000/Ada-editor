# The conformance bar

The standard Ada-editor's own interface is held to. This is separate from what
the product checks *in the user's document* — this is about the app itself.

**Target: WCAG 2.2 Level AA, plus three Level AAA criteria adopted as AA.**

A tool that reports accessibility problems while having them is not credible.
The bar is deliberately set above what we ask of users' documents.

---

## Adopted above AA

| Criterion | Level | Why we take it anyway |
|---|---|---|
| 1.4.6 Contrast (Enhanced) — 7:1 | AAA | Applied to body text (`text.primary`). Verified at 17.13:1 light, 16.96:1 dark. |
| 2.4.13 Focus Appearance | AAA | One focus ring, 2px with 2px offset and a 4px contrasting halo, so it reads on any surface. Meeting 2.4.7 alone permits rings that are technically present and practically invisible. |
| 1.4.8 Visual Presentation | AAA | 66ch measure, 1.5 line-height, no justified text. For a writing tool the reading surface *is* the product. |

## Enforced automatically

`scripts/verify-tokens.mjs`, run in CI:

| Check | Fails on |
|---|---|
| Contrast assertions | Any token below its declared `min` |
| Non-colour encoding | Any severity with fewer than two usable non-colour channels |
| Dichromat separation | An indistinguishable severity pair with no declared non-colour fallback |
| CSS var integrity | A `var(--ada-*)` reference with no definition, across all three stylesheets |
| Palette sanity | Any two severities within dE 10 (CIEDE2000) in normal vision |

The verifier itself is covered by `scripts/test-verifier.mjs` (18 tests). That
suite is not ceremony: it caught a real defect in which the colour-vision check
was measuring luminance rather than hue, and had been reporting a collapse that
was an artefact of the metric.

## Enforced by review

These are not machine-checkable yet. They are the review checklist:

- **2.1.1 Keyboard / 2.1.2 No Keyboard Trap.** Every finding triageable without
  a mouse. No focus trap in the editor — `Escape` always returns to the list.
- **2.4.11 Focus Not Obscured.** Nothing floats over prose. The findings region
  is fixed. This is a layout rule, not a z-index fix.
- **2.5.8 Target Size.** 24px minimum, 44px comfortable, from
  `--ada-target-min`. `Button` has no small variant, deliberately.
- **1.4.12 Text Spacing.** No fixed heights on text containers. User stylesheets
  must be able to increase spacing without clipping.
- **1.4.10 Reflow.** Usable at 320px wide and 200% zoom without horizontal
  scrolling.
- **4.1.3 Status Messages.** Every accept and dismiss announces its result *and*
  what remains, including outstanding `manual` findings, through `LiveAnnouncer`.
- **forced-colors.** `tokens.css` hands every colour back to the OS. The
  interface must remain fully usable there — which is the real test of
  principle 1, since in forced-colors every severity is literally the same
  colour.
- **prefers-reduced-motion.** All durations collapse to 0ms. No exceptions for
  "subtle" animation.

## Known gaps

Stated plainly rather than discovered later. Four of the seven gaps recorded
in the previous round are now closed; what follows is what genuinely remains.

1. **No screen reader has been run against this.** The highest-priority gap,
   and the one that cannot be closed from here: this container has no AT-SPI
   stack and no NVDA, JAWS or VoiceOver. `scripts/verify-a11y.mjs` verifies the
   accessibility *tree* — the roles, names and live regions the browser hands
   assistive technology, plus keyboard mechanics driven through the DevTools
   Protocol — which is the layer beneath a screen reader, not a substitute for
   one. [`screen-reader-test-plan.md`](./screen-reader-test-plan.md) is a
   step-by-step script a non-specialist can run; until one row of its results
   table is filled in, treat every claim here as **reasoned and
   tree-verified, but unverified at the assistive-technology layer**.
2. **The arrow-key assumption is untested.** The design treats arrow keys as a
   sighted-keyboard convenience because NVDA and JAWS intercept them in browse
   mode, and routes assistive technology through headings and `F6` instead.
   The mechanics are verified; the premise is not. It is step 5 of the test plan.
3. **forced-colors was smoke-tested, not OS-tested.** Verified by forcing the
   block on in headless Chromium. Not run under real Windows High Contrast,
   where system colour mapping can differ.
4. **Partial-severity CVD matrices are interpolated.** The severity-1.0
   Machado transforms are the published ones; intermediate severities are
   interpolated from identity rather than transcribed from the paper's
   per-severity tables. Good enough to show the palette degrades gracefully,
   not a substitute for testing with people who have colour-vision deficiency.
5. **Contrast is still computed on flat pairs.** The verifier now *rejects*
   translucent and gradient tokens that do not declare a backdrop, so the gap
   cannot reopen silently — but compositing is not implemented, because nothing
   in the system needs it yet.
6. **The a11y gate covers the harness, not the product.** It exercises the real
   components with fixture findings. There is no application, so no route, no
   ProseMirror editor instance and no real document are covered.
