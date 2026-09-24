# Ada-editor

Write documents that meet WCAG 2.1 AA, Section 508 and PDF/UA.

A writing tool that checks documents for accessibility problems as you write —
and is honest about the limits of what a checker can know.

**Conformance targets.** The ADA specifies no document technical standard, so
"ADA compliant" is a marketing claim rather than something a tool can check
against. Ada-editor checks against the standards that regulators and procurement
actually cite:

| Standard | Applies to | Why it is here |
|---|---|---|
| **WCAG 2.1 AA** | Web and digital documents | The DOJ Title II rule (April 2024) adopts it; the de facto global baseline |
| **Section 508** | US federal procurement | Incorporates WCAG 2.0 AA by reference; required to sell to federal agencies |
| **PDF/UA** (ISO 14289) | Tagged PDF output | The only standard that covers PDF structure — WCAG alone does not |

Every finding cites the specific success criterion it comes from. Nothing in the
product reports "ADA compliance" as a status.

## Current state

Working prototype. The dashboard and editor screens are built from the design
system, documents persist to localStorage, and every finding is computed by
the **real checking engine**: fourteen WCAG rules running against the live
ProseMirror document — structural rules as you type, prose heuristics on
blur/Recheck. **Export HTML** downloads the document as a standalone page
(`lang`, landmarks, headings and links intact; figures are still placeholders,
and whatever the checker flags is still wrong in the export). **Upload .docx**
imports an existing Word file in the browser (the file never leaves the device)
and checks it like any other document; what the editor can't hold yet (tables,
footnotes, decorative images) is listed on the document instead of dropped
silently. There is no backend, no auth, no PDF output and no PDF upload yet.

- **[Grammarly UX/UI audit](docs/audit/grammarly-ux-audit.md)** — what we took,
  adapted and refused
- **[Design system](docs/design-system/README.md)** — principles, tokens,
  patterns, conformance bar
- **[Rule-set spike](docs/audit/rule-set-spike.md)** — validated the checking
  engine's rule set against 28 real documents before building it
- **[Checking engine implementation plan](docs/audit/checking-engine-plan.md)**
  — architecture, rule porting, persistence and performance behind the engine
  that replaced the editor's fixture findings

## Quick start

```bash
npm install
npm run verify     # typecheck, verifier tests, engine gate, token gate, accessibility gates (Node 22)
npm run preview    # serve the live preview at http://127.0.0.1:8080
```

`node scripts/verify-tokens.mjs --verbose` and `node scripts/palette-ceiling.mjs`
run with no dependencies at all.

## Is the form right?

Tested, not assumed. [The rule-set spike](docs/audit/rule-set-spike.md) ran 13
WCAG rules over 28 real documents against criteria registered before the run.
Three of four assumptions held: findings are mostly machine-decidable (18%
manual), anchor to text ranges (95%), and are plentiful (median 12 per
document). One failed: **only 4.8% carry an automatic fix**, which moved the
card's primary action from "Apply fix" to "Go to text".

## Three decisions worth knowing up front

1. **Colour never carries meaning alone.** Severity is encoded in underline
   shape, glyph and visible text. Measured with CIEDE2000, most severity pairs
   survive colour-vision deficiency — but red/amber (`blocker` vs `violation`,
   the most consequential distinction) collapses to dE 4.1, right on the axis
   red-green deficiency removes. A CVD-safe palette is achievable; it costs the
   conventional red/amber ramp, so we keep the ramp and carry meaning in shape,
   glyph and text instead. Re-test with `node scripts/palette-ceiling.mjs`.
2. **The findings list is the interface**, not the inline underline. No ARIA
   mechanism reliably exposes an arbitrary inline annotation, so anything only
   reachable through the prose is unreachable for some users.
3. **Nothing ever claims the document is compliant.** Automated checking covers
   roughly a third of WCAG. Findings that need human judgement get their own
   severity — `manual` — and the empty state says so.

> **On the name:** "Ada" here is the Americans with Disabilities Act, not the
> programming language. The Act is what motivates the product; the standards in
> the table above are what it actually checks.
