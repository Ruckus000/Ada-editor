# Checking engine benchmark, October 2026

October 12, 2026. Registered before anything was run: the time this file was
committed is the registration time, and nothing below may be edited after the
first run. Corrections go underneath as dated additions.

*Towns are labelled, not named. The real documents stay outside this
repository, and results about them are published as counts only.*

**The question:** does Ada Editor's checker find accessibility failures that
Word's built-in Accessibility Checker doesn't, without making more wrong
claims? And how do we keep it the best checker we can make without piling on
rules that don't earn their place?

**What I looked at:**
- The 20 rules in `app/_engine/rules.ts`, read rule by rule to predict what
  each one catches (`rules.ts:440-500` for alt text, `textHelpers.ts:22-30`
  for link text and colour words).
- What Word's checker says it checks: Microsoft's
  [Rules for the Accessibility Checker](https://support.microsoft.com/en-us/office/rules-for-the-accessibility-checker-651e08f2-0fc3-4e10-aaca-74b4a67101c1)
  (page updated September 2026). It lists eight rules that apply to Word, and
  none for the document title, its language or link text. Microsoft also
  says the checker can't detect information conveyed by colour alone. The
  checker has no command line, and nothing in VBA or Office JS returns its
  findings, so it has to be run by hand.
- W3C's [failure techniques for WCAG 2.1](https://www.w3.org/WAI/WCAG21/Techniques/#failure),
  fetched October 12, 2026.
- Our [WCAG 2.1 AA in meeting documents](../../app/research/wcag-meeting-documents/page.tsx)
  page. It sorts all 50 A and AA criteria by who can decide them. It doesn't
  measure what a checker catches, and this benchmark does.
- How [ponytail](https://github.com/DietrichGebert/ponytail) proves its own
  claims. Its benchmark tasks have answers known in advance. Every scoring
  check ships with a good and a bad example, and must tell them apart before
  any result counts. A change to its rules merges only with numbers showing
  it helps on one task and breaks nothing on another.

## The one-line verdict

**W3C's own list of how content fails WCAG is the answer key. Every failure a
Word document can carry is planted once, so the right answer is known before
either checker runs. From now on, a rule ships only if it catches a row it
didn't before and adds no wrong claim.**

## Decisions

### 1. Use W3C's failure list as the answer key, not ours

The question "which failures should a checker find?" is answered by W3C, not
by me. That keeps the key from mirroring our own rules. It also needs no one
to label anything: each row is planted on purpose, so its answer is known.

**What's included:** every failure technique for an A or AA criterion whose
failing condition a Word document can carry. Some target criteria have no
failure technique, so each gets one plant of its own: 1.4.3, 3.1.1 and 3.1.2.
That makes 31 rows.

| # | W3C | Criterion | The plant in Word | Ada (predicted) | Word (predicted) |
|---|---|---|---|---|---|
| 1 | F1 | 1.3.2 | A text box floated beside the item it belongs to, but stored after the next item in the file | — | — ? |
| 2 | F2 | 1.3.1 | A section title in bold, 14 pt, Normal style | asks | — |
| 3 | F2 | 1.3.1 | A list typed with "•" and a tab, with no list formatting | — | — |
| 4 | F3 | 1.1.1 | "DRAFT" carried only by a watermark picture | — | — |
| 5 | F13 | 1.1.1, 1.4.1 | A bar chart picture with the alt text "Chart" | asks | — |
| 6 | F14 | 1.3.3 | "Use the form on the right" | — | — |
| 7 | F25 | 2.4.2 | A file with no heading and the Title property "Document1" (its own file) | — | — |
| 8 | F26 | 1.3.3 | A "✓" column marking approved items, with no text | — | — |
| 9 | F30 | 1.1.1 | A photo with the alt text "IMG_0412.jpg" | asks | fails |
| 10 | F32 | 1.3.2 | A title typed "A G E N D A" | — | — ? |
| 11 | F33 | 1.3.1, 1.3.2 | Two columns made with tabs | — | — ? |
| 12 | F34 | 1.3.1, 1.3.2 | Agenda items, times and presenters lined up with tabs | — | — ? |
| 13 | F38 | 1.1.1 | A divider picture with no alt text, not marked decorative | fails | fails |
| 14 | F39 | 1.1.1 | A divider picture with the alt text "line" | asks | — |
| 15 | F43 | 1.3.1 | "Present:" set in the Heading 2 style | — | — |
| 16 | F46 | 1.3.1 | A layout table whose first row is marked as a header row | — | — |
| 17 | F49 | 1.3.2 | A layout table that reads in the wrong order row by row | — | — |
| 18 | F63 | 2.4.4 | A link reading "click here" in a sentence that doesn't say where it goes | fails | — ? |
| 19 | F65 | 1.1.1 | A photo with no alt text | fails | fails |
| 20 | F68 | 4.1.2 | A text content control with no title | — | fails |
| 21 | F71 | 1.1.1 | A heading typed as "𝐍𝐎𝐓𝐈𝐂𝐄" in mathematical bold letters | ? | — |
| 22 | F72 | 1.1.1 | A seating plan drawn with keyboard characters | — | — |
| 23 | F73 | 1.4.1 | A link with its underline removed, shown by colour alone | — | — |
| 24 | F81 | 1.4.1 | "Items in red need a vote" | asks | — |
| 25 | F83 | 1.4.3 | White text over a light photo | — | — ? |
| 26 | F86 | 4.1.2 | A phone number as three content controls, none titled | — | fails |
| 27 | F89 | 2.4.4, 4.1.2 | A logo picture linked to the town's site, with no alt text | fails ? | fails |
| 28 | F91 | 1.3.1 | A data table whose first row isn't marked as a header row | fails | fails |
| 29 | — | 1.4.3 | Grey text (#999999 on white, 2.8:1) set directly on the words | fails | fails |
| 30 | — | 3.1.1 | A Spanish document whose language is set to English (its own file) | asks | — |
| 31 | — | 3.1.2 | A Spanish paragraph in an English document, its language not set | asks | — |

In the two prediction columns:
- **fails** means the checker asserts a failure: one of Ada's blocker or
  violation findings, or a Word error or warning.
- **asks** means the checker raises a question: one of Ada's "Needs your call"
  or advisory findings, or a Word tip.
- **—** means it says nothing.
- **?** marks a guess I'm not sure of. For Word, it marks the labels that older
  versions showed ("Objects not inline", "Repeated blank characters",
  "Unclear hyperlink text") but Microsoft's current page doesn't list.

**What's left out, and why:**
- Scripting, media, timing and navigation between pages (F7–F12, F15, F16,
  F22, F23, F31, F36–F42, F44, F50–F61, F66, F74, F75, F85, F93, F95,
  F97–F101, F103, F105–F107, F112, F113).
- Markup that exists only in HTML (F48, F70, F77, F90, F92).
- Reflow and resizing (F69, F80, F94, F102, F104).
- Focus styles (F78, F79).
- AAA criteria (F84, F88).
- F24, user style sheets, which have no Word equivalent.
- F67, a long description separate from the alt text, which Word has no
  field for.
- F82, F96 and F111, which in Word are the same untitled content control as
  F68.
- 2.4.6, descriptive headings: "descriptive" has no single right answer to
  plant.

### 2. Build each row twice, as ponytail does

Two documents are made in Word itself, so their insides are real Word files
and not something a script made up:
- **the bad pack**: 29 rows, each in its own short passage under a plain
  heading;
- **the good twin**: the same text with every row fixed.

Rows 7 and 30 change the whole document, so each gets a small file of its own.

The packs are made-up content, so they can be committed to `corpus/docx/`.
Before any result counts, the scorer has to show that it finds nothing to
score on the good twin and finds every planted row on the bad pack.

**What counts as a catch:**
- **A catch** is a finding that points to the planted passage.
- **A Word tip** counts only when the condition it names is true. "Documents
  use heading styles" doesn't count for row 2, because the pack has heading
  styles.
- **A barrier the export removes** is reported, but isn't a catch, because
  the writer was never told. Examples: Ada turns form fields into plain text
  (rows 20 and 26), and since #106 it takes the title from the first heading.
  Row 7 has no heading, so that doesn't hide it.

### 3. Measure the cost of wrong claims on six real documents, fixed and confirmed clean

A planted pack measures recall: does the checker know the failure? It can't
measure what a checker gets wrong on real writing. For that:
- Take the lowest-numbered municipal Word file from each of six different
  publishers, collected in August 2026 for earlier research. The rule is
  applied by script, not by eye.
- Fix each one against the 31 rows.
- **The owner confirms each one is clean.**
- Anything a checker asserts on a confirmed-clean document is a wrong claim.
  Every question it raises there is counted as cost.

These files are public records that name real people, so they never enter
this repository.

### 4. Measure against Word's checker, used properly

Word's checker is what a clerk already has, for free. It is the right
baseline for "what writers are told today", and the wrong one for "the best
checker that exists". No claim is made against Acrobat, PAC or CommonLook.

How Word is run:
- Word for Mac (Microsoft 365), driven through screen control, with its build
  recorded and automatic updates off for the run.
- Every category of the checker pane expanded.
- Files opened as they are, not converted.
- Screenshots kept outside the repository.
- **Word runs first**, before Ada has produced any output on these files.

Ada is the engine as of the commit that merges this file.

### 5. From now on, a rule has to earn its place

This is ponytail's rule for its own instructions, applied to ours. A pull
request that adds or changes a checking rule shows two pack tables, for
`main` and for the branch. It merges only if both hold:
- the branch catches a row that `main` doesn't;
- it makes no new assertion on the good twin or on the six clean documents.

A change that moves nothing doesn't ship, however good the idea.

The pack check goes into the existing `scripts/verify-rules.mjs`, with
row-by-row expectations in the same allowlist style as
`scripts/measure-engine.mjs`. That way `npm run verify` enforces it with no
new framework.

After the first run, rules that catch no row and only raise questions on
clean documents are listed as candidates for deletion. They aren't
automatically deleted: the AAA rules (reading level, long sentences, a top
heading) sit outside an A and AA list by design.

## Registered predictions

These come from the rule code and Microsoft's own list, before either checker
has run on any of these files.

| # | Prediction |
|---|---|
| P1 | Word catches exactly the 8 rows Microsoft documents: 9, 13, 19, 20, 26, 27, 28, 29. Every one is an assertion. |
| P2 | Ada catches 12 to 14 rows, counting questions. Firm: rows 2, 5, 9, 13, 14, 18, 19, 24, 28, 29, 30, 31. Uncertain: 21 and 27. |
| P3 | At least 10 rows are caught by neither checker. If Word shows only its documented rules, it's 15: rows 1, 3, 4, 6, 7, 8, 10, 11, 12, 15, 16, 17, 22, 23, 25. |
| P4 | **Against Ada:** counting assertions only, Word catches more rows than Ada (8 against 5 or 6). "Ada catches more" holds only when its questions count, and any claim we publish must say so. |
| P5 | **Against Ada:** on the six clean documents, Ada asserts a failure on at least 2 of the 6. The likely sources are bare web addresses (`link-text-raw-url`) and skipped heading levels (`heading-skip`): both are graded violations, and WCAG names neither as a failure. Word asserts at most 1 failure across all six. |
| P6 | **Against Ada:** on the six clean documents, Ada raises at least 3 questions per document on average. Word raises at most 1. |
| P7 | Row 7, a title that doesn't say what the document is, is caught by neither checker. The title check becomes the first change to go through decision 5. |

**What I expect to be wrong:**
- P1, if Word for Mac still shows labels Microsoft no longer lists.
- Rows 21 and 27 in P2.
- The exact numbers in P5 and P6.

**What I knew when I wrote these:**
- Totals from a structure count of 31 municipal Word files: 18 have a Title
  property, all are set to English (US), 11 use heading styles and 4 have
  pictures.
- The 34 municipal `.docx` files come from about 12 publishers and use 26
  different style sets.
- I have not read any of their text, or seen either checker's output on them.

## The next steps, in order

1. Build the bad pack, the good twin and the two single-row files in Word.
2. Fix the six real documents. The owner confirms each one is clean.
3. Run Word on everything and record what it says.
4. Add the pack check to `verify-rules.mjs`, and write a local script that
   runs Ada on the six documents through `importDocx` and `checkDocument`, as
   `verify-rules.mjs` already does.
5. Write the results doc: each prediction, registered against actual, held
   or wrong.
6. Put the title check through decision 5.

## Limitations

Stated because the numbers will be quoted.

- **A plant is a clean signal.** One failure sits in one place, set up the
  way W3C describes it. Recall on the pack is an upper bound for real
  documents.
- **The list says which failures exist, not how often clerks commit them.**
  A row that never happens counts as much as one that's in every agenda.
- **I wrote the rules, the plants and the predictions.** Each plant follows
  W3C's own description of its failure, so the key isn't one I chose. But the
  wording of each plant is mine.
- **Six documents measure what wrong claims cost, not every kind of document
  a clerk writes.**
- **Word's list is from one date.** Microsoft changed it before, and will
  again.
- **Ada reads colours set directly on words, not colours set by a style**
  (a marked limit in `importDocx.ts`). Row 29 is set directly, the way people
  usually do it. A grey set by a style would be missed.

## What would change this

- **Someone shows the plants are unrealistic, or that real documents fail in
  ways the list misses.** Then label failures in real documents too: blind
  labelling, with the owner settling disagreements. That costs far more, so
  it waits until a challenge makes it necessary.
- **Word catches rows beyond its documented list.** The table is updated
  with what it actually did.
- **W3C publishes new failure techniques that a Word document can carry.**
  They're added as dated rows.
- **A free checker clerks actually use appears**, for example in an agenda
  platform. It becomes another column.

## Addition, 2026-10-12: grades changed after registration

After this brief was registered, the owner moved three rules from violation
("Fails AA") to "Needs your call": `heading-skip` and `link-text-generic`
(#111), then `link-text-raw-url`. Two of them are the sources P5 named.

- **The registered run uses Ada as of 7b2ce34**, the commit that merged this
  brief, as it says above. Run `importDocx` and `checkDocument` from that
  commit for P2, P4, P5 and P6.
- **Main's grades get their own column** in the results, so the effect of
  these rulings is measured rather than mixed into the predictions.
- **Decision 5's first test doesn't fit a regrade.** "Catches a row main
  doesn't" can't hold for a change that only turns assertions into
  questions. These rulings shipped without pack tables because the packs
  hadn't run. A change of that kind should show its second test: no new
  assertion on the good twin or the six clean documents.

## Addition, 2026-10-12: the packs have run

[The results for the four planted files](engine-benchmark-2026-10/results-packs.md)
are in, Word first and then Ada at 7b2ce34, with main as its own column.
P1, P2 and P4 were wrong, P3 and P7 held, and P5 and P6 wait for the six
documents.

**A correction to "What I knew when I wrote these":** the 34 municipal
`.docx` files come from 8 publishers, counted by URL host, not "about 12".
The selection rule doesn't change. Taking the first file from each new
publisher in id order still gives r01, r21, n34, n35, n43 and n47.

## Addition, 2026-10-13: a published standard replaces the owner's confirmation

Decision 3 had the owner confirm that each of the six fixed documents is
clean. The owner declined: a personal call would put weak bias into the
proof. [The adjudication standard](engine-benchmark-2026-10/adjudication-standard.md)
takes its place, and merging it is the owner's approval of it.

- **What decides "clean":**
  - W3C's failure techniques (the 31 rows) decide what fails.
  - The Access Board's ICT Testing Baseline for Electronic Documents decides
    how to test it in Word.
  - The federal Word 365 guide fills the gaps.
  - Two blind testers apply the judgment calls spot by spot.
  - What none of these settles is contested.
- **Contested is narrow.** It covers 64 listed spots in the six documents and
  never touches the 31 planted rows, the published pack results or decision
  5's gate.
- **P5 and P6 keep their wording and thresholds.**
  - P5 excludes an assertion only when both its spot and its criterion match a
    contested entry.
  - P6 counts every question, with the contested subset shown beside it.
  - The standard sets out the matching rule.
- **The pins don't change.** The registered run is Ada at 7b2ce34, and main
  gets its own column. Word runs first.
- **What I knew when I wrote this:**
  - the pack results for both checkers;
  - the engine changes since registration (#111, #114, #117 and #120);
  - every line of the six documents, which corrects "I have not read any of
    their text": I read them all to make the first fixes on 2026-10-12. That
    is why spot-level judgments now go to blind testers, not to me.
  - The owner opened the earlier fixed copy of one document in Word on
    2026-10-13 and read Word's accessibility status. That copy was replaced:
    all six were rebuilt from the originals under the standard, and their
    hashes are in it.
- **No output from either checker exists on the six rebuilt documents** as
  of this commit.

## Addition, 2026-10-13: the six have run

[The results for the six real documents](engine-benchmark-2026-10/results-six.md)
are in, scored by the adjudication standard. Word ran first, then Ada at
7b2ce34, with main as its own column; the two Ada columns are identical.
- **Word:** no assertions and no questions on any of the six.
- **Ada:** one wrong claim, `table-no-header` on D4's form grid, and 32
  questions, 27 of them reading level or sentence length.
- **P5 was wrong** for Ada (1 document, not 2 or more) and held for Word.
  **P6 held.** All seven predictions are now scored.

## Addition, 2026-10-14: the rule ledger

[The rule ledger](engine-benchmark-2026-10/rule-ledger.md) is decision 5's
list, for all 22 rules at once.
- **11 rules earn their place,** and between them Ada at main catches 18
  rows.
- **3 are AAA,** exempt by design.
- **6 are outside the key:** they're silent on clean documents, and there's
  no row for them to catch.
- **2 are candidates.** `img-long-description` was already ruled kept, so
  `form-blank` is the only new one. Its 2 questions on the six are on
  contested spots. Listing isn't deleting; the owner decides.

## Addition, 2026-10-14: every step is done

Step 4 is complete. The local script,
[`scripts/benchmark-ada.mjs`](../../scripts/benchmark-ada.mjs), came with
the pack results (#115). The pack check has run in `verify-rules.mjs` since
#128: it pins every finding on the planted files, by heading except for row
30's document-wide one, and fails if the good twin gets an assertion. With
the title check (step 6, #120), all six steps are done, step 2 as amended by
[the adjudication standard](engine-benchmark-2026-10/adjudication-standard.md).
