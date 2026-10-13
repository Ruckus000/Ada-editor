# Decision 5: the long-sentence threshold

October 13, 2026. `long-sentence` flags a sentence over 35 words. The owner
asked for that number to go through
[decision 5](../engine-benchmark-2026-10.md#5-from-now-on-a-rule-has-to-earn-its-place).

## The verdict

**Kept at 35, with nothing changed.** Lowering it would add questions on
clean documents and catch no row. That fails decision 5, as
[plot and grading plans](decision-5-plot-grading-plan.md) did. Raising it
would only remove questions, but no source supports a higher number either.
The owner ruled: keep 35, and record why.

## Where 35 came from

Nowhere that's written down. It arrived with the spike's rules
(`scripts/spike/rules.mjs`, a1de98d), and the engine ported it unchanged.
[The spike's record](../rule-set-spike.md) counts the rule's 46 firings but
doesn't say why 35.

**What the sources say:**
- **GOV.UK**, "Use clear language": "Try to split up sentences that are
  over 25 words long." That's the only published number found.
  ([guidance.publishing.service.gov.uk](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/))
- **digital.gov**, the US federal plain-language guide, in "Clear and short":
  no number. It says "Express only one idea in each sentence."
  ([digital.gov](https://digital.gov/guides/plain-language/writing/clear-short))
- **WCAG 3.1.5** sets a reading level, not a sentence length.

## What each threshold would do

The estimates use the spike's sentence split. At 35 they reproduce Ada's
real counts on the six (8, 2, 0, 0, 1 and 1) and the spike's 46 on the
corpus. Since [#125](decision-5-aaa-advice.md) the rule asks once per
document, so on the six only the number of documents asked matters.

| | Over 25 | Over 30 | Over 35 (now) |
|---|---|---|---|
| Six: sentences | 29 | 16 | 12 |
| Six: documents asked | 6 | 5 | 4 |
| Four pack files: sentences | 0 | 0 | 0 |
| Corpus: sentences (approx.) | ~210 | ~103 | 46 |
| Corpus documents where the parity gate would diverge from the spike | 25 of 29 | 18 of 29 | 0 |

**The decision 5 tests:**
- **Test 1 can't apply.** The answer key has no AAA rows, and no pack
  sentence is over 25 words.
- **At 25,** D3 and D4 each gain a question, so the six go from 15
  questions to 17, and nothing is caught. **At 30,** D3 gains one.
- **Both fail,** like plot plans: they add questions and catch no row.

## What would change this

- **A published US source that sets a number,** such as a federal or
  state plain-language standard.
- **An AAA row in the answer key.**
- **The owner adopting GOV.UK's 25 as policy despite the cost.** That would
  take three pieces of work:
  - the seeds and `verify-rules` updated;
  - a rule-wide note in `scripts/measure-engine.mjs` that the engine flags
    a superset of the spike's sentences;
  - this record updated.
