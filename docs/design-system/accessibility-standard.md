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

1. **Both screen readers reach the page; the assertions are still being tuned.**
   Headless was the root cause — screen readers cannot read a headless browser —
   and with that fixed NVDA confirms the system's central claim: severity is
   announced as words.

   The remaining failures are not all findings about the components. VoiceOver
   failed all four tests at the harness's own entry guard, which asserted that
   the page's words had been spoken immediately after `Control+Home`. VoiceOver
   lands in the `main` landmark and announces `"Document main"` and nothing
   else; the page snapshot attached to the same failure showed it on the right
   document throughout. The guard now reads forward until the page's own words
   appear. The claim it checks is unchanged — only the navigation that reaches
   it.

   NVDA's remaining failure has the same shape. `lastSpokenPhrase()` answered
   with the entire findings region as one phrase — heading, instructions and
   every button in it — so the seek for a button that removes a finding stopped
   on a match inside a bulk read, with focus still elsewhere, and Enter did
   nothing. The seek now requires a phrase that ends in "button", which is how a
   focused control is announced and a region dump never is. Neither of these
   changed a threshold. Both are still unverified until a run says otherwise.

   **JAWS is not covered at all** — commercial, licensed, and not driven by
   Guidepup. Treat NVDA and VoiceOver as **attempted, partly passing**, which is
   a better position than untested but is not yet verification.
2. **The Orca gate is reliable locally and does not yet run in CI.** Narrowed to
   one step: on a GitHub runner Orca attaches, the right window is activated, X
   input focus is on it and the accessibility tree is fully populated, and
   synthetic keypresses still produce no speech. The gate reports exactly that,
   in about two minutes.

   An earlier version of this note called the cause "XTEST synthetic input does
   not reach Chromium's renderer." That claimed more than the evidence supports;
   silence is equally consistent with the keys arriving and Orca having nothing
   to say. The gate now reads Orca's own log to tell those apart — see the test
   plan. Until a CI transcript shows Orca reading page content the job stays
   non-blocking, and it can no longer skip silently: a skip is a failure when
   `CI` is set. Linux screen reader evidence for this project comes from local
   runs, not from CI.

   Orca is also one implementation; browse-mode semantics differ between screen
   readers, so Orca passing does not predict NVDA or VoiceOver.
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
