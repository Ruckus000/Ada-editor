# Rule-set spike

## The question

The design system assumes Ada-editor is a **Grammarly-shaped inline assistant**:
findings underlined in prose, fixed one at a time as you write. That form was
chosen in the first planning round and everything since has been built on it.

Nobody has checked whether the finding set supports it.

The risk is specific. The high-value accessibility checks — is the alt text
*accurate*, is this link text *meaningful*, does the heading hierarchy reflect
the document's real structure — are exactly the ones a machine cannot decide.
If most real findings land in the `manual` severity, an inline assistant is a
nag: it interrupts writing to say "something might be wrong here, you work it
out." A report-and-remediate tool would be the right shape, and the design
system's core pattern would be wrong.

## Pre-registered falsification criteria

Written **before** running anything, because the failure mode in this project
has been constructing evidence that confirms what I already believed. If the
numbers come back against these thresholds, the finding stands and the design
changes — no re-framing after the fact.

The inline-assistant form is **wrong** if any of these hold on a real corpus:

| # | Criterion | Threshold | What it would mean |
|---|---|---|---|
| F1 | `manual` share of all findings | **≥ 50%** | The tool mostly says "you decide". That is a review checklist, not an assistant. |
| F2 | Findings carrying an automatic fix | **< 25%** | "Apply fix" is decorative; the primary action in the card design is mostly absent. |
| F3 | Findings anchored to a text range | **< 50%** | Document-level findings (missing language, no headings) cannot be underlined. The underline metaphor fails. |
| F4 | Median findings per document | **< 3** | Nothing to assist with in an editing loop. |

The form is **supported** if `manual` < 50%, auto-fix ≥ 25%, range-anchored
≥ 50%, and median findings ≥ 3.

Anything between is a partial result and gets reported as one.

## Corpus

28 documents, 391KB, fetched by `scripts/spike/fetch-corpus.mjs` from public
repositories. None were written for this test. Only
`raw.githubusercontent.com` is reachable from this environment, which
constrains the corpus — see Limitations.

| Kind | Documents |
|---|---|
| technical readme | 10 |
| long-form guide | 5 |
| gov doc | 3 |
| procedural | 3 |
| guidance | 2 |
| policy | 2 |
| gov playbook | 1 |
| standards doc | 1 |
| technical doc | 1 |

## Results

```
Rule-set spike — 13 rules over 28 real documents

670 findings total, median 12 per document

Severity distribution
  blocker     302   45.1%  #############
  violation    43    6.4%  ##
  advisory    202   30.1%  ########
  manual      123   18.4%  #####

By rule
  img-alt-missing           270  blocker
  reading-level             156  advisory
  img-alt-suspicious         97  manual
  long-sentence              46  advisory
  document-language          28  blocker
  link-text-raw-url          27  violation
  link-text-ambiguous        25  manual
  document-no-h1              8  violation
  heading-skip                4  violation
  link-text-generic           4  violation
  table-no-header             4  blocker
  heading-empty               1  blocker

By document kind (manual share is what matters)
  technical readme      429 findings,  21% manual
  long-form guide       101 findings,  21% manual
  policy                 32 findings,   0% manual
  procedural             31 findings,  29% manual
  gov doc                26 findings,   4% manual
  standards doc          22 findings,   0% manual
  guidance               19 findings,   5% manual
  gov playbook            7 findings,   0% manual
  technical doc           3 findings,   0% manual

Pre-registered criteria
  F1  manual share of findings             18.4%   fails if >= 50  ok
  F2  findings with an automatic fix        4.8%   fails if < 25   *** TRIPPED ***
  F3  findings anchored to a text range    94.6%   fails if < 50   ok
  F4  median findings per document         12.0   fails if < 3    ok

VERDICT: F2 tripped — the inline-assistant form is NOT supported as designed.
```

> **Later change (2026-09):** the shipped engine grades `document-no-h1`
> **advisory**, not violation. Its criterion, 2.4.10 Section Headings, is AAA,
> and the product's severity scale grades AAA as Advisory. The numbers above
> are the spike's, as measured.

### Sensitivity

One document — webpack's README, a wall of logo images — contributes 267 of
the 270 `img-alt-missing` findings, so it alone drives 40% of the total. A
headline number that rests on one outlier is not a result, so here is the same
analysis with it removed, and with technical READMEs removed entirely:

| Slice | manual | auto-fix | range-anchored | median/doc |
|---|---|---|---|---|
| All 28 documents | 18.4% | **4.8%** | 94.6% | 12 |
| Excluding webpack README | 23.0% | **8.4%** | 90.2% | 11 |
| Prose only, no READMEs | 13.4% | **7.6%** | 90.3% | 14 |

F2 trips in every slice. F1, F3 and F4 clear in every slice. The verdict does
not depend on the outlier.

## What this means

**Three of the four assumptions held. One did not, and it is the one the card
design is built around.**

- **F1 cleared at 18.4%.** My stated worry — that `manual` findings would
  dominate and make the tool a nag — was wrong. Most accessibility findings in
  real prose *are* machine-decidable.
- **F3 cleared at 94.6%.** Findings anchor to text ranges, so the underline
  metaphor holds.
- **F4 cleared at a median of 12.** There is plenty to assist with.
- **F2 tripped at 4.8%.** And the composition is worse than the number: the 32
  auto-fixable findings are 28 instances of "declare a language" — one per
  document, a property of the export rather than the prose — plus 4 heading-level
  skips. **Essentially nothing a writer encounters inline can be fixed
  automatically.**

The reason is structural, not a gap in the rule set. Fixing an accessibility
finding means knowing what the image shows, where the link goes, or how to say
the sentence more plainly. That is the author's knowledge, not the document's.
Grammar has a correct answer that a machine can compute; accessibility mostly
does not.

### The design change this forces

`IssueCard` treats **Apply fix** as its primary action and "No automatic fix —
this one needs your judgement" as an italic aside for the exception. The
measurements invert that: the aside is the 95% case and the primary action is
the 5% case.

So the card's primary action becomes **Go to text** — take me to the passage so
I can fix it myself — with **Apply fix** promoted only when a suggestion
actually exists. The product is closer to *explain and navigate* than to
Grammarly's *accept or reject*.

This is the part of Grammarly that does not transfer, and the audit did not
catch it. Grammarly's central interaction is accepting a computed correction.
An accessibility checker rarely has one.

## Limitations

Stated because the numbers above will be quoted.

1. **The corpus is GitHub-hosted Markdown**, not the .docx and PDF reports the
   product actually targets. Only `raw.githubusercontent.com` was reachable.
   Technical READMEs are over-represented at 10 of 28 documents, which is why
   the sensitivity table exists.
2. **13 rules, first pass, severity assigned by me.** A different rule author
   could move these numbers. The auto-fix result is the most robust finding,
   because it follows from what the rules *can compute*, not from how they are
   graded.
3. **No false-positive audit.** The rules were checked against ground truth for
   `img-alt-missing` (269 `<img>` without `alt` in the raw corpus — confirmed),
   but the prose heuristics for colour references and alt-text quality have not
   been hand-validated for precision.
4. **Markdown carries no language declaration**, so `document-language` fires on
   every document. It is real for an HTML export and noise for a Markdown source.
