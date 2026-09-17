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

Stated plainly rather than discovered later:

1. **No screen reader testing has been done.** Nothing here has been driven with
   NVDA, JAWS or VoiceOver. The ARIA is written to spec, which is not the same
   as being verified against implementations. This is the highest-priority gap.
2. **The dichromacy simulation is Viénot (1999)**, a linear approximation.
   Good enough to prove colours are indistinguishable; not a substitute for
   testing with users who have colour-vision deficiency.
3. **No automated axe/Lighthouse pass**, because there is no running app yet.
   Wire `axe-core` into CI with the first rendered route.
4. **Contrast is checked on flat token pairs only.** Text over an image,
   gradient or translucent surface is not covered.
5. **`F6` region cycling is specified but not implemented.** It belongs to the
   application shell, which does not exist yet. `patterns-suggestion.md`
   documents it as part of the keyboard model; treat that as a specification,
   not a description of working code.
6. **The arrow-key model is unverified against real screen readers.** It is
   written as a sighted-keyboard enhancement precisely because NVDA and JAWS
   intercept arrows in browse mode, but that reasoning has not been confirmed
   by testing. Heading navigation and `Tab` are the paths expected to carry AT
   users, and those are also untested.
7. **forced-colors was smoke-tested, not OS-tested.** The block was verified by
   forcing it on in headless Chromium and rendering `preview.html`; the layout
   holds and every severity stays distinguishable. It has not been run under
   real Windows High Contrast, where system colour mapping can differ.
