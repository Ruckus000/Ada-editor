# Engine benchmark, the planted packs: results

October 12, 2026. Steps 3 and 4 of [the brief](../engine-benchmark-2026-10.md),
for the four planted files only. Word ran first, and its results were written
down before Ada produced any output on these files.

**Not yet run:** P5 and P6, the six real documents. They're fixed, and they
wait for the owner to confirm each one is clean. No checker has opened them.

## The one-line verdict

**Ada caught 16 of the 31 rows and Word 5. Word's checker in this build
caught fewer rows than Microsoft's own list says, and Ada made more
assertions than predicted, not fewer. Ada also made one wrong claim on the
good twin: it calls a layout table with no header row a barrier. Of the
seven predictions, three were wrong, two held, and two wait.**

## What ran

- **Word:** Word for Mac 16.113.4 (build 16.113.26100421), through Tools >
  Check Accessibility, which in this build opens the "Accessibility
  Assistant" pane. It ran on copies of the files, and checksums afterwards
  show Word changed none of them. Word's own record is in
  [`word-16.113.4.md`](word-16.113.4.md).
- **Ada:** the engine as of 7b2ce34, the commit that registered the brief,
  extracted with `git archive`. It ran through
  [`scripts/benchmark-ada.mjs`](../../../scripts/benchmark-ada.mjs): the
  importer, `checkDocument`, plus the header and footer picture check the
  desk adds. Output: [`ada-7b2ce34.json`](ada-7b2ce34.json).
- **Ada today:** main at 516643b, which has the three regrades (#111, #114),
  as its own column. Output: [`ada-516643b.json`](ada-516643b.json).

**Where this run departs from the brief:**
- **Word's automatic updates weren't switched off.** The build didn't
  change during the run.
- **Word showed pages in dark mode.** Switching the page to light couldn't
  be done without taking over the screen, so whether a light page changes
  Word's contrast result (rows 25 and 29) wasn't tested.
- **This build's pane has no errors, warnings or tips.** It lists issues
  by category. Every listed issue is counted as an assertion.
- **The scoring rule is applied to both checkers.** The brief counts a Word
  tip only when the condition it names is true. Here that test is applied
  to Ada too, which is the stricter reading for Ada. Without it, Ada's
  fill-in-blank finding would count for row 22. Its first "blank" is a seat
  "[ ]" in a seating plan drawn with characters, so the condition it names
  is false.

## The scorer, checked first

Each row's passage comes from `build-packs.bas`. A finding is matched to a
row by the heading it sits under, as the runner reports it:
- rows 1 and 2 share "Public comment", and are told apart by the flagged
  text;
- row 10 sits before any heading;
- row 4's watermark is a header picture.

All 29 passages were found in the bad pack's import. On the good twin,
nothing is planted, so every finding there counts as a cost, not a catch.

## Row by row

| # | Plant | Word | Ada (7b2ce34) | Ada (main) |
|---|---|---|---|---|
| 1 | Floated text box, stored out of order | — | — | — |
| 2 | Section title in bold, Normal style | — | asks | asks |
| 3 | List typed with "•" | — | — | — |
| 4 | "DRAFT" only in a watermark picture | **fails** | **fails** | **fails** |
| 5 | Chart with alt "Chart" | — | asks | asks |
| 6 | "Use the form on the right" | — | — | — |
| 7 | No heading, Title "Document1" (own file) | — | — | — |
| 8 | "✓" column with no text | — | — | — |
| 9 | Photo with alt "IMG_0412.jpg" | **fails** | asks | asks |
| 10 | "A G E N D A" | — | — | — |
| 11 | Two columns made with tabs | — | — | — |
| 12 | Agenda lined up with tabs | — | — | — |
| 13 | Divider, no alt, not decorative | **fails** | **fails** | **fails** |
| 14 | Divider with alt "line" | — | asks | asks |
| 15 | "Present:" in Heading 2 | — | — | — |
| 16 | Layout table with a header row | — | — | — |
| 17 | Layout table read in the wrong order | — | **fails**¹ | **fails**¹ |
| 18 | "Click here" | — | **fails** | asks |
| 19 | Photo with no alt | **fails** | **fails** | **fails** |
| 20 | Form field with no title | — | — ² | — ² |
| 21 | "𝐍𝐎𝐓𝐈𝐂𝐄" in math bold letters | — | — | — |
| 22 | Seating plan drawn with characters | — | — ³ | — ³ |
| 23 | Link shown by colour alone | — | — | — |
| 24 | "Items in red need a vote" | — | asks | asks |
| 25 | White text over a light photo | — | **fails**⁴ | **fails**⁴ |
| 26 | Phone number in three untitled fields | — | — ² | — ² |
| 27 | Linked logo, no alt | **fails** | **fails** | **fails** |
| 28 | Data table, header row not marked | — | **fails** | **fails** |
| 29 | Grey text, 2.8:1 | — | **fails** | **fails** |
| 30 | Spanish document set to English (own file) | — | asks | asks |
| 31 | Spanish paragraph, language not set | — | asks | asks |

1. **Row 17:** the finding is "Table has no header cells", which is true but
   isn't the planted failure. Adding header cells to a layout table, as it
   suggests, wouldn't fix the reading order. It counts under the brief's
   rule, and is the weakest catch here.
2. **Rows 20 and 26:** Ada imports form fields as plain text and says so in
   an import note ("4 Word form fields imported as plain text"). That's a
   barrier the export removes, which the brief reports but doesn't count.
3. **Row 22:** see the scoring rule above.
4. **Row 25:** Ada measured white text against the white page (1:1), not
   against the photo. The answer is right, for a reason that would also flag
   white text over a dark photo. That case wasn't tested.

**Totals:**

| | Rows caught | As assertions | As questions |
|---|---|---|---|
| Word | 5 | 5 | 0 |
| Ada, 7b2ce34 | 16 | 9 | 7 |
| Ada, main | 16 | 8 | 8 |

## The good twin and the two single files

- **Word:** "No issues found" on the good twin, row 7 and row 30. On row 30
  that is a miss.
- **Ada on the good twin:**
  - **One wrong assertion.** "Table has no header cells", graded Blocks
    access, on the contact block. That's row 16's fixed version: a layout
    table that correctly has no header row.
  - **One question.** Whether the chart needs a long description. Its alt
    text already holds the data in a sentence.
- **Ada on row 7:** nothing. On row 30, it asks whether the document's
  language is right.

## The predictions

| # | Registered | Result | Verdict |
|---|---|---|---|
| P1 | Word catches exactly the 8 documented rows: 9, 13, 19, 20, 26, 27, 28, 29, all as assertions | 5 rows: 4, 9, 13, 19, 27, all assertions. It missed 20 and 26 (this build's pane has no form-field category), 28 (its table-header check was ticked) and 29 (its contrast check was ticked; dark-mode caveat above). It caught row 4, which isn't on Microsoft's list | **Wrong** |
| P2 | Ada catches 12 to 14 rows, counting questions. Firm: 2, 5, 9, 13, 14, 18, 19, 24, 28, 29, 30, 31; uncertain: 21 and 27 | 16 rows. All 12 firm rows were caught; of the uncertain ones, 27 was caught and 21 wasn't. Unpredicted: 4 (via the header check), 17 (wrong diagnosis) and 25 (measured against the page) | **Wrong** (more) |
| P3 | At least 10 rows caught by neither; 15 if Word shows only its documented rules | 15 rows: 1, 3, 6, 7, 8, 10, 11, 12, 15, 16, 20, 21, 22, 23, 26 | **Holds.** The condition behind the exact list wasn't met: Word showed fewer than its documented rules |
| P4 | Counting assertions only, Word catches more rows than Ada (8 against 5 or 6) | Ada 9, Word 5. On main, Ada 8 | **Wrong** |
| P5 | Ada asserts a failure on at least 2 of the 6 clean documents | Not run | **Waits** for the owner's confirmation |
| P6 | Ada raises at least 3 questions per clean document | Not run | **Waits** |
| P7 | Row 7 is caught by neither checker | Neither caught it | **Holds** |

## What this changes

- **"Ada catches more than Word" holds on these files even counting
  assertions alone:** 9 rows against 5. Any published claim still has to
  say the packs are planted, one failure per passage, so recall here is an
  upper bound (the brief's first limitation), and that P5 and P6 haven't
  run.
- **`table-no-header` is the first candidate for decision 5.** It made the
  only wrong assertion on the good twin, and its row 17 catch names the
  wrong failure. The rule's own fix text already allows "Turn into text"
  for layout tables, but it grades every headerless table as Blocks
  access. A change goes through decision 5's two tables. *Later the same
  day: it went through, and passed:
  [decision 5, layout tables](decision-5-table-layout.md).*
- **Plot and grading plans** went through decision 5 next and didn't ship:
  they move no row. That record also lists `img-long-description` as a
  provisional candidate for deletion:
  [decision 5, plot and grading plans](decision-5-plot-grading-plan.md).
- **Row 7 (P7)** was caught by neither checker, as predicted. The title
  check is still the next change for decision 5, as the brief planned.
- **Word's checker changed under the brief.** This build's assistant pane
  is not the checker Microsoft's rules page describes. A comparison quoting
  Word has to name the build.

## Not checked

- Word with a light page (rows 25 and 29).
- Word for Windows, or Word on the web.
- The six real documents (P5, P6).
- The pack check in `verify-rules.mjs` (step 4's first half). The runner
  here is the second half.
