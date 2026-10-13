# Engine benchmark, the six real documents: results (P5 and P6)

October 13, 2026. Steps 3 and 4 of [the brief](../engine-benchmark-2026-10.md),
for the six real documents, scored by
[the adjudication standard](adjudication-standard.md) (#121). Word ran
first, and its results were written down before Ada produced any output on
these files.

*The documents stay outside this repository. Only counts, rule ids and spot
labels are published here, with no text from the documents.*

## The one-line verdict

**On six clean documents, Word said nothing at all. Ada made one wrong
claim and asked 32 questions, 27 of them about reading level and sentence
length. P5 was wrong in Ada's favour: one document with a wrong claim, not
two or more. P6 held.**

## What ran

- **The files:** D1–D6, rebuilt under the standard. Before the run, their
  SHA-256 matched the standard's lock, and the contested list's did too.
  Both checkers ran on copies, and the copies' hashes were unchanged
  afterwards.
- **Word:** Word for Mac 16.113.4, Tools > Check Accessibility, set up as
  in [the pack run](results-packs.md#what-ran). The dark-mode caveat
  applies, and every listed issue counts as an assertion.
- **Ada:** [`scripts/benchmark-ada.mjs`](../../../scripts/benchmark-ada.mjs).
  - The registered column is the engine at 7b2ce34.
  - Main's column is the engine at 3ccd873, which includes #111, #114,
    #117 and #120.
  - **The two outputs are identical.** None of the rules changed since
    registration fires differently on these six: no skipped heading, bare
    web address, "click here" link, layout table of sentences or default
    title.
- **D2's Word result is marked "status seen by the owner beforehand",** as
  the standard requires. The owner read Word's status on an earlier fixed
  copy before the rebuild.

## Word

On all six: "Looks good! No issues found." Every category was ticked:
- Hard-to-read text contrast;
- Missing alt text;
- Missing table header;
- Use of merged or split cells;
- No headings in document;
- Restricted access.

That's 0 assertions and 0 questions.

## Ada

The same at 7b2ce34 and at main:

| Doc | Assertions | Questions | The questions, by rule |
|---|---|---|---|
| D1 | 0 | 11 | long-sentence 8, reading-level 3 |
| D2 | 0 | 7 | reading-level 5, long-sentence 2 |
| D3 | 0 | 2 | form-blank 1 (contested), heading-unmarked 1 |
| D4 | **1**: table-no-header, "Blocks access" | 3 | reading-level 2, form-blank 1 (contested) |
| D5 | 0 | 6 | reading-level 3, heading-unmarked 2, long-sentence 1 |
| D6 | 0 | 3 | reading-level 2, long-sentence 1 |
| **All** | **1** | **32** (2 contested) | reading-level 15, long-sentence 12, heading-unmarked 3, form-blank 2 |

**How each finding was scored:**
- **D4's assertion is a wrong claim.** It's spot D4-t1-TABLE, criterion
  1.3.1. Both blind testers ruled it a layout table that reads in order: a
  form grid of labels beside blank fields. That's a pass under A18. The spot
  isn't contested: D4's contested spots are all fill-in underscores under
  1.1.1. So it isn't excluded.
- **Both form-blank questions are contested.** Each covers only blanks on
  contested G02 spots: 17 blanks in D3 and 24 in D4, every one on a listed
  paragraph. Under the standard's rule, a form-blank finding is excluded
  only when every blank it covers is contested.
- **D3's heading-unmarked question isn't contested.** It's on body
  paragraph 10. The contested spot with the same text is in a header
  (header2.xml), which is a different spot.
- **Reading level and long sentences** are conditions the standard rules
  `pass` (B34), and Ada asks them as questions. So they count toward P6, not
  P5.

## The predictions

| # | Registered | Result | Verdict |
|---|---|---|---|
| P5 | Ada asserts a failure on at least 2 of the 6, likely from bare web addresses or skipped headings. Word asserts at most 1 failure across all six | Ada asserts on 1 of the 6 (D4, table-no-header). Neither predicted source fired. Word asserts none | **Wrong** for Ada (fewer); holds for Word |
| P6 | Ada raises at least 3 questions per document on average. Word raises at most 1 | Ada averages 5.3 (32 across six, 2 of them contested; D3 has 2 and D4 has 3). Word raises none | **Holds** |

Taken with [the pack results](results-packs.md), all seven predictions have
now been scored. P1, P2, P4 and P5 were wrong; P3, P6 and P7 held.

## What this changes

- **The claim that holds:** on these files, Ada caught 16 of 31 planted
  rows to Word's 5, at the registered commit. On six clean documents, Ada
  made 1 wrong claim to Word's 0. Every number needs its caveats: planted
  rows are an upper bound, six documents are a small sample, and this is one
  build of Word.
- **Ada's one wrong claim is a layout table, again.** This time it's a form
  grid of short labels beside empty cells. The layout-table check (#117)
  only recognises tables of sentences, and its record names grids with short
  cells as a known miss. A change for form grids would go through decision
  5. It isn't made here.
  *Later the same day: it went through, judged on the second test:
  [decision 5, form grids](decision-5-form-grid.md). The P5 result above
  stays as scored.*
- **Ada's cost is mostly the AAA advice.** 27 of its 32 questions are
  reading level and sentence length, which no A or AA failure requires.
  Decision 5's last paragraph lists rules that catch no row and only ask on
  clean documents as candidates for deletion. `reading-level` and
  `long-sentence` meet that test, but the brief exempts AAA rules by
  design, so they stay. They're listed so the owner can see the cost.
- **`img-long-description`** didn't fire on the six. It stays a provisional
  candidate, as
  [its record](decision-5-plot-grading-plan.md#found-along-the-way-img-long-description-itself)
  says. It has now caught no row, and its only cost is one question on the
  good twin.
- **Decision 5's second test, on the six, for the changes since
  registration:**
  - layout tables (#117) and the title check (#120) add no assertion;
  - the three regrades (#111, #114) don't fire.

  All of them hold.
- **Word's silence is the finding.** On documents fixed by published tests,
  Word for Mac 16.113.4 had nothing to say. The six are clean, so silence is
  right. The pack showed the other side: on the planted failures, it caught
  5 of 31.

## Not checked

- Word for Windows, or Word on the web.
- Word with a light page. No contrast condition arises on these six.
- What Ada's importer doesn't read: headers and footers other than the last
  section's default ones, footnotes, hidden text and text boxes. A failure
  there would be a miss, not a wrong claim. It doesn't change P5 or P6.
