# Ada-editor

Write ADA compliant documents.

A writing tool that checks documents for accessibility problems as you write —
and is honest about the limits of what a checker can know.

## Current state

Pre-application. This repository contains the **design system** and the
**Grammarly UX audit** it was derived from. There is no app yet.

- **[Grammarly UX/UI audit](docs/audit/grammarly-ux-audit.md)** — what we took,
  adapted and refused
- **[Design system](docs/design-system/README.md)** — principles, tokens,
  patterns, conformance bar

## Quick start

```bash
node scripts/verify-tokens.mjs --verbose   # verify every token
node scripts/build-tokens.mjs              # regenerate css + ts from tokens.json
```

No dependencies required for either.

## Three decisions worth knowing up front

1. **Colour never carries meaning alone.** Severity is encoded in underline
   shape, glyph and visible text. We measured all twenty-four severity pairs
   under simulated dichromacy and found them indistinguishable at
   AA-compliant contrast — so the system is built not to need them.
2. **The findings list is the interface**, not the inline underline. No ARIA
   mechanism reliably exposes an arbitrary inline annotation, so anything only
   reachable through the prose is unreachable for some users.
3. **Nothing ever claims the document is compliant.** Automated checking covers
   roughly a third of WCAG. Findings that need human judgement get their own
   severity — `manual` — and the empty state says so.

> **On the name:** "ADA" here is the Americans with Disabilities Act, not the
> programming language. Note that the ADA specifies no document technical
> standard; the operative references are WCAG 2.1 AA (DOJ Title II rule, April
> 2024), Section 508, and PDF/UA. Product copy should cite those, not "ADA
> compliance" on its own.
