# Decision 5: the title check

October 13, 2026. This is step 6 of [the brief](../engine-benchmark-2026-10.md):
put the title check through
[decision 5](../engine-benchmark-2026-10.md#5-from-now-on-a-rule-has-to-earn-its-place).
P7 planned it as the first change to go through. It's the third, after
[layout tables](decision-5-table-layout.md) and
[plot and grading plans](decision-5-plot-grading-plan.md).

## The verdict

**Both tests hold.**
1. The branch catches row 7 (F25), which main and Word both miss.
2. It makes no new assertion on the good twin. On the six clean documents
   it can't make one either, by how "clean" is defined: see below.

## What was missing

Row 7 is a short notice with no heading. Its Title property is "Document1",
the name Word gives a new file.
- **Ada imports that title** and writes it into every export: the PDF's
  title, which viewers are told to show, and the HTML's `<title>`.
- **Before this change, no rule saw the title,** so Ada said nothing.
- **Word's checker** said "No issues found".

W3C's F25 names this as a failure of 2.4.2 (Level A). Its examples are
"Authoring tool default titles, such as … 'Untitled Document'", along with
empty text and placeholder text.

## The change

**`document-title`**, graded "Fails AA", checks the title an export would
write. That's the main heading's text if there is one (#106); otherwise the
stored title, which comes from Word's Title property or the file name. It
fails when that title is, in full, a default:
- "Document" and "Document1": Word;
- "Untitled", "Untitled document", "Untitled Page" and "Untitled 1":
  Google Docs, F25 and LibreOffice;
- "No Title" and "New Page 1": F25;
- "New document";
- blank, which the export would turn into "Untitled document".

"Document review schedule" and "Untitled land parcels" pass.

**How it behaves:**
- **It retracts on the live run** as soon as the main heading names the
  document.
- **The fix is the heading,** because the title follows it. The card offers
  Dismiss only, as for the other findings about the whole document.
- **Every caller passes the stored title:** the editor, the desk, the
  import preview and the benchmark runner. Without a stored title, only a
  main heading is judged. The parity corpus passes none, so the rule fires
  nowhere there.

**Why it asserts rather than asks:** the owner moved three rules to
"Needs your call" because WCAG's own Understanding pages don't make their
conditions failures. Here W3C names the condition as a failure, and the
check matches only the defaults it names.

## The two pack tables

Both columns come from
[`scripts/benchmark-ada.mjs`](../../../scripts/benchmark-ada.mjs).
- **The runner now passes the stored title** to the checker, as the desk
  does.
- **Main (d0fe224) run with this runner** reproduces
  [`ada-table-layout.json`](ada-table-layout.json) byte for byte, because
  main's checker ignores the extra option.
- **The branch's output** is [`ada-document-title.json`](ada-document-title.json).

| # | Plant | Word | Main | Branch |
|---|---|---|---|---|
| 7 | No heading, Title "Document1" (its own file) | — | — | **fails** |

Nothing else changes in any of the four files. The two packs and the
Spanish file each have a main heading that names them.

| | Rows caught | Assertions | Questions | Good twin: assertions / questions |
|---|---|---|---|---|
| Main | 17 | 7 | 10 | 0 / 2 |
| Branch | 18 | 8 | 10 | 0 / 2 |

"Main" here is main after the layout-table change (#117). The registered
run at 7b2ce34 is in [the pack results](results-packs.md).

## The six clean documents

Unlike the layout-table change, this one adds assertions, so the second
test can't rest on "it only asks". It rests on what a clean document is:
- **The six were fixed against every row, row 7 included,** and the owner
  confirms each one is clean. A confirmed-clean document has no default
  title.
- **The rule asserts only titles that F25 names as failures,** matched in
  full.

So if it asserts on one of the six, either the pattern matched something
that isn't a default, which is a bug in this check, or the document isn't
clean. When the six run, this branch's column gets run beside main's, and
either case is reported.

## Considered and cut

- **File names as titles.** F25 also names "Filenames that are not
  descriptive in their own right". Whether one is descriptive takes a
  person, and no pack row plants one.
- **Template placeholders,** such as "[meeting date]". F25 names
  placeholder text, but brackets also appear in real titles, and no pack
  row plants one.
- **A field to edit the title.** The title already follows the main
  heading, so the heading is the fix.

**The upgrade trigger** for both detection cuts: a real file that carries
one past this check.

## Known misses

- **A real but vague title,** such as "Agenda", passes. Whether a title
  identifies the document still takes a person, which the WCAG page now
  says.
- **A title in another language's default,** such as "Documento1", isn't
  matched.
