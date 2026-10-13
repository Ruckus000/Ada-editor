# How the six real documents are judged: the adjudication standard

October 13, 2026. Written before either checker has produced any output on the
six documents. It replaces "the owner confirms each one is clean" in
[the brief](../engine-benchmark-2026-10.md)'s decision 3, as recorded there in
the dated addition of 2026-10-13.

*Towns are labelled, not named. The six documents stay outside this
repository; only counts, rulings and locations without text are published
here.*

**The question:** predictions P5 and P6 count the wrong claims and questions
each checker makes on six real municipal Word documents once they're
"clean". Who decides what clean means, in a way nobody can call biased?

**What I looked at:**
- **Published sources,** read in full: 124 tests or techniques. That's 72 from
  the US Access Board's ICT Testing Baseline for Electronic Documents, 25 from
  the federal Word 365 testing guide, and the 27 W3C failure techniques in the
  brief's 31 rows.
- **Everything either checker can report,** restated as 33 plain conditions
  with no checker named.
- **Every kind of construct in the six documents and the four planted files:**
  57 of them, found by a structural count over 44 Word files.
- **Every spot in the six documents where a test needs a judgment call:**
  264 spots.

## The one-line verdict

**Clean now means clean by published tests, not by anyone's opinion.**
- 132 rulings, each citing a source test and quote, decide every condition
  either checker can raise.
- Two blind testers, who never saw either checker's rules or code, applied
  the judgment calls spot by spot. They agreed on 262 of 264.
- Anything the sources or testers couldn't settle is marked contested: 64
  spots across the six documents, listed and hash-locked below before any
  checker runs.

## Decisions

### 1. Use an order of authority, with W3C still deciding what fails

1. **W3C's failure techniques decide what fails.** These are the brief's 31
   rows: 28 techniques, plus the criteria 1.4.3, 3.1.1 and 3.1.2.
2. **The [Access Board's ICT Testing Baseline for Electronic Documents](https://ictbaseline.access-board.gov/document-baselines/)**
   (v1.0, September 2024) decides how to test them in a Word document.
3. **The [AED COP Word 365 testing guide](https://www.section508.gov/~assets/files/ms-word-365-basic-authoring-and-testing-guide.pdf)**
   fills the Baseline's gaps.
4. **Whatever is still undecided is contested.** It's left as published,
   listed in advance and excluded from P5.

**Why this order:** the Title II rule of April 2024 makes WCAG 2.1 AA the
legal bar for these documents, but says nothing about how to test for it. The
Baseline is the US government's own test method for documents, written by the
agency that writes the Section 508 standards. The Word guide is the same
community's product-level guide.

**Not in the chain:** older federal Word baselines, WCAG2ICT, EN 301 549,
PDF/UA, Matterhorn and other countries' checklists. They're quoted where they
show a conflict but never rule. Canada's checklist, for example, bans layout
tables outright. Nothing in this repository counts as a source, and neither
does any checker's own documentation.

### 2. Keep "contested" narrow, so it can't hide a checker's mistakes

On the six documents, an exclusion can only remove findings. A wide
"contested" would quietly erase the ambiguous findings P5 exists to count, so
five scope rules hold it narrow:
- **S1. The `.docx` as saved is what's judged.** Failures that exist only in
  an export or inside a tool, such as PDF/UA heading rules or PDF artifacts,
  are `pass` here and listed as limitations.
- **S2. AAA, best-practice and non-failure conditions are `pass`, not
  contested.** Examples: reading level, long sentences, blank paragraphs, a
  skipped heading level, a bare web address, merged cells, a floating
  picture. A checker that asserts one of these on a clean document has made a
  wrong claim.
  - A or AA conditions outside the 31 rows are contested, so no row gets added
    by the back door. Examples: 2.4.6, 1.4.5, 1.4.11, keyboard access.
- **S3. Contested has only two causes.** Either the sources at tiers 1–3
  conflict, and both quotes are recorded, or the two blind testers disagree
  about a spot. It applies to spots in the six documents only:
  - never to the 31 planted rows;
  - never to a published pack result;
  - never to decision 5's gate, which still counts every new assertion
    anywhere.
- **S4. Every ruling is mechanical or judgment-type.** Mechanical rulings are
  decided from the XML by script. Judgment-type rulings go to the blind
  testers, with the exact question taken from the source's own test.
- **S5. No ruling without a quote.** Every `fail` or `pass` cites a test id,
  a URL and a quote that the verifier checked.

### 3. Rule on everything either checker can say, then try to refute it

The research ran as a workflow. Each stage's agents saw only what they
needed:
1. **Sources:** one reader extracted every test with its pass/fail wording.
2. **Rule:** two rulers, one for structure and tables and one for everything
   else, ruled on all 90 candidates.
3. **Verify:** one skeptic per ruler tried to refute every `pass` and `fail`,
   and to settle every `contested`. Skeptics changed 19 of the 66 first-pass
   rulings.
4. **Critic:** a completeness critic found 36 gaps. A second ruler and skeptic
   closed them with 66 more entries, and the skeptic changed 21 of those.

The [register](adjudication-register.json) holds all 132 entries: 66 fail, 48
pass and 18 contested. 69 are mechanical and 63 are judgment-type. Every one
of the 31 rows has at least one failing entry, so no planted row is ruled a
pass.

**Kept apart:**
- The rulers never saw a checker's name, rule id or severity. Which checker
  raises which condition was kept in a sealed file and joined only after
  verification.
- They never saw the six documents' text.

**What each checker's conditions came to, after the join:**

| Condition | Ada rule | Word category | Ruling |
|---|---|---|---|
| Picture with no alt text | `img-alt-missing` | Missing alt text | fail (B01, B03, B05); pass if decorative or in a header or footer and decorative (B04, B06) |
| Alt text that's a file name | `img-alt-suspicious` | Missing alt text | fail (B09) |
| Alt text that starts "Image of", or is very short | `img-alt-suspicious` | — | pass (B11, G62) |
| May need a long description | `img-long-description` | — | fail only when the alt text isn't equivalent (B08, B10); otherwise pass (G63) |
| "Click here", or unclear link text | `link-text-generic` | Unclear hyperlink text (other builds) | fail only when the context doesn't say where it goes (B13) |
| A bare web address as link text | `link-text-raw-url` | — | pass (B14) |
| The same link text going to different places | `link-text-ambiguous` | — | pass as such (G61); fail under B13 if the purpose is unclear |
| A skipped heading level | `heading-skip` | Skipped heading level (other builds) | pass (A05) |
| An empty heading | `heading-empty` | — | fail (A04) |
| No top-level heading; no headings at all | `document-no-h1`, `document-no-headings` | No headings in document | pass (A06, A07) |
| A line that looks like a heading but isn't one | `heading-unmarked` | — | fail when it is a visual heading (A01): judgment |
| A missing or default title | `document-title` | — | fail (B16, B17) |
| Colour used to refer to something | `colour-only-reference` | — | fail when colour alone carries it (B19): judgment |
| Text contrast | `contrast-minimum` | Hard-to-read text contrast | fail below 4.5:1, or 3:1 for large text (B20, B21) |
| Reading level, long sentences | `reading-level`, `long-sentence` | — | pass (B34) |
| A passage in another language; the wrong document language | `language-of-parts`, `document-language` | — | fail when true (B22, B23): judgment |
| Typed fill-in blanks | `form-blank` | — | pass as structure (A29); underscore runs as characters: contested (G02) |
| A table with no header row | `table-no-header` | Missing table header | fail for a data table (A16): judgment |
| A table that may only lay text out | `table-layout` | — | fail if a layout table has headers or reads out of order (A16, A17); otherwise pass (A18) |
| Merged or split cells; nested tables | `table-merged-cells` | Use of merged or split cells; simple structure | pass (A19, A20) |
| A content control with no title | — | All content control fields have titles | fail if it accepts data (B25); a page-number building block passes (B28) |
| Restricted permissions | — | Restricted access | pass for editing protection (G06); contested for encryption or rights management (G07) |
| Suggested (generated) alt text | — | Suggested alt text | pass (B11) |
| A floating object | — | Image or object not inline (other builds) | pass as such (A23); fail only if its reading order is wrong (A22) |
| Blank characters for layout | — | Repeated blank characters (other builds) | fail if they make columns (A12); blank paragraphs pass (A13) |

**Two consequences, stated before any run.**
- **For Ada:** seven of its rules raise conditions that are `pass`:
  `heading-skip`, `link-text-raw-url`, `document-no-h1`, `reading-level`,
  `long-sentence`, `table-merged-cells`, and `img-alt-suspicious`'s "Image of"
  case. They're questions today, so they count only toward P6. If any of them
  asserted a failure on a clean document, that would be a wrong claim.
- **For Word:** this build counts every item as an assertion. So "No headings
  in document" and "Use of merged or split cells" on a clean document are
  wrong claims under A07 and A19.

### 4. Settle spot-level judgment calls with two blind testers

Judgment-type rulings ask questions such as "is this line a visual heading?",
"is this a data table or a layout table?" and "is this laid out in columns
with tabs?". Someone has to answer them for each spot.

The author of Ada's rules shouldn't be that someone, and the owner declined.
So two independent testers answered every spot:
- They saw the register's questions and the original documents.
- They never saw Ada's code, this repository or the earlier fixes.
- Where both gave the failing answer, the spot is a settled failure and gets
  fixed. Where both gave the passing answer, it's left alone. Where they split,
  or either was unsure, it's contested.

**Round 1** covered 198 spots, and the testers agreed on 197.

**Round 2** covered 66 more spots, and the testers agreed on 65:
- headings my first extraction missed, because I'd required every run on the
  line to be bold or underlined;
- header and footer text;
- colour, sensory wording and language.

**Where the two rounds disagreed:** on one document's heading levels. Round 1
put its numbered sections at level 2 under "MINUTES"; round 2 put the newly
found sections at level 1, beside the ones already marked Heading 1. Those 15
spots are settled as headings, but their level is contested, so the published
levels are kept.

### 5. Fix only settled failures, starting again from the originals

The six documents were rebuilt from the originals:
- A fix is made only where a mechanical rule or both testers say "fail". That
  came to 132 changes.
- Every other spot is left byte-for-byte as published.
- The fix script refuses to fix any spot whose outcome isn't a settled
  failure.

Fixes, by register entry:

| Entry | Row | Changes |
|---|---|---|
| A01: mark a visual heading as a heading | 2 | 53 |
| A02, A04: un-mark body text or blank lines set in a heading style | 15 | 17 |
| A03: correct a heading's level | 2 | 2 |
| A11: turn typed bullets, numbers and letters into real lists | 3 | 22, 10 of them also linearised under A12 |
| A12: undo columns made with tabs and spaces | 11, 12 | 27, plus the 10 above |
| B01, G05, G59: alt text for a meaningful picture, or remove a leftover web-form control | 19 | 3 |
| B16: add a missing Title property | 7 | 4 |

The other 4 changes add the heading-style definitions some files lacked.

**How this compares with the first fixes** (2026-10-12, made by the author's
own judgment):
- The standard **added** headings the first fix had left as plain text, for
  example the resolution titles and "ADDENDUM ITEMS".
- It **dropped** fixes no test required. One was removing a "[Type text]"
  control from a first-page footer the document never displays, which G45
  rules a pass.
- It **reverted** one change against the testers' reading. The first fix had
  made one document's lettered report titles into headings; both testers read
  them as a typed list.

### 6. Exclude a finding only when both its spot and its criterion match

The [contested list](adjudication-contested.tsv) has 64 spots: document,
part, paragraph number in the fixed file, criterion and register entry. There
is no text from the documents.

| Cause | Spots |
|---|---|
| The testers split on whether it's a heading (A01) | 2 |
| Heading level only, where the two rounds disagreed (A03, G66) | 15 |
| Underscore runs and typed fill-in lines as characters (G02, 1.1.1) | 30 |
| Text in a displayed header or footer (A28: Baseline 18.A and the Word guide's test 8 conflict) | 17 |

**How findings are scored against the list:**
- **The match rule:** a finding is excluded from P5 only when its spot *and*
  its criterion both match an entry. A contrast finding on a contested heading
  line still counts.
- **Unresolved spots:** a finding that can't be tied to a spot is scored, not
  excluded, and counted.
- **P6** counts every question, contested spots included, with the contested
  subset shown beside it. That's the owner's ruling of 2026-10-13: a question
  on an ambiguous spot is still work for the clerk.
- **The location key:**
  - Ada's findings are matched by excerpt, plus `under` for text and tables,
    or by picture order.
  - Whole-document rules map to the document.
  - `form-blank` is excluded only if every blank it covers is contested.
  - Word's findings are matched by the object Word selects when each item is
    clicked.
  - Word's categories map to criteria before the run: alt text is 1.1.1,
    contrast is 1.4.3, and tables and headings are 1.3.1.
- **Changed spots:** nine contested spots aren't byte-identical to the
  original, because a settled fix of another kind applies there:
  - eight got the settled heading fix, but their level is contested;
  - one got the settled list fix, but whether it's a heading is contested.

**The lock.** SHA-256 of the six rebuilt documents, and of the local copy of
the contested list that includes each spot's text:

```
0dbc3805ff066709aea2268f12caa2f314af19dee127f549a361ba5373ac6ec8  D1.docx
040c3189d58f4e35fd4eda742190cdb4de6d22bf5665226ce8bd0b7f696e8f0a  D2.docx
049f89146cb5cec4e8ef34308e3ea89eac90903813b66a9384c857dfeac7cdf9  D3.docx
6928ec11b5a7feb331594bb8fc4cc6931b8369eea1cc6d2a1f0978699f7088a7  D4.docx
ad934007105373005f4fa31db14345b4e361b0562d856ed0963aeb72a864c890  D5.docx
0d07c46d100c55a12e0e4867b3551f7bb3881012b0dc0d6ea3018ed7dee51991  D6.docx
919d98df4af303c544ebd259b8d71a7061cbc544a48ffa81a8119070249d13b2  contested-locations.tsv (local, with text)
```

## The edge cases the research added

The critic's 36 gaps, and the round-2 spots, are the edge cases the first
version of this standard missed. Each now has a ruling:
- **Headers and footers:**
  - Header and footer text counts as it's printed (G44).
  - Parts the section settings never display pass (G45).
  - Header pictures, watermarks included, are ruled by G33, B03 and B04.
  - Word's own page-number building block isn't a form field (B28).
- **Pictures:**
  - Where alt text lives on grouped drawings, VML pictures and embedded OLE
    objects (G59).
  - Behind-text body pictures still need alt text unless they're page
    background (G05).
  - Pictures of text need the words in their alt text (G25).
- **Forms:**
  - Leftover ActiveX controls from pasted web pages (B31, B32, G40).
  - Legacy form fields (G39, G40).
  - Template placeholders in content controls (B26, G20).
  - MACROBUTTON and FILLIN fields (G21).
- **Typing habits:**
  - Separator lines made of one repeated character (G02).
  - Keyboard drawings (G01).
  - Symbol-font check marks and bullets (G42).
  - Letters spread out with spaces (G08).
  - Drop caps (G58).
  - Headings and list items split by line breaks rather than paragraphs (G50).
- **Structure:**
  - A heading's level judged against the whole outline (A03, G66).
  - A list's stored nesting against its look (G52).
  - Which rows of a data table are header rows (G53).
  - Tables whose headers are only in the first column: contested (G54).
- **Language:**
  - Which language attribute is read (G36).
  - A file with no stored default language: contested (G37).
- **Out of scope by S2, contested if ever raised:** media and captions,
  flashing, images of text, descriptive headings, form labels, non-text
  contrast, keyboard access, and control role and state (G22–G31).

**Seen in the wider corpus of 34 municipal files but in no benchmark file:**
10 kinds of construct. Eight are covered by a general ruling: WordArt in a
header (G32), nested tables (A20), drop caps (G58), header and footer text
(G44), headings marked by a custom style's outline level (G49) and very long
headings (A08, G56). Two aren't ruled: INCLUDEPICTURE fields in the body and
NUMPAGES fields in a footer. The first time one appears in a benchmark file,
it gets a ruling before that file is scored.

## Limitations

Stated because the numbers will be quoted.
- **The blind testers are models,** in the same family as the sessions that
  wrote Ada's rules. They were kept away from those rules, but they aren't
  independent people. Two of them agreeing is a consistency check, not a
  panel of experts.
- **Not everything was read.**
  - The Baseline's per-test pages, except test 13. The all-tests page carries
    the same text.
  - Its change log.
  - The Word guide's figures.
  - The W3C techniques' Examples sections.
  - The W3C pages served today's text, not a frozen WCAG 2.1 snapshot.
  - PDF/UA (ISO 14289-1, paywalled) and the Matterhorn Protocol (its site
    blocked access). Both bear on exports, not on these files.
- **Ada judges a different object from the one this standard judges.** Its
  importer reads only the default header and footer of the last section,
  drops footnotes and hidden text, and flattens text boxes. A failure Ada
  can't see counts as a miss, not an exclusion.
- **One document was opened in Word after the first fixes.** On 2026-10-13,
  before this standard existed, the owner opened the earlier fixed copy of
  one document in Word and read the accessibility status Word showed. That
  copy is gone: every document here was rebuilt from the original. The owner
  didn't adjudicate anything, and the status wasn't shared with the author.
  That document's Word result will be marked "status seen by the owner
  beforehand".

## What would change this

- **A new version of the Baseline or the Word guide, or a WCAG2ICT update:**
  the affected entries are re-ruled as dated additions, and never after a run
  on the same documents.
- **A benchmark file containing a construct nobody ruled on:** it gets a
  ruling before the file is scored.
- **A challenge to a tester verdict on a published spot:** the spot becomes
  contested. Contested only ever grows after a run, so a later change can't
  improve a result.
