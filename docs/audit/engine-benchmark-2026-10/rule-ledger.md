# The rule ledger

October 14, 2026. Every checking rule, measured against
[decision 5](../engine-benchmark-2026-10.md#5-from-now-on-a-rule-has-to-earn-its-place).
Its last paragraph promised this list after the first run:

> rules that catch no row and only raise questions on clean documents are
> listed as candidates for deletion. They aren't automatically deleted.

Until now that list was written a rule at a time, inside other records. This
puts all 22 rules in one table, so the next question about a rule starts here.

## What was measured

- **The engine:** main at 06c833f, run with
  [`scripts/benchmark-ada.mjs`](../../../scripts/benchmark-ada.mjs) on the
  four pack files and the six clean documents.
- **The packs:** the output equals the pins in `scripts/verify-rules.mjs`
  (#128), which CI enforces.
- **The six:** the output is byte-identical to the
  [AAA advice](decision-5-aaa-advice.md) run (#125). Nothing since changes
  what Ada finds on them. As before, only counts and labels are published.

**Ada at main** catches 18 of the 31 rows (8 as assertions, 10 as
questions). It asserts nothing on the good twin or the six. It asks 2
questions on the good twin and 15 on the six.

## The ledger

**Grades:**
- **Blocker** means "Blocks access", and **violation** means "Fails AA".
  Both are assertions.
- **Manual** means "Needs your call", and **advisory** is advice. Both are
  questions.

**Rows** are [the brief's 31](../engine-benchmark-2026-10.md#1-use-w3cs-failure-list-as-the-answer-key-not-ours).
A dash means silent.

| Rule | Criterion | Grade | Rows caught | Good twin | Six | Status |
|---|---|---|---|---|---|---|
| `img-alt-missing` | 1.1.1 A | blocker | 4, 13, 19, 27 | — | — | Earns its place |
| `img-alt-suspicious` | 1.1.1 A | manual, advisory | 5, 9, 14 | — | — | Earns its place |
| `img-long-description` | 1.1.1 A | manual | — | 1 question | — | Candidate, ruled kept (#126) |
| `link-text-generic` | 2.4.4 A | manual | 18 | — | — | Earns its place |
| `link-text-raw-url` | 2.4.4 A | manual | — | — | — | Outside the key |
| `link-text-ambiguous` | 2.4.4 A | manual | — | — | — | Outside the key |
| `heading-skip` | 1.3.1 A | manual | — | — | — | Outside the key |
| `heading-empty` | 1.3.1 A | blocker | — | — | — | Outside the key |
| `heading-unmarked` | 1.3.1 A | manual | 2 | — | 3 questions (D3, D5) | Earns its place |
| `document-no-headings` | 1.3.1 A | manual | — | — | — | Outside the key |
| `document-no-h1` | 2.4.10 AAA | advisory | — | — | — | AAA, exempt |
| `document-title` | 2.4.2 A | violation | 7 | — | — | Earns its place (#120) |
| `document-language` | 3.1.1 A | manual | 30 | — | — | Earns its place |
| `language-of-parts` | 3.1.2 AA | manual | 31 | — | — | Earns its place |
| `colour-only-reference` | 1.4.1 A | manual | 24 | — | — | Earns its place |
| `contrast-minimum` | 1.4.3 AA | violation | 25, 29 | — | — | Earns its place |
| `table-no-header` | 1.3.1 A | blocker | 28 | — | — | Earns its place |
| `table-layout` | 1.3.1 A | manual | 16, 17 | 1 question | 1 question (D4) | Earns its place (#117, #124) |
| `table-merged-cells` | 1.3.1 A | advisory | — | — | — | Outside the key |
| `form-blank` | 1.3.1 A | manual | — | — | 2 questions (D3, D4), both contested | Candidate, ruled kept (2026-10-14) |
| `reading-level` | 3.1.5 AAA | advisory | — | — | 5 questions | AAA, exempt (#125) |
| `long-sentence` | 3.1.5 AAA | advisory | — | — | 4 questions | AAA, exempt (#125, #130) |

**What each status means:**
- **Earns its place:** it catches at least one row. Its questions on clean
  documents are its cost, and stay visible here.
- **AAA, exempt:** the brief exempts AAA rules by design, since they sit
  outside an A and AA list. Their cost is listed and decided by the owner.
- **Outside the key:** it catches no row because the key has none for it,
  and it's silent on the good twin and the six. Decision 5 can't credit it
  or charge it.
- **Candidate:** it catches no row, and its only output on clean documents
  is questions. That's the brief's test. A candidate is kept or deleted by
  the owner's ruling, and both candidates were kept.

## The candidate: `form-blank`

It asks about runs of underscores left for people to fill in, because they
can't be filled in on screen and are read as a run of lines.

- **On the packs:** it fires once, on the bad pack's seating plan. The
  [pack results](results-packs.md) show why that isn't row 22's catch: the
  "blank" it names is a seat drawn with characters.
- **On the six:** 2 questions, on D3 and D4. Both cover only spots the
  [adjudication standard](adjudication-standard.md) calls contested.
  - The standard passes typed fill-in blanks as structure (A29).
  - It calls underscore runs read as characters contested (G02, under
    1.1.1).
- **What it's for has no row in the key.** That's a form filled in
  digitally with typed blanks. W3C has no failure technique for it, as with
  `img-long-description`.

*Ruled 2026-10-14 by the owner: **kept, unchanged**, for the same reason
as `img-long-description` (#126):*
- *Its cost on clean documents is 2 questions, both on spots the
  standard couldn't decide. That isn't harm shown. It already asks only
  once per document.*
- *What it's for has no row in the key, so the benchmark can't weigh it
  either way. That's a form someone fills in on screen, or for a printed
  form, a way to respond that doesn't need the form. An accessibility aid
  isn't cut without a case showing it does harm.*
- *It comes back here if a real document shows it asking about something
  that isn't a fill-in blank.*
- *Narrowing it to the spots the standard doesn't contest wasn't an option.
  "Contested" is a ruling about a spot, and nothing in a document shows it.
  A narrowing fitted to D3 and D4 would also use up the six as unseen
  evidence.*

## Outside the key

Six rules can't be measured by this benchmark either way. The key is
W3C's list, and none of these conditions has a row:
- **`heading-skip`:** WCAG doesn't forbid a skipped level. The rule asks
  because PDF/UA-1 does.
- **`heading-empty`, `link-text-raw-url`, `link-text-ambiguous` and
  `table-merged-cells`:** no A or AA failure technique describes them. F84,
  link text that's unclear out of context, is AAA and left out.
- **`document-no-headings`:** row 2 (F2) covers a single section title made
  by formatting, which `heading-unmarked` catches. A document with no
  headings at all isn't planted.

Silence on the six and the good twin means none of them has shown a cost
on clean documents. It doesn't show they find anything.

**What would bring one of them in:** a W3C failure technique a Word
document can carry, added to the key as a dated row under the brief's
"What would change this". Never a row added so a rule can pass: that would
undo decision 1.

How often each fires on the parity corpus is in
[the spike's record](../rule-set-spike.md). That corpus is open-source
READMEs, not clerks' documents, so it doesn't enter this ledger.

## A snapshot

This ledger was measured at 06c833f, like every record in this folder, and
it isn't kept current by hand.
- **The living version of the "Rows caught" column** is the pack pins in
  `scripts/verify-rules.mjs`, which every rule change has to update.
- **When a question about a rule comes up,** measure again with
  `scripts/benchmark-ada.mjs` and add a dated ledger.
