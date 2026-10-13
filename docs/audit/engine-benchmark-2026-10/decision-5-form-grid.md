# Decision 5: form grids

October 13, 2026. This is the fourth rule change put through
[decision 5](../engine-benchmark-2026-10.md#5-from-now-on-a-rule-has-to-earn-its-place),
after [layout tables](decision-5-table-layout.md),
[plot and grading plans](decision-5-plot-grading-plan.md) and
[the title check](decision-5-document-title.md).

## The verdict

**Judged on the second test, it holds, so it ships.** The change only turns
an assertion into a question, and no pack row has a form grid. So the first
test can't hold. The owner ruled that it's judged under the brief's
2026-10-12 addition, which says the first test "can't hold for a change that
only turns assertions into questions" and that such a change should show the
second.

**Designed from D4.** This change was made after seeing Ada's wrong claim on
D4 in [the six-document run](results-six.md). D4 no longer counts as unseen
evidence for this check. The scored P5 result, at 7b2ce34, stays as it is.

## What was wrong

In the six-document run, Ada's one wrong claim was `table-no-header`, graded
"Blocks access", on D4's only table. Both blind testers ruled that table a
layout table that reads in order, a form grid, and it passes under A18.

Its shape is 14 rows by 4 columns:
- Column 1 holds labels of one or two words, and column 3 sometimes does.
- Columns 2 and 4 are empty in every row. They're the fields to fill in,
  drawn with cell borders.
- There's no header row.

`table-layout` (#117) only recognised tables of sentences, so this grid fell
through to the blocker. #117's record names grids with short cells as a
known miss.

## The change

A table **looks like a form grid** when:
- at least one grid column is empty in every row;
- and at least 3 rows have text.

Columns are counted with prosemirror-tables' `TableMap`, so a merged cell
counts against every column it covers.

A form grid goes to `table-layout` ("Needs your call"), as layout tables of
sentences already do. The owner ruled in #117 that a layout table is asked
about, not ignored.
- **The question it asks:** a screen reader reads a table row by row, so
  check that each label comes just before its field.
- **With header cells,** the F46 version asks whether they belong there.
- **`table-no-header`'s text** is unchanged.

**What stays a blocker, by test:**
- row 28's fee table (F91), and "Day | Hours";
- a column of ✓ with some blanks;
- the walkthrough's grid of officials;
- a label merged across the blank column;
- a table with fewer than 3 rows of text.

The last one matters for the editor. A newly inserted table is empty, and
one being typed a column at a time keeps its blocker.

**Why it can't add an assertion anywhere:** `table-no-header` fires on a
strict subset of the tables it fired on before, and `table-layout` only
ever asks.

## The runs

Both columns come from
[`scripts/benchmark-ada.mjs`](../../../scripts/benchmark-ada.mjs). Main is
f1afb3c.

**The four pack files:** byte-identical between main and the branch, and
main reproduces [`ada-document-title.json`](ada-document-title.json). No
pack table is a form grid.

**The six:** the copies' hashes matched the standard's lock before and
after. Main reproduces the #122 run. Counts only:

| Doc | Main: assertions / questions | Branch: assertions / questions |
|---|---|---|
| D1 | 0 / 11 | 0 / 11 |
| D2 | 0 / 7 | 0 / 7 |
| D3 | 0 / 2 | 0 / 2 |
| D4 | 1 / 3 | **0 / 4** |
| D5 | 0 / 6 | 0 / 6 |
| D6 | 0 / 3 | 0 / 3 |

On D4, `table-no-header` (blocker) became `table-layout` (Needs your call).
Nothing else changed.

**The other checks:**
- `verify-rules` passes, with the cases above.
- The parity gate passes: the corpus has no form grid.
- `verify-a11y-app` passes, including the insert-table flow.
- **In the preview:**
  - a pasted grid of made-up labels showed the "Needs your call" card;
  - a new table without a header row, with one cell typed, still showed
    "Blocks access".

## Considered and cut

- **Cells holding only "___" counted as empty.** No table seen has them.
  D3's and D4's underscores are in paragraphs.
- **Asking for real form fields.** `form-blank` already asks how a
  document will be filled in.
- **Borders as a signal.** The importer doesn't read them.
- **A planted form-grid row.** Adding to the pack after seeing the results
  would be circular.

## Known misses

- **A form grid whose fields are lines of underscores** in the cells, not
  empty cells.
- **A form grid where every column has some text,** such as labels that
  alternate sides from row to row.
- **A headerless data table with an entirely empty column,** such as a
  sign-in sheet's blank signature column, now asks instead of failing. Its
  question still says to turn on Header row if it holds data.
