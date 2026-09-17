# Screen reader test plan

**Status: not yet run.** Nothing in this repository has been driven with a
screen reader. `scripts/verify-a11y.mjs` verifies the accessibility *tree* —
the roles, names, and live regions the browser hands assistive technology — but
what a screen reader does with that tree is a separate question, and the only
way to answer it is to run one.

This is the script for doing that. It needs no accessibility expertise: every
step gives the keys to press and the announcement to expect, so a mismatch is
unambiguous. Record results in the table at the bottom and open an issue for
any **FAIL**.

## Setup

```bash
npm install
npm run preview        # serves design-system/ at http://127.0.0.1:8080
```

The page must be served over HTTP. Opened from disk, Chromium blocks the
hydration bundle as cross-origin and the page will be inert — a confusing
failure that is nothing to do with accessibility.

Test on the pairings that reflect real usage:

| Screen reader | Browser | Platform |
|---|---|---|
| NVDA (free) | Firefox | Windows |
| JAWS | Chrome | Windows |
| VoiceOver | Safari | macOS |

---

## 1. The findings are reachable by heading

The design claims the issue list is the canonical interface and that heading
navigation is the primary path to it. This is the test of that claim.

| Step | Keys | Expected |
|---|---|---|
| 1.1 | `H` repeatedly (VO: `VO`+`Cmd`+`H`) | Moves through: "Design system preview" (h1), "Accessibility findings, 4" (h2), then each finding title (h3) |
| 1.2 | — | Every one of the four finding titles is reachable this way |
| 1.3 | `1` … `3` (NVDA/JAWS) | Jumps by heading level; h3s are the findings |

**FAIL if** any finding title cannot be reached by heading navigation. The whole
"list is canonical" design rests on this.

## 2. Findings announce their severity as words, not colour

| Step | Keys | Expected |
|---|---|---|
| 2.1 | Navigate to the first finding | Announces the severity label — "Blocks access" — plus "Fails Level A" and the criterion from the hidden text |
| 2.2 | Continue through all four | "Blocks access", "Fails AA", "Advisory", "Needs your call" |

**FAIL if** severity is not announced at all. Colour is not available to this
user and the underline shape is not exposed in the tree — the words are the
only channel that survives.

## 3. Buttons are distinguishable from one another

| Step | Keys | Expected |
|---|---|---|
| 3.1 | `B` repeatedly (VO: `VO`+`Cmd`+`J`) | Each button announces with its finding: "Dismiss Image has no alternative text", not a bare "Dismiss" |
| 3.2 | Open the elements/forms list (NVDA `Ins`+`F7`, JAWS `Ins`+`F5`) | Six distinctly-named buttons, no duplicates |

**FAIL if** two buttons share a name. This is checked automatically in
`verify-a11y.mjs`; step 3.2 confirms the check matches lived experience.

## 4. Outcomes are announced

The one that matters most. A fix applied in silence is a fix the user cannot
confirm.

| Step | Keys | Expected |
|---|---|---|
| 4.1 | Tab to "Apply fix" on the link-purpose finding, press `Enter` | Announces "Applied fix for Link text is not meaningful out of context." then the remaining count |
| 4.2 | — | The count distinguishes automated findings from ones needing review, e.g. "2 findings remaining. 1 still needs your review." |
| 4.3 | Dismiss findings until only `manual` ones remain | "No automated findings left. 1 still needs your review." |
| 4.4 | — | At no point is the document described as compliant, complete, or done |

**FAIL if** 4.4 is violated. That is a correctness failure, not a wording nit.

## 5. Arrow keys do not fight the screen reader

The design assumes arrow keys are inert in browse mode and that nothing depends
on them. **This step tests the assumption the architecture rests on.**

| Step | Keys | Expected |
|---|---|---|
| 5.1 | In browse mode, press `↓` over the findings | The screen reader reads the next line. Focus does **not** jump between cards |
| 5.2 | — | No double-speaking, no swallowed keys, no stuck focus |
| 5.3 | `F6` | Moves between the document and findings regions, announcing the region |

**FAIL if** 5.1 shows the arrow handler firing in browse mode, or 5.3 does not
work. `F6` is the affordance that must work for AT users; arrows are a
sighted-keyboard convenience.

## 6. No keyboard trap

| Step | Keys | Expected |
|---|---|---|
| 6.1 | Tab from the document through the entire findings list | Focus exits past the last button; it never cycles |
| 6.2 | `Shift`+`Tab` back | Returns the way it came |

---

## Results

| Date | Screen reader / browser | Tester | 1 | 2 | 3 | 4 | 5 | 6 | Notes |
|---|---|---|---|---|---|---|---|---|---|
| | NVDA / Firefox | | | | | | | | |
| | JAWS / Chrome | | | | | | | | |
| | VoiceOver / Safari | | | | | | | | |

Until at least one row is filled in, treat every accessibility claim in this
repository as **reasoned but unverified at the assistive-technology layer**.
