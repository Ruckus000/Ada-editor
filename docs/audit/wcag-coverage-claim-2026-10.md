# "Automated checks cover roughly a third of WCAG": no source, so it went

October 12, 2026.

## What changed

The home page (`#promise`), Help (`#severities`), the README, the design
principles (§3), a comment in `IssueList.tsx` and the Grammarly audit all said
automated checking covers "roughly a third of WCAG". Nothing in the repo backed
the figure. `rule-set-spike.md` doesn't: it measures the finding mix of 13 rules
on 28 documents, not how much of WCAG software can check.

Every copy now says what About already said: **automated checks cover only part
of WCAG**. Where there's room, it names what needs a person: whether alt text is
accurate, and whether headings match the real structure. The home page and Help
link to the [ADA-compliant PDF guide](../../app/guides/ada-compliant-pdf/page.tsx),
whose Sources list carries the Matterhorn Protocol count below. `updated` moved to
2026-10-12 for `/` and `/help` in `app/_site/pages.ts`.

## What backs the new wording

- **W3C WAI, [Selecting Web Accessibility Evaluation Tools](https://www.w3.org/WAI/test-evaluate/tools/selecting/)**
  (updated 13 May 2024): "Tools cannot check all accessibility aspects
  automatically. Human judgement is required." This is the source for "only part
  of WCAG".
- **WCAG 2.1, 1.1.1 Non-text Content**: alt text must serve "the equivalent
  purpose". Whether it does is a judgement about meaning. The guide gives this
  as its own reading.
- **PDF Association, Matterhorn Protocol 1.1** (already sourced for the guide,
  see `search-and-ai-2026-10/research-niche.md`, addendum of 2026-10-12): of 136
  ways a file can fail PDF/UA-1, 87 "can be determined by software alone" and 47
  "usually require human judgment". This count is for PDF/UA, not WCAG, so no
  page uses it to describe WCAG.

## Sources checked and not used for a share

None of these measures what share of WCAG success criteria software can check,
for documents or for anything else, so none can back a fraction.

- **GOV.UK, [What we found when we tested tools on the world's least-accessible webpage](https://accessibility.blog.gov.uk/2017/02/24/what-we-found-when-we-tested-tools-on-the-worlds-least-accessible-webpage/)**
  (Mehmet Duran, 24 February 2017). Ten tools against 143 barriers built into one
  web page: together they found 71%, and 42 barriers were missed by every tool.
  The best single tool found 41% and Google's developer tools 17%. That counts
  barriers on one artificial page, not WCAG criteria.
- **Deque, [Automated testing study identifies 57 percent of digital accessibility issues](https://www.deque.com/blog/automated-testing-study-identifies-57-percent-of-digital-accessibility-issues/)**
  (10 March 2021). Over 2,000 audits, 13,000 pages and nearly 300,000 issues:
  "57 percent of accessibility issues were completely covered" by Deque's own
  axe tests. It counts issues by volume, on web pages, with the vendor's own tool.
  It calls the 20–30% figure, counted in WCAG success criteria, a
  "widely-accepted belief", and doesn't cite a source for it.

## What would change this

A primary source that counts WCAG 2.1 AA success criteria by whether software
can decide them, for documents. Or our own count: classify each criterion as
machine-decidable, partly or needs a person, record it here, and state the result
with that as its source.
