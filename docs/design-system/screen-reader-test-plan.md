# Screen reader test plan

**Status: automated for Orca and VoiceOver; NVDA written but not yet reaching the page.**

All six steps below now run as a gate — `node scripts/verify-orca.mjs` — rather
than as a manual checklist. It drives Orca and asserts on what it actually says,
and it found a real defect the tree-level gate had missed.

NVDA and VoiceOver equivalents live in `tests/screen-reader/` and run in CI on
Windows and macOS runners. **VoiceOver passes all four assertions and blocks the
branch; NVDA still fails all four and is non-blocking.** **JAWS is not covered** — commercial, licensed, and not
driven by Guidepup.

### Where the CI screen readers stand

Four early rounds removed four real blockers: a nonexistent action tag, a stale
test pattern, a missing per-project asset install, and tests that stepped the
reading cursor while expecting focus to move.

- **VoiceOver: working.** The harness used to focus the page by hand
  (`page.bringToFront()`, then `osascript` activation, then `Control+Home`). That
  got VoiceOver as far as "You are currently in a main." and no further.
  `@guidepup/playwright` ships `navigateToWebContent()` for exactly this: it
  goes through the Item Chooser into the web content and interacts with it.
  Separately, keystrokes (`Tab`, `Option+Tab`) never moved focus under
  VoiceOver, so the two control tests step the VO cursor instead, which is how
  VoiceOver users move through a page anyway. All four assertions then passed
  on two consecutive runs (CI run 35872345691, attempts 1 and 2).
- **NVDA: still says only `blank`**, with `--force-renderer-accessibility` set
  and with `navigateToWebContent()`. Its cause is undiagnosed, and no Windows
  machine has been available to look directly.

For NVDA, until a transcript shows it reading this page, the four assertions
are untested rather than wrong. Do not tune them: the guard in `open()` fails
first precisely so that nothing downstream reports a confident result about an
application it was never reading.

The manual steps below remain the specification; the gate automates them.

`scripts/verify-a11y.mjs` verifies the accessibility *tree* — the roles, names
and live regions the browser hands assistive technology. What a screen reader
does with that tree is a separate question, which is what this plan answers.

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

## Running Orca headlessly

Orca can be driven in a container with no audio device and no desktop, which is
how the run below was done. `scripts/a11y-stack.sh` brings the whole thing up.

```bash
sudo apt-get install -y --no-install-recommends \
  orca at-spi2-core xvfb speech-dispatcher speech-dispatcher-espeak-ng \
  espeak-ng dbus-x11 python3-gi gir1.2-atspi-2.0 xdotool

./scripts/a11y-stack.sh          # Xvfb + dbus + AT-SPI bus + registry
```

Three things are easy to get wrong:

- **Chromium must not be headless.** Headless does not expose the platform
  accessibility API. Run it windowed on the virtual display with
  `--force-renderer-accessibility`.
- **speech-dispatcher blocks without an audio sink.** With no device, `spd-say`
  hangs forever and Orca never starts speaking. An ALSA null device
  (`pcm.!default { type null }`) fixes it; the speech is discarded and captured
  from Orca's log instead.
- **Orca's speech is captured from `--debug --debug-file`**, which records every
  `SPEECH OUTPUT` line regardless of whether audio plays.

## Results

| Date | Screen reader / browser | Tester | 1 | 2 | 3 | 4 | 5 | 6 | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 2026-09-17 | Orca 46.1 / Chromium 131 | `verify-orca.mjs` | PASS | PASS | PASS | **FAIL → fixed** | PASS | PASS | Automated; 7 checks, reproducible |
| 2026-09-17 | NVDA / Chromium | CI run 5 | FAIL | FAIL | FAIL | FAIL | n/a | n/a | Screen reader starts; assertions fail |
| 2026-09-17 | VoiceOver / WebKit | CI run 5 | FAIL | FAIL | FAIL | FAIL | n/a | n/a | Screen reader starts; assertions fail |
| 2026-09-23 | VoiceOver / WebKit | CI run 35872345691 (×2) | PASS | PASS | PASS | PASS | n/a | n/a | Automated; passed on two consecutive runs; now blocking |
| | JAWS / Chrome | | | | | | | | not covered |

### What Orca actually said

**Step 1 — headings.** All four findings reachable, announced with level:

```
'Image has no alternative text heading level 3.'
'Link text is not meaningful out of context heading level 3.'
'Design system preview heading level 1.'
'Accessibility findings (4) heading level 2.'
```

**Step 2 — severity as words.** The central design claim, confirmed by a real
screen reader:

```
'Blocks access.'
'(Fails Level A, 1.1.1 Non-text Content)'
```

**Step 3 — button names.** All six distinct and self-describing:

```
'Dismiss Image has no alternative text push button.'
'Apply fix for Link text is not meaningful out of context push button.'
'Dismiss Link text is not meaningful out of context push button.'
```

**Step 5 — arrow keys.** The assumption the architecture rests on, confirmed:
pressing `Down` in browse mode made Orca *read the content* rather than firing
the roving-tabindex handler.

```
'List with 4 items.'  'Blocks access.'  'Image has no alternative text heading level 3.'
```

Arrows belong to the screen reader. Routing assistive technology through
headings and `F6` was the right call.

### Step 4 — the defect this run found

Activating a finding's button removed the card and **dropped focus to
`<body>`**. Orca then announced the document instead of the outcome, and the
user lost their place in the list:

```
'Ada-editor design system preview - Chromium'
'Ada-editor design system preview document web.'
```

The live region was correct the entire time
(`"Dismissed Image has no alternative text. 2 findings remaining. 1 still needs
your review."`) — which is exactly why the automated gate missed it. It checked
the announcement text, not focus continuity.

`IssueList` now restores focus to whatever takes the removed finding's place.
Re-run, Orca announces the next finding:

```
'Link text is not meaningful out of context.'
'"Clicking here" tells a user navigating by links nothing about the destination.'
```

`verify-a11y.mjs` now has a focus-continuity check covering this, verified to
fail when the fix is reverted. Note it must activate a **button inside** the
card: an earlier version pressed `Escape` on the card itself and passed even
with the fix removed, because React can reuse the `<li>` node.

**Still unverified:** NVDA and JAWS. Orca and VoiceOver are real screen readers
consuming the real platform accessibility API, but browse-mode behaviour differs
between implementations, and step 6 (keyboard trap) was not exercised.
