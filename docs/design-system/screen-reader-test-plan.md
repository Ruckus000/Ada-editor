# Screen reader test plan

**Status: automated for Orca; written but unrun for NVDA and VoiceOver.**

All six steps below now run as a gate — `node scripts/verify-orca.mjs` — rather
than as a manual checklist. It drives Orca and asserts on what it actually says,
and it found a real defect the tree-level gate had missed.

NVDA and VoiceOver equivalents live in `tests/screen-reader/` and run in CI on
Windows and macOS runners. Both start, attach and drive; **all four assertions
still fail on both**. **JAWS is not covered** — commercial, licensed, and not
driven by Guidepup.

### Application activation — solved

The blocker was not activation code at all. **Playwright runs headless by
default, and Guidepup states plainly that "Screen Readers don't work against
headless browsers."** A headless browser has no window for `macOSActivate` to
bring forward, which is why VoiceOver read the Finder and NVDA announced a
single phrase, `blank`.

Two changes fixed it:

- `playwright.config.ts` spreads Guidepup's own `screenReaderConfig`, and both
  projects set `headless: false` explicitly.
- `open()` calls the fixtures' `navigateToWebContent()`, which does the OS-level
  activation, cancels stale interactions and injects a marker input so the
  screen reader listens to Playwright-driven events. This method is added by the
  Playwright fixture, not the base screen reader class — which is why grepping
  `VoiceOver.d.ts` for it earlier found nothing and led to it being removed.

**NVDA now reads the page, and the first assertion passes:** *"announces
severity as words, not colour"* — the central claim of this design system,
confirmed by a real screen reader on Windows.

Three assertions still fail on each platform (heading navigation, button names,
focus after applying a fix). Those are step counts and expected phrasing, and
need tuning against the transcripts each run uploads as an artifact. **Do not
relax them to go green** — they encode claims the design makes.

### Orca in CI: narrowed to one step, not yet explained

The gate passes 11 checks locally and fails on a GitHub runner. Three rounds
narrowed it to one step, and the gate now reports that step in about two
minutes instead of driving blind:

```
ok     Orca attached and spoke 2 phrase(s) on load
ok     activated the window titled "Ada-editor design system preview - Chromium"
ok     AT-SPI exposes the page content to assistive technology
ok     X input focus: 6291459 (the browser)
INPUT  four different keypresses produced no speech at all
```

So on a runner: Orca attaches, the right window is activated, the accessibility
tree is fully populated, and X input focus is on the browser — and synthetic
keypresses still produce nothing.

Things ruled out along the way, each by evidence rather than assumption: a
missing window manager (openbox is installed and running), an empty
accessibility tree (the AT-SPI probe passes), the wrong window (the title is
checked), and headless mode (this gate launches Chromium windowed — that was
the NVDA and VoiceOver cause, not this one).

An earlier version of this section concluded from that evidence that "XTEST
synthetic input is not reaching the renderer." That went further than the
evidence supports. XTEST events are indistinguishable from real input at the X
server, and `xdotool` would have errored had the extension been absent. Silence
is equally consistent with the keys arriving and **Orca** having nothing to say,
because its reading cursor never landed on the document — a different problem
with a different fix.

The gate now distinguishes the two rather than guessing between them. Orca's own
debug log records `PROCESS ATSPI_KEY_PRESSED_EVENT` for every key it is handed,
before it decides whether it has a handler; the marker appears 86 times in a
local passing run. The failure message now reports how many of the probe keys
Orca received:

- **more than zero** — input arrives and Orca stays silent, so this is Orca
  state (locus of focus, browse mode), not input delivery.
- **zero** — the keys never reach Orca's AT-SPI keyboard listener, so the
  keyboard grab is the problem.

That makes the next run decisive rather than another guess. If it still resists
after that, the recommendation stands: **drop the CI Orca job and keep
`verify-orca.mjs` as a local tool.** A permanently red job nobody trusts is
worse than an honest absence, and Linux screen reader evidence would then come
from local runs, which is where it has always actually come from.

It did, on its first run: **Orca received none of the four probe keys.** So
delivery is the problem — the keys never reach Orca's AT-SPI keyboard listener —
and the reading-cursor explanation is ruled out alongside the renderer one.

#### The local baseline, for comparison

Recorded so the CI dump is a comparison rather than a one-sided list. A
`X display and AT-SPI environment` step in the workflow prints the same facts on
every run, pass or fail.

```
os             Ubuntu 24.04.4 LTS (Noble Numbat)
orca           46.1-1ubuntu1
at-spi2-core   2.52.0-1build1
xvfb           2:21.1.12-1ubuntu1.6
registryd      1 running
X extensions   23, including XTEST, RECORD, XInputExtension, XKEYBOARD
GRABS ADDED    677
```

Both displays run the same `Xvfb :99 -screen 0 1600x1000x24` line from the same
script, so if the extension lists match, the display is not the difference and
the next suspect is the registry or Orca's own grab setup. `GRABS ADDED` is the
sharper of the two numbers: Orca cannot be handed a key it never asked for, and
677 grabs locally against zero in CI would say it never asked.

#### The comparison, run

| | local (gate passes) | CI runner (gate fails) |
|---|---|---|
| OS | Ubuntu 24.04.4 | Ubuntu 24.04.5 |
| orca | 46.1-1ubuntu1 | 46.1-1ubuntu1 |
| at-spi2-core | 2.52.0-1build1 | 2.52.0-1build1 |
| xvfb | 2:21.1.12-1ubuntu1.6 | 2:21.1.12-1ubuntu1.6 |
| at-spi2-registryd | running | running |
| X extensions | 23 | 23, identical list |
| XTEST / RECORD / XInputExtension / XKEYBOARD | all present | all present |

**The display is not the difference.** Identical extension list, identical
packages, same `Xvfb` invocation from the same script. That was the predicted
outcome and it rules the hypothesis out rather than confirming it.

The runner also reported `GRABS ADDED: 157` and `listeners registered: 38`, so
**Orca did ask for keys** — the "it never asked" explanation is out too. Note
the local figure of 677 is *not* a fair comparison: grabs accumulate as Orca
adds and removes them on each focus change, and the CI run aborts at the input
probe long before a local run finishes. What matters is that the number is not
zero.

So Orca registers its listeners, installs its grabs, and receives zero key
press events. Both ends are configured and the middle does not deliver. The
workflow now uploads Orca's full debug log as an artifact, because the counts
above are markers chosen in advance — which is exactly how the last two wrong
conclusions here were reached — and the log itself is the primary source.

#### The same moment in both environments

Every number reported from CI so far was measured at a different point in the
run than its local counterpart, which made the comparisons worthless — 157 grabs
in CI against 677 locally says nothing when one run aborts at the input probe
and the other carries on for another minute. The gate now prints a fingerprint
**at the input probe, on pass and on fail**, so the two are finally comparable.

Local baseline, from a passing run:

```
log 213842B · keys 4 · grabs 278 · Chromium script loaded
```

Against that, the CI figure already in hand is stark: the runner's *entire*
Orca debug log, for the whole job, is **20,795 bytes** — an order of magnitude
smaller than the local log has already grown to by the probe. The earlier
3.5 MB-versus-20 KB comparison overstated the gap (a full local run ends around
2.8 MB), but shrinking it to a like-for-like point does not make it go away.

`Chromium script loaded` is the sharpest of the four fields. Orca's browse-mode
handlers for `h` and the arrow keys live in `orca.scripts.toolkits.Chromium`. If
CI never loads that script, Orca has no handler for those keys whatever reaches
it — which would fit grabs being installed while no key events are processed.
**A hypothesis to test against the log, not a conclusion.**

The workflow now prints the Orca debug log into the job output rather than only
uploading it as an artifact, because the artifact cannot be read from the
session doing this work: its egress proxy rejects the Azure blob host GitHub
serves artifacts from. At CI size the whole log fits in the job log. It also
prints `/tmp/atspi-reg.log` and `/tmp/atspi-bus.log` — the AT-SPI registry's and
bus launcher's stderr, which `scripts/a11y-stack.sh` has been writing since the
beginning and which nothing has ever read.

#### A probe that was cut

An AT-SPI keystroke listener registered directly from `python3-gi`, with no Orca
involved, would have been more decisive than any of this. It is not in the repo
because it does not work: `register_keystroke_listener` returns `False` on the
local display where Orca reads happily, under every combination of sync flags
tried. A probe that fails on a known-good environment cannot be trusted to
diagnose a failing one, so it was dropped rather than shipped — it would have
reported the CI display as broken no matter what was true.

### Earlier dead ends, kept so they are not repeated

Four rounds removed four real blockers — a nonexistent action tag, a stale test
pattern, a missing per-project asset install, and tests that stepped the reading
cursor while expecting focus to move. Each was genuine, and the transcripts
attached to failures are what made each one findable.

**The open blocker is application activation, not the assertions.**

- **VoiceOver** is still reading the Finder: its whole transcript is
  `Finder guidepup-voiceover-preferences-macos-26 Volume`. `page.bringToFront()`
  raises a window inside the browser but does not make the browser the frontmost
  *application* on macOS, which is what decides where the VoiceOver cursor goes.
  The next thing to try is activating the app at the OS level — `osascript -e
  'tell application "..." to activate'` against whatever process Playwright's
  WebKit runs as — rather than another change to the assertions.
- **NVDA** was announcing a single phrase, `blank`, because Playwright launches
  Chromium without `--force-renderer-accessibility`. That flag is now set; its
  effect has not yet been read from a transcript.

Until a transcript shows a screen reader reading this page's content, the four
assertions are untested rather than wrong. Do not tune them: the guard in
`open()` fails first precisely so that nothing downstream reports a confident
result about an application it was never reading.

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

**Still unverified:** NVDA, JAWS and VoiceOver. Orca is a real screen reader
consuming the real platform accessibility API, but browse-mode behaviour differs
between implementations, and step 6 (keyboard trap) was not exercised.
