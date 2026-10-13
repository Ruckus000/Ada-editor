# Decision 5: layout tables

October 12, 2026. This is the first rule change put through
[decision 5](../engine-benchmark-2026-10.md#5-from-now-on-a-rule-has-to-earn-its-place)
of the engine benchmark. It came first because the owner asked for it after
the packs ran. The brief's own first candidate, the title check (step 6),
still waits.

## The verdict

**Both tests hold.**
1. The branch catches row 16 (F46), which main misses.
2. It makes no new assertion on the good twin: the one it made there is gone.
   On the six clean documents it can't make one either, because the change
   only removes assertions (below).

## What was wrong

`table-no-header` asserted "Blocks access" on every table with no header
cell. On the good twin, that included the Contact block. That block is a
correct layout table: two sentences beside two sentences, with no header row.
It was Ada's only wrong assertion in [the pack results](results-packs.md).

Its catch on row 17 (F49, a layout table read in the wrong order) also named
the wrong failure. Adding header cells, as it suggested, wouldn't fix the
order.

## The change

A table **looks like layout** when at least two cells have text and every
cell with text has four words or more. Header labels and data values are
short, such as "Fee", "$40", "Lead" and "Monday", so one short cell makes a
table read as data.

- **A table that looks like data, with no header cell:** `table-no-header`,
  "Blocks access", unchanged.
- **A table that looks like layout:** the new `table-layout`, "Needs your
  call". It has no Apply fix. The card offers Turn into text, Go to table and
  Dismiss. It asks one of two questions:
  - **No header cells.** A screen reader reads the table row by row, so check
    the text makes sense in that order, or turn it into text. This is F49,
    and 1.3.2.
  - **Header cells.** If it only lays text out, the header cells are wrong,
    and it should be turned into text. This is F46, and 1.3.1.

**Why it can't add an assertion anywhere:** `table-no-header` now fires on a
strict subset of the tables it fired on before, and `table-layout` only ever
asks. That holds for any document, the six clean ones included.

The owner ruled that a layout table without header cells gets a question,
not silence. That keeps row 17 with the right diagnosis. The cost is one
question on the good twin.

## The two pack tables

Both columns come from
[`scripts/benchmark-ada.mjs`](../../../scripts/benchmark-ada.mjs) on the
four pack files.
- **Main** is b437271. Its engine is unchanged since 516643b, and re-running
  it reproduced [`ada-516643b.json`](ada-516643b.json) byte for byte.
- **The branch** output is [`ada-table-layout.json`](ada-table-layout.json).

Only the rows that change are shown. Every other row is the same as in the
pack results.

| # | Plant | Main | Branch |
|---|---|---|---|
| 16 | Layout table with a header row (F46) | — | **asks** |
| 17 | Layout table read in the wrong order (F49) | **fails**, wrong diagnosis | **asks**, right diagnosis |
| 28 | Data table, header row not marked (F91) | **fails** | **fails** |

| | Rows caught | Assertions | Questions |
|---|---|---|---|
| Main | 16 | 8 | 8 |
| Branch | 17 | 7 | 10 |

**The good twin:**

| | Assertions | Questions |
|---|---|---|
| Main | 1, the Contact table as "Blocks access" | 1, the chart's long description |
| Branch | 0 | 2, the chart, and the Contact table's reading order |

The row 7 and row 30 files are unchanged: nothing on row 7, and one
question on row 30.

## What else was checked

- **Parity gate** (`measure-engine.mjs`): it passes. `table-layout` fires 0
  times on the 28-document corpus. The corpus's 4 `table-no-header` firings,
  grids of avatars with short names, are unchanged.
- **`verify-rules.mjs`:**
  - a unit check: a prose table, with and without header cells, a header
    column, one short cell, an empty table, and a seed-style data table;
  - a pack check: every table in both packs, by the heading above it. This
    is the start of step 4's pack check, for the table rows only.
- **The editor:** a newly inserted table is empty, so it still gets the
  blocker that `EditorScreen` makes the active card. The seeds' only table
  has a header row and short labels, so it stays clean.

## Considered and cut

- **axe-core's and Firefox's layout-table test**, which uses one row, fewer
  than 10 cells, borders, 5 or more columns, and so on. Row 28 has 8 cells
  and verify-rules' "Day | Hours" table has 4, so a size test would demote
  real data tables. That test leans on borders, which the importer doesn't
  read: adding them means a schema change.
- **Downgrading `table-no-header` for every table.** Row 28 is a W3C failure
  (F91) and should stay asserted. A downgrade on its own also fails decision
  5's first test.
- **A full 31-row pack check.** That's step 4 of the brief, as its own
  piece of work.

## Known misses

- **Layout grids with short cells still get the blocker.** Examples are the
  walkthrough's grid of officials ("Mayor", "Vice Mayor") and the corpus's
  avatar grids. This is no worse than before.
  *2026-10-13: form grids (labels beside empty cells) now ask instead:
  [decision 5, form grids](decision-5-form-grid.md).*
- **A data table with long cells and no header row now asks instead of
  failing.** An example is agenda items beside long descriptions. Its
  question still says to turn on Header row if it holds data.
- **P5 and P6 haven't run.** When the six documents are confirmed, the
  registered run still uses 7b2ce34. This change's questions on them get
  counted then, as cost.
