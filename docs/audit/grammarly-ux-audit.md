# Grammarly UX/UI audit

**Scope.** A heuristic audit of Grammarly's writing-assistant interface, done to
decide what Ada-editor should inherit and what it must not. Ada-editor is a
writing tool for producing accessible documents, so Grammarly is the obvious
reference implementation — and, as it turns out, the obvious cautionary tale.

**Method and its limits — read this before citing anything below.** This is a
**desk audit**. It is built from Grammarly's public support documentation,
their engineering blog, published UX case studies, press coverage of their
1.0 category system, third-party accessibility scans, and public litigation
records. `grammarly.com` and `support.grammarly.com` are blocked by this
environment's network egress proxy, so I could not fetch their pages directly,
and I did not drive a live Grammarly account with a screen reader.

What that means in practice:

- **The colour and contrast findings are hard.** They are arithmetic on
  published hex values, reproducible with
  `node scripts/verify-tokens.mjs --pair '#15C39A' '#FFFFFF'`.
- **The interaction findings are softer.** They describe the model as
  documented, not as observed. Before acting on any of them in a way that
  costs real engineering time, confirm against the live product.

Findings are tagged **ADOPT**, **ADAPT**, or **REJECT**.

---

## 1. The category system is encoded in colour alone — REJECT

Grammarly sorts suggestions into four categories, distinguished in the prose by
underline colour:

| Category | Underline | What it means |
|---|---|---|
| Correctness | red | grammar, spelling, punctuation |
| Clarity | blue | wordiness, sentence structure |
| Engagement | green | bland or overused wording |
| Delivery | purple | tone, formality, hedging |

This is the product's core information architecture, and it is carried by hue
and nothing else in the text surface. Three consequences:

1. **It is a WCAG 1.4.1 (Use of Colour) failure pattern.** Colour is the only
   visual means of conveying which category an underline belongs to.
2. **Red and green are two of the four.** That is the single worst pair to
   choose for deuteranopia and protanopia, which affect roughly 8% of men.
3. **It does not survive greyscale printing, forced-colors mode, or a
   monochrome display.**

For a general-purpose grammar checker this is a real but survivable flaw — the
category is a nice-to-have, and the suggestion text carries the actual meaning.
For an accessibility product it is disqualifying, because the category *is* the
finding's severity.

**What Ada-editor does instead:** see
[`patterns-suggestion.md`](../design-system/patterns-suggestion.md). Severity is
carried by underline *shape* (`double` / `wavy` / `dotted` / `dashed`), a glyph
with a distinct silhouette, and a visible text label. Colour is applied last and
is explicitly redundant.

---

## 2. The brand colour cannot legally carry UI meaning — REJECT

Grammarly's signature green is `#15C39A`. Measured against white:

| Colour | vs `#FFFFFF` | Text AA (4.5:1) | Non-text (3:1) |
|---|---|---|---|
| Grammarly green `#15C39A` | **2.26:1** | FAIL | **FAIL** |
| Grammarly grey `#4C4C4C` | 8.59:1 | PASS | PASS |

2.26:1 fails not only the text threshold but SC 1.4.11 Non-text Contrast, which
governs UI component boundaries and meaningful graphics at 3:1. The brand green
is therefore unusable for an underline, an icon, a control border, or a focus
ring on a light surface. It is a fill-and-decoration colour only.

Reproduce:

```
$ node scripts/verify-tokens.mjs --pair '#15C39A' '#FFFFFF'
#15C39A on #FFFFFF = 2.26:1
  text AA  (4.5:1) FAIL
  text AAA (7.0:1) FAIL
  non-text (3.0:1) FAIL
```

**Lesson taken:** Ada-editor picks its brand colour *after* the contrast
constraint, not before. Any colour that cannot clear 3:1 against both surfaces
never becomes a semantic token.

---

## 3. The keyboard model is genuinely good — ADOPT

The one part of Grammarly's interface that deserves copying. As documented:

- `F6` / `Shift+F6` move between major regions of the editor.
- `Tab` moves focus to the first suggestion.
- `Enter` accepts the focused suggestion.
- `Esc` dismisses the focused suggestion card.

Landmark-level `F6` cycling is the right primitive for an application with a
large editing surface and a parallel findings region, and it is under-used on
the web generally. Accept-on-`Enter` / dismiss-on-`Esc` is the correct mapping
because it matches the dialog conventions users already hold.

**Adopted with one change:** in Ada-editor these keys operate on the **issue
list**, which is a permanent region, rather than on a floating card whose
existence depends on caret position. See
[`patterns-suggestion.md`](../design-system/patterns-suggestion.md).

---

## 4. Meaning lives in one place, action in another — ADAPT

The underline is in the prose; the explanation and the accept/dismiss controls
are in a card to the side. The user reads in column A and acts in column B, and
the mapping between them is re-established visually each time.

This splits attention, and a floating card anchored near the caret risks
overlapping the very text it describes — the failure mode SC 2.4.11 (Focus Not
Obscured) was added in WCAG 2.2 to address. Published reviews echo this: several
reviewers describe the interface as disruptive to the act of writing, with
elements interfering with composition.

**What Ada-editor does instead:** the findings region is fixed, not floating.
Cards never overlap prose, never move in response to the caret, and never
obscure a focused element. Focusing a card highlights the corresponding range
but does **not** steal focus from the list.

---

## 5. Inline annotation has no reliable assistive-technology mechanism — ADAPT (this is the big one)

Grammarly's central metaphor is the inline underline. There is no
well-supported ARIA mechanism that makes an arbitrary inline annotation
reachable and comprehensible to a screen reader:

- `aria-invalid="spelling"` and `aria-invalid="grammar"` exist and are the
  standards-correct choice, but support is partial. NVDA handles them; it does
  not handle both at once, and Firefox does not expose multiple values via
  IAccessible2 at all.
- More importantly, **neither value generalises.** An accessibility finding is
  not a spelling error and not a grammar error, and there is no
  `aria-invalid="accessibility"`.
- The ARIA annotations work (`role="mark"`, `aria-details`) is not
  broadly enough supported to depend on.
- Underneath all of it, `contenteditable` plus screen readers remains an
  unreliable combination. Even Tiptap's own accessibility guidance warns that
  VoiceOver may concatenate words across block boundaries.

Grammarly's own position is that the editor "can be used with" assistive
software while noting they "still have some tweaks to make."

**This is the finding that sets Ada-editor's architecture.** If the inline
annotation cannot be relied on to reach every user, it cannot be the interface —
it can only be an enhancement on top of one.

So: **the issue list is canonical.** Every finding is fully readable and fully
actionable from a stable, keyboard-navigable list, without entering the
contenteditable surface at all. The underline is progressive enhancement. This
inverts Grammarly's priority, and it is the single most consequential decision
in this design system.

---

## 6. "Zero issues" implies a guarantee the tool cannot make — REJECT

Grammarly drives toward an empty state: clear every suggestion and you are
done. For grammar, roughly fair. For accessibility, actively misleading.

Automated accessibility checking catches somewhere around a third of WCAG
success criteria. The rest need human judgement: whether alt text actually
describes the image, whether "click here" is meaningful in context, whether the
heading hierarchy reflects the document's real structure. A tool that renders a
green "compliant" badge after its automated passes is making a claim it has no
basis for — and for a product sold on compliance, that is legal exposure, not a
UX nicety.

Compounding it: **"ADA compliant" is not a technical standard.** The ADA
specifies no document conformance requirement. The operative references are
WCAG 2.1 AA (via the DOJ's April 2024 Title II rule), Section 508, and PDF/UA.

**What Ada-editor does instead:**

- A fourth severity, **`manual`** — "Needs your call" — for findings that are
  not machine-decidable. Grammarly has no analogue, because grammar rarely
  needs one.
- The empty state never says compliant. It says: *"No automated findings.
  Automated checks cannot confirm compliance — alt-text quality, link wording
  and heading logic still need a human read."*
- No success badge exists in the component set. It is not styled-out; it is
  absent, so it cannot be reintroduced by someone reaching for a green chip.

---

## 7. Grammarly has been sued over accessibility — context

A lawsuit filed in February 2021 alleged `grammarly.com` failed WCAG 2.0 and
2.1, citing missing alt text on graphics, empty links with no discernible
purpose, unlabelled text conveying vital information, and login/account-creation
fields announced by screen readers as "edit scan off" with no further
description. Third-party scans of the marketing site have continued to score it
poorly.

This is included not as a cheap shot but as the reason the brief needed
adjusting. Ada-editor's value proposition is accessibility compliance. Adopting
the interface conventions of a company that has been sued over accessibility —
conventions that, as sections 1 and 2 show, do contain real conformance
problems — would be an unforced error.

**The correct posture toward Grammarly is adversarial, not aspirational.** Take
the keyboard model. Take the writing-first minimalism. Reject the colour
system, the floating card, and the compliance-implying empty state.

---

## What carried over

| Grammarly behaviour | Verdict | Ada-editor |
|---|---|---|
| `F6` region cycling, `Tab`/`Enter`/`Esc` on suggestions | ADOPT | Same keys, applied to the issue list |
| Calm, low-chrome writing surface; advanced features tucked into a side panel | ADOPT | Same restraint; 66ch measure, serif document face |
| Four categories distinguished by underline colour | **REJECT** | Shape + glyph + label; colour redundant |
| `#15C39A` as a load-bearing UI colour | **REJECT** | All semantic colour clears 3:1 minimum, verified in CI |
| Floating card anchored to caret | ADAPT | Fixed findings region; never obscures text |
| Inline underline as the primary interface | ADAPT | List is canonical; underline is enhancement |
| Empty state implying "you're done" | **REJECT** | `manual` severity; empty state states the limits of automation |

---

## Sources

Primary documentation and reporting used for this audit. Pages on
`grammarly.com` and `support.grammarly.com` were unreachable from this
environment and are cited from search result summaries rather than direct
retrieval — flagged inline where that matters.

- [Can I use screen readers with the Grammarly Editor? — Grammarly Support](https://support.grammarly.com/hc/en-us/articles/10725131673357-Can-I-use-screen-readers-with-the-Grammarly-Editor)
- [Can I use my keyboard to navigate the Grammarly Editor? — Grammarly Support](https://support.grammarly.com/hc/en-us/articles/10725118477069-Can-I-use-my-keyboard-to-navigate-the-Grammarly-Editor)
- [Grammarly Accessibility Statement](https://www.grammarly.com/accessibility-statement)
- [Sanchez v. Grammarly, Inc. — accessibility.com digital lawsuit record](https://www.accessibility.com/digital-lawsuits/cristian-grammarly-02/03/2021)
- [grammarly.com accessibility report — Web Accessibility Checker](https://web-accessibility-checker.com/en/report/grammarly.com)
- [Grammarly's color-coded AI suggestions show what needs fixing — Engadget](https://www.engadget.com/2019-07-16-grammarly-color-coded-ai-suggestions.html)
- [Grammarly color-codes its suggestions for easier classification — TechSpot](https://www.techspot.com/news/80977-grammarly-color-codes-suggestions-easier-classification.html)
- [Explore How Grammarly Editor Suggestions Work — Grammarly Engineering](https://www.grammarly.com/blog/engineering/how-suggestions-work-grammarly-editor/)
- [Accepting Multiple Suggestions at Once — Grammarly Engineering](https://www.grammarly.com/blog/engineering/accepting-multiple-suggestions/)
- [Introducing Embrace — Grammarly Engineering](https://www.grammarly.com/blog/engineering/introducing-embrace/)
- [Grammarly UX Case Study — Baymard Institute](https://baymard.com/ux-benchmark/case-studies/grammarly)
- [Grammarly brand colour codes](https://brandpalettes.com/grammarly-colors/)
- [NVDA PR #11787 — handle aria-invalid="spelling,grammar"](https://github.com/nvaccess/nvda/pull/11787)
- [aria-invalid support data — a11ysupport.io](https://a11ysupport.io/tech/aria/aria-invalid_attribute)
- [Accessibility — Tiptap Editor Docs](https://tiptap.dev/docs/guides/accessibility)
- [Web Content Accessibility Guidelines (WCAG) 2.2 — W3C](https://www.w3.org/TR/WCAG22/)
