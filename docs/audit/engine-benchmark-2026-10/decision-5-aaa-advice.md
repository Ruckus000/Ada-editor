# Decision 5: the AAA writing advice

October 13, 2026. This is the fifth rule change put through
[decision 5](../engine-benchmark-2026-10.md#5-from-now-on-a-rule-has-to-earn-its-place).
The previous one was [form grids](decision-5-form-grid.md).

## The verdict

**It ships, judged on the second test.** The change only turns many
questions into fewer, and nothing about it can make an assertion.
Decision 5 can't decide this kind of change on its own:
- **The first test can't apply.** The answer key has no AAA rows, so no
  change to an AAA rule can catch one.
- **The brief exempts AAA rules from deletion** "by design".

So the owner chose the change, and decision 5 measured it:
1. **Kept as they are:** cost published, nothing changes.
2. **One question per document (chosen).**
3. **Off by default.**
4. **Deleted.**

## What was costly

In [the six-document run](results-six.md), `reading-level` and
`long-sentence` raised 27 of Ada's 32 questions on clean documents. Both
are AAA (3.1.5) advice, which the standard rules `pass` (B34). Each fired
once per item:
- `reading-level` once per paragraph above grade 12;
- `long-sentence` once per sentence over 35 words.

That gave D1 alone 11 questions.

## The change

Each of the two rules now asks **at most once per document**. The way
`form-blank` already does it is the model: whether to simplify the writing
is one decision for the writer, as how a form is filled in is.
- **The title gives the count:** "3 sentences run over 35 words", or "2
  passages read above grade 12".
- **The explanation names the first:** "Passage reads at about grade 20, the
  first of 2."
- **Go to text** selects the first passage.
- **The finding's id is the rule's own,** so one dismissal covers the
  document and survives edits to the passages.
- **What's detected is unchanged.** It's still a prose rule (on blur and
  Recheck, never on a keystroke run), still graded Advisory, with the same
  thresholds.
- **`checkDocument`'s `perPassage` option** keeps one finding per passage.
  The parity gate uses it to go on checking every flagged passage against
  the spike.

**What's lost:**
- Only the first passage is underlined, and Go to text doesn't step
  through the rest. `form-blank` made the same trade, and the upgrade
  trigger is the same: writers asking to step through each one.
- Dismissals made earlier, one passage at a time, no longer match. Those
  documents show the one combined question once.

## The runs

Both columns come from
[`scripts/benchmark-ada.mjs`](../../../scripts/benchmark-ada.mjs). Main is
cd93aa2, after the form-grid change.

**The four pack files:** byte-identical between main and the branch. No
pack passage trips either rule.

**The six:** the copies' hashes matched the standard's lock before and
after. Counts only:

| Doc | Main: questions | Branch: questions | What changed |
|---|---|---|---|
| D1 | 11 | 2 | reading-level 3 → 1, long-sentence 8 → 1 |
| D2 | 7 | 2 | reading-level 5 → 1, long-sentence 2 → 1 |
| D3 | 2 | 2 | — |
| D4 | 4 | 3 | reading-level 2 → 1 |
| D5 | 6 | 4 | reading-level 3 → 1 |
| D6 | 3 | 2 | reading-level 2 → 1 |
| **All** | **33** | **15** | the AAA advice goes from 27 to 9 |

Main's 33 includes the form-grid question on D4. Assertions are 0 on every
document in both columns.

**The registered P6 result stays as scored,** at 7b2ce34: 5.3 questions per
document, which held. On main with this change, it's 2.5.

**The other checks:**
- **`verify-rules`:** the new case covers 3 long sentences becoming 1
  finding, with the count, the first passage and a stable id. `perPassage`
  keeps 3. The reading-level count is checked too.
- **One seed count changed:** the hearing notice goes from 3 advisories to
  2.
- **The parity gate passes unchanged,** using `perPassage`.
- **`verify-a11y-app` passes.**
- **In the preview,** the hearing notice shows one reading-level card, "2
  passages read above grade 12", and Go to text selects the first.

## Considered and cut

- **Off by default, or deleted.** Both remove the advice. Plain language is
  expected of much public-sector writing, and Help, the home page's sample
  and the accessibility page all describe it. The owner chose to keep it.
- **One combined "writing advice" question** for both rules. A long
  sentence and a dense paragraph call for different fixes.
- **`document-no-h1`, the third AAA rule.** It already fires at most once
  per document, and it didn't fire on the six.
