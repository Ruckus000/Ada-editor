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

Stated plainly rather than discovered later.

1. **NVDA, JAWS and VoiceOver have not actually been run.** NVDA and VoiceOver
   tests exist (`tests/screen-reader/`) and run in CI on Windows and macOS
   runners, but they were written on Linux and have never executed. The first CI
   run is the test of the tests; expect timing and phrasing assumptions to need
   correction. **JAWS is not covered at all** — it is commercial and licensed,
   and Guidepup does not drive it. Until a CI run goes green, treat NVDA and
   VoiceOver as unverified.
2. **Orca is one implementation.** The Linux gate is real and repeatable, but
   browse-mode semantics differ between screen readers. Orca passing does not
   predict NVDA or VoiceOver.
3. **forced-colors is emulated, not run on Windows.** `verify-a11y.mjs` now
   activates the real `forced-colors: active` media feature through CDP and
   asserts that every severity collapses to one system colour while the four
   underline shapes stay distinct. That is a genuine test of the media query,
   but not of Windows High Contrast, where system colour mapping differs.
4. **Partial-severity CVD matrices are interpolated.** The severity-1.0 Machado
   transforms are the published ones; intermediate severities are interpolated
   from identity rather than transcribed from the paper's per-severity tables.
5. **Contrast is still computed on flat pairs.** The verifier rejects
   translucent and gradient tokens that do not declare a backdrop, so the gap
   cannot reopen silently — but compositing is not implemented, because nothing
   in the system needs it.
6. **The gates cover the harness, not the product.** They exercise the real
   components with fixture findings. There is no application, so no route, no
   ProseMirror editor instance and no real document are covered. **This is now
   the largest gap in the project** — the design system is verified well past
   the point where the product concept is.
