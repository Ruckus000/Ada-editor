# Implementation Plan: The Real Checking Engine

## What I read

README.md, app/_data/fixtures.ts, app/_editor/findings.ts, app/_editor/EditorScreen.tsx, app/_editor/editorSchema.ts, app/_dashboard/Dashboard.tsx, app/editor/[docId]/page.tsx, app/page.tsx, docs/audit/rule-set-spike.md, scripts/spike/rules.mjs, scripts/spike/report.mjs, scripts/spike/fetch-corpus.mjs, docs/design-system/patterns-suggestion.md, docs/design-system/accessibility-standard.md, design-system/primitives/types.ts, design-system/primitives/severity.ts, scripts/verify-a11y-app.mjs, package.json, next.config.ts, app/Providers.tsx. No CLAUDE.md exists anywhere in the repo.

Relevant facts that shape the plan:
- `linkedom` and `marked` are **devDependencies**, not `dependencies` — the repo's own package.json comment says runtime deps serve "the design-system primitives," dev deps "drive the verification harness." The spike's DOM approach was explicitly a build-time/Node-only tool, never intended to ship to the browser.
- There is no server code anywhere — no `app/api/*`, no server actions, no `'use server'`. Every screen is `'use client'`. `app/editor/[docId]/page.tsx` uses `generateStaticParams()` over the static `DOCS` array, i.e. today the doc list is baked in at build time.
- `EditorScreen.tsx` already contains a working, if fake, "live checking" apparatus: a 900ms debounce (`checkTimer`/`markChecking`) that flips a `checking` status dot, and a **synchronous, non-debounced** reconcile in `dispatchTransaction` that adds/removes the one real rule that exists today — "figure has no alt text" (`imageFinding`) — on every keystroke, using stable ids (`img-alt-${id}`) and a `dismissedRef` set so dismissed findings don't reappear. This is the template the real engine should generalize, not replace.
- `EditorFinding`/`Anchor` (app/_editor/findings.ts) currently supports only `text`, `figure`, `section` anchors. `Issue` (design-system/primitives/types.ts) requires `from`/`to` PM positions on every finding.
- `editorSchema.ts` has no `table` node and no document-language attribute anywhere in the data model.

---

## 1. Architecture: client-side, operating on the live ProseMirror doc — no server round trip

**Recommendation: run the checker entirely in the browser, directly against the live `PMNode` tree, with no API route.**

Reasons, grounded in what's in the repo:
- The 13 rules in `rules.mjs` are pure, cheap, synchronous JS: regex matching, a hand-rolled Flesch-Kincaid calculation, and tree walks. Nothing here needs a server (no LLM call, no external service, no heavy computation). Routing this through a Next.js API route would add network latency and a request/response serialization step for no benefit — the entire point of `EditorScreen`'s existing figure-reconcile pattern is that findings update synchronously as you type, in the same tick as the transaction.
- `linkedom` is deliberately a devDependency. Promoting it to a runtime dependency to run DOM-shaped rules in the browser would contradict the project's own stated separation of "runtime deps for the product" vs. "dev deps for the verification harness," and would ship a Node-DOM shim to the browser bundle for something the browser already has natively (though see point 2 — native DOM isn't the right target either).
- A server-side checking endpoint only becomes justified when checking needs something the browser can't do cheaply (e.g., a real spellchecker service, an LLM-based rule, virus-scanning an uploaded .docx). None of the 13 spike rules need that. If/when file-upload-and-check (open question 7 below) becomes real scope, *that* is a plausible reason for a server route (parsing an uploaded .docx/PDF happens once, server-side, then hands ProseMirror JSON to the client) — but that's a different, larger feature than "check what's in the editor."

## 2. Rule engine: port to walk the ProseMirror doc directly, not via HTML/linkedom

**Recommendation: port the 13 rules to operate on `PMNode` via `doc.descendants`, not by serializing to HTML and reusing `rules.mjs` verbatim.**

Why, specifically:
- `EditorScreen.tsx` and `findings.ts` already establish the pattern (`figurePos`, `wordsIn`, the `doc.forEach` in `buildDocument`) — walking the PM tree with `doc.descendants((node, pos) => ...)` is the codebase's existing idiom, not a new one being introduced.
- PM tree-walking gives exact `from`/`to` positions **for free**, in exactly the coordinate space `Issue.from`/`to` already requires. The HTML route would require: (a) a DOM serializer (`prosemirror-model`'s `DOMSerializer`, using `document.implementation.createHTMLDocument()` since linkedom isn't shippable — itself extra machinery not in the repo today), then (b) a position-mapping layer translating DOM text offsets back into PM document positions, which is genuinely fragile once marks split text nodes, node attrs (indent, figure alt) don't round-trip losslessly through generic HTML, and the schema's custom nodes (`figure`) don't map to real `<img>`. That mapping layer is new, untested surface area the direct-PM approach avoids entirely.
- The rules' actual logic is almost entirely string-analysis on already-extracted text (`GENERIC_LINK_TEXT`, `COLOUR_WORDS`/`COLOUR_REFERENCE`, `REDUNDANT_ALT_PREFIX`, `syllables`, `gradeLevel`). None of that is DOM-specific — it operates on plain strings today (`text(node)` just does `.textContent.replace(/\s+/g,' ').trim()`). This logic ports essentially unchanged; only the *traversal* layer (`doc.querySelectorAll('img')` → PM node walk) needs rewriting, which is a small, mechanical translation, not a redesign.
- The one place the DOM approach was doing real work rules.mjs's PM equivalent doesn't get "for free" is reconstructing contiguous link spans across text-node boundaries (PM coalesces adjacent equal-mark text automatically in most edit paths, but a defensive same-mark run-merge is still needed when walking `descendants`) — this is a small, well-scoped piece of new code, not a blocker.

## 3. Persistence: localStorage, not a database — this is a scoping decision, stated explicitly

There is no auth, no user accounts, no backend, no hosting decision made anywhere in this repo. Standing up a real database now would mean inventing an auth model this product doesn't have yet, purely to persist a handful of documents for one implicit local user. That's the premature-generality pattern the repo's own file-by-file style argues against.

**Recommendation for v1:** a `app/_data/store.ts` module backed by `localStorage`, storing:
- The document's ProseMirror content as `doc.toJSON()`.
- Lightweight metadata: id, title, owner, targets, `lastChecked` timestamp.
- **Not** the findings themselves — recompute findings by re-running the rule engine against the loaded doc on read. Rules are cheap and deterministic; caching results risks staleness bugs.

Consequence: `DocSummary.counts` (used by the Dashboard for severity bars, sort-by-urgency) currently are hand-authored numbers with no connection to any document content. Once real documents persist, the Dashboard must compute these by running the checker over every stored document's content, not read a static field.

Known limitation: no cross-device sync, no collaboration, no server-side audit trail, lost on "clear browsing data." Acceptable v1 tradeoff given there is no auth to hang real persistence off of yet — but should be named, not silently accepted.

## 4. When checking runs, and the "card disappears under you" problem

**Recommendation: run the full rule engine synchronously in `dispatchTransaction` on every doc-changed transaction** — the same place the figure-alt reconcile already runs today — and keep the existing 900ms debounce **purely cosmetic**, gating only the "Checking…" status dot, exactly as it does now. Don't gate finding computation behind the debounce; gate the UI's claim that it's still checking behind it.

This works because the rules are cheap, and because it changes the least: generalizing the existing synchronous figure-alt reconcile avoids two different "is this finding still valid" mechanisms coexisting. If a real document turns out large enough that synchronous full-doc execution causes typing jank, that's the trigger to move computation onto the debounce — after measuring, not by default.

**The disappearing-card problem needs a specific fix:** a naive "regenerate the whole findings array from scratch on every check" would assign different ids or lose `dismissedRef` continuity, silently un-dismissing findings or reassigning `activeId` to a different logical finding.

Concrete design, extending the pattern already proven for figures (`img-alt-${id}`, a content-derived stable id, not a position-derived one):
- Each rule produces a **stable id** derived from `${ruleId}:${structural-locator}`, not from `from`/`to`. For node-anchored rules the locator is the node's own identity (figure `id` attr; headings/paragraphs use ordinal index among same-type siblings).
- On every recompute, diff the new finding-id set against `findingsRef.current`: ids present in both keep their existing object (activeId/focus/scroll state stays valid); ids only in the old set are dropped; ids only in the new set are added, filtered through the existing `dismissedRef`.
- Net effect: a finding only disappears when its own flagged text actually changes or is dismissed; it survives edits elsewhere in the document.

## 5. Rule coverage for v1 — port most of the 13, explicitly defer two, don't add new ones

**Port directly (11 rules, map cleanly onto the current schema):**
`img-alt-missing`, `img-alt-suspicious`, `link-text-generic`, `link-text-raw-url`, `link-text-ambiguous`, `heading-skip`, `heading-empty`, `document-no-h1`, `reading-level`, `long-sentence`, `colour-only-reference`.

**Defer explicitly, with reasons:**
- `table-no-header` — `editorSchema.ts` has no `table` node at all. Dead code until tables ship in the schema.
- `document-language` — no language field anywhere in the data model. In the spike, this rule fired on every document (Markdown has no language declaration) — the spike's own Limitations section calls this "noise for a Markdown source." Needs a product decision before it's meaningful.

**Consequence worth naming:** several finding types currently shown by fixture data ("Form fields have no labels," "change of language is not marked," "meaning relies on a symbol") have **no corresponding rule** — they were fixture-author inventions, not validated rules. When fixtures are replaced, these stop appearing unless someone writes real rules later. The demo documents will look sparser and more blocker/advisory-heavy, matching the spike's actual severity distribution (45% blocker, 6% violation, 30% advisory, 18% manual).

## 6. Contract change needed: `Anchor` must gain a `document` case

`rules.mjs`'s `document-no-h1` (and deferred `document-language`) use `anchor: 'document'` — a finding not tied to any text range. The current `Anchor` union has no way to represent this. Recommend adding `{ kind: 'document' }`.

Downstream implications: no inline underline (correct, no range); `onGoTo` in `EditorScreen.tsx` needs its own behavior for this case — most plausibly scroll-to-top/focus the heading, or omit "Go to text" and show only "Dismiss" since there's nowhere to navigate to. Does not threaten the spike's F3 result (94.6% range-anchored, well clear of the 50% failure threshold) — document-anchored findings stay rare, but rare isn't zero.

## 7. Concrete file-level plan (dependency order)

1. **`app/_engine/textHelpers.ts`** (new) — port pure string-analysis from `scripts/spike/rules.mjs` to TS: `GENERIC_LINK_TEXT`, `COLOUR_WORDS`, `COLOUR_REFERENCE`, `REDUNDANT_ALT_PREFIX`, `syllables`, `gradeLevel`. No DOM, no PM — pure functions on strings, unit-testable in isolation.
2. **`app/_engine/rules.ts`** (new) — the 11 ported rules, each `{ id, criterion, run(doc: PMNode, meta) => EngineFinding[] }`, walking `doc.descendants` (mirroring `figurePos`/`wordsIn` in `EditorScreen.tsx`). Link-text rules need a small helper to enumerate contiguous `link`-marked text runs.
3. **`app/_engine/check.ts`** (new) — `checkDocument(doc: PMNode): EditorFinding[]`, runs every rule, assigns stable ids per §4, maps into the existing `EditorFinding`/`Issue` shape. Direct replacement for the finding-manufacturing half of `buildDocument`.
4. **`app/_editor/findings.ts`** (modify) — `buildDocument` stops taking pre-tagged findings; only builds the PM doc. Findings come from `checkDocument(doc)` called at mount and after every transaction.
5. **`app/_editor/EditorScreen.tsx`** (modify) — in `dispatchTransaction`, replace the figure-only reconcile with `checkDocument(next.doc)` reconciled against `findingsRef.current` by stable id, preserving `dismissedRef`. Keep the 900ms timer but make it purely cosmetic.
6. **`app/_data/store.ts`** (new) — localStorage-backed CRUD: `loadDocs()`, `saveDoc(id, patch)`, `createDoc(seed)`. Returns `DocSummary` with `counts` computed via `checkDocument`, not stored.
7. **`app/_data/fixtures.ts`** (modify/retire) — seed data becomes one-time localStorage seed, or is deleted once `store.ts` exists, per the module's own comment. Keep `OPEN_SEVERITIES`/`OpenSeverity`, move to a non-fixture home (e.g. `design-system/primitives` or `app/_engine`).
8. **`app/editor/[docId]/page.tsx`** and **`app/page.tsx`** (modify) — currently server components using `generateStaticParams()` over the static `DOCS` array; incompatible with localStorage-backed docs. Needs converting to client-side data loading. Real architectural change forced by §3, not a detail.
9. **`app/_editor/findings.ts`**'s `Anchor` type (modify) — add `{ kind: 'document' }` per §6, give `onGoTo`/card-actions a branch for it.
10. **`scripts/verify-rules.mjs`** (new) — following `scripts/test-verifier.mjs`'s style (plain Node, hand-rolled assertions): builds PM docs directly via `schema`, asserts `checkDocument` finds/doesn't-find what's expected per rule. Add to `npm run verify`'s chain in package.json.

Not in scope for this plan: wiring Dashboard's "New document"/"Re-run checks" buttons (currently `notYet(...)` stubs) to `store.ts` — needed to exercise the pipeline end-to-end, but is UI wiring, should be its own follow-up once the engine exists.

## 8. Open questions — resolved

1. **Check timing: structural rules live, prose-heuristic rules gated.** Node-based rules (`img-alt-missing`, `img-alt-suspicious`, `heading-skip`, `heading-empty`, `document-no-h1`, link-text rules) run synchronously on every keystroke via §4/§9's memoized reconcile — they can't false-positive on partial input. Prose-heuristic rules (`reading-level`, `long-sentence`, `colour-only-reference`) only (re-)run on blur or the explicit Recheck action, so they never flag a sentence still being typed. Decided on false-positive-avoidance grounds, not performance — §9 confirmed the memoized engine is cheap enough that this split isn't needed for smoothness, only for correctness of what gets flagged when.
2. **v1 scope: authoring only.** The engine checks content written in Ada's own ProseMirror editor — no file upload, no .docx/PDF parsing, no server route. This matches everything already built (toolbar, figure/header/footer support) and keeps this plan's scope buildable. Upload-and-check (parsing existing Section 508/PDF/UA-target documents, which is what the README's conformance table is really about) is real, larger, later work — explicitly out of scope for this pass, to be scoped separately when it comes up.
3. **Document-language rule: deferred.** No `language` field exists anywhere in the data model (`DocSummary`, `DocContent`, or the PM schema), and inventing one now would be a product decision (default value? per-document override? UI for it?) with no immediate need behind it. `document-language` stays out of the v1 rule set per §5 — revisit only when there's an actual reason to track document language (export, genuine multi-language support). *Revisited:* documents now carry a language (the doc node's `lang`, English by default, set in the editor header or from a .docx's default language), the export declares it, and the engine's `document-language` asks when most of the text reads as another language; the English-only prose checks run on English documents only.
4. **Dashboard-wide recompute cost: resolved (see §9.6).** Confirmed cheap at realistic scale — localStorage's ~5MB quota caps document count well before recompute cost becomes visible. Recompute-on-load, no caching, as originally proposed in §3.

### Critical files
- scripts/spike/rules.mjs
- app/_editor/findings.ts
- app/_editor/EditorScreen.tsx
- app/_editor/editorSchema.ts
- app/_data/fixtures.ts
- app/editor/[docId]/page.tsx
- design-system/primitives/types.ts

---

## 9. Efficiency & dependency review (Fable agent, benchmarked)

Reviewed against two goals: keep the app smooth, and add zero (or as close to zero as possible) new dependencies. Grounded in actual timings (Node 20, V8; medians of 15 runs) of the ported rule logic and a real ProseMirror-tree-walk prototype, not estimates. Benchmark scripts live in the session scratchpad if reproduction is wanted.

**Headline numbers** (full engine, doc → findings, per keystroke):
| words | ~pages | engine cost |
|---|---|---|
| 500 | 1 | 0.14 ms |
| 2,000 | 4 | 0.48 ms |
| 10,000 | 20 | 2.33 ms |
| 50,000 | 100 | 12.4 ms |
| 200,000 | 400 | 68 ms |

Against a 16.7ms frame budget (which also has to fit PM's own DOM update and React's re-render), 20-page documents are fine, 100-page documents are marginal, 400-page documents visibly jank. `doc.descendants` itself is free (0.02–0.1 ms even at 200k words); essentially all cost is `gradeLevel`'s syllable-counting regexes.

### Adopt now, before writing the engine (not "measure later")

1. **Per-textblock memoization via `WeakMap<PMNode, BlockResult>`.** ProseMirror keeps untouched nodes reference-identical across edits (confirmed: editing one character left 834/835 top-level nodes `===` to the pre-edit doc), so caching each textblock's rule results against the node object turns every unchanged paragraph into a zero-cost cache hit. Steady-state per-keystroke cost becomes ~0.015 ms (one changed block) instead of the whole-document numbers above. ~15 lines, no dependency — just `prosemirror-model` node identity. This replaces the plan's original "debounce if it turns out to jank" fallback, which was also the wrong fallback anyway: a debounced compute runs against a doc that's already moved on, so you'd need `tr.mapping` reconciliation on top regardless.
   - Cache **block-relative** offsets in the memo; let the live walk supply absolute `pos` (positions shift on edits elsewhere; node identity doesn't).
   - Cross-block rules (`heading-skip`, `document-no-h1`, `link-text-ambiguous`) should read cached per-block summaries rather than re-extracting text.

2. **The structural-vs-prose-rule live/gated split (open question 1) is a false-positive-avoidance decision, not a performance one — decide it on those grounds.** With memoization in place, cost is a non-issue either way; nothing in the rule set is expensive enough to force debouncing on performance grounds alone.

3. **Fix the §4 stable-id design before implementing it — the ordinal-among-siblings locator doesn't deliver the guarantee the section claims.** An id like `heading:3` shifts for every block below an inserted/deleted paragraph — pressing Enter above a dismissed finding re-keys it, silently un-dismissing it and reassigning `activeId` to the wrong finding. That's the exact bug §4 exists to prevent. Fix: derive the id from the flagged text itself — `${ruleId}:${snippetText}` (with a collision ordinal for duplicate snippets) — which is already computed for the card's excerpt. Gives "id changes iff the flagged text changes" literally, at no extra cost, no hashing library needed.

4. **Preserve object/array identity across recomputes, not just ids.** When a rule's finding is unchanged (same id, same `from`/`to`), return the *same* object; when nothing in the document's findings changed, return the *same* array. `EditorScreen.tsx` currently passes a fresh array to `setFindingsState` every keystroke regardless, which re-renders the whole findings list (sort, four filter passes) and re-fires the findings effect even on no-op edits. This is the cheap way to skip that work on the common case.

5. **Fold in a fix for an existing double-render bug this work touches anyway:** today, the underline decoration layer builds once against *stale* findings (before the reconcile runs) and once more against the real findings via a second dispatched transaction — two `DecorationSet.create` calls and two `view.updateState` calls per keystroke. Computing findings before `view.state.apply(tr)` and writing them to the ref first collapses this to one of each. Scales with finding count (measured 1.1 ms at ~950 decorations), so worth doing while touching this code path regardless of engine cost.

### Resolved, not just flagged

6. **Open question 4 (Dashboard-wide recompute cost) is resolved, not unmeasured:** at realistic scale (8 fixture-sized docs, or even 50 docs × 10k words) recompute-on-load costs single-digit-to-~130ms *once per Dashboard load*, and 50 docs × 10k words is already ~4MB of JSON — near localStorage's ~5MB quota. Storage caps document count before compute becomes a visible problem. No caching layer needed for `counts`; the plan's "recompute, don't cache" call in §3 was already right.

### Dependencies: zero new runtime deps is achievable — state it explicitly

7. **Nothing in the ported engine needs a package.** `textHelpers.ts` is `String`/`RegExp`/`Set` only. `rules.ts`/`check.ts` need only `prosemirror-model`, already a dependency. `store.ts` needs only `localStorage`/`JSON`. Add one line to §7: *"No new `dependencies`; the PR's `package.json` diff must be empty for the `dependencies` block."* Name and rule out, explicitly, the packages an implementer might otherwise reach for:
   - **Readability libraries** (`text-readability`, `syllable`) — don't use one. The hand-rolled `syllables`/`gradeLevel` is what the rule-set spike's 156 `reading-level` findings were validated against; a library with different syllable-counting would silently change validated numbers.
   - **Debounce utilities** (`lodash.debounce`) — `EditorScreen.tsx` already has a 4-line `setTimeout` debounce for the status dot; nothing else needs one.
   - **Id-generation libraries** (`uuid`, `nanoid`) — wrong tool: item 3's ids must be deterministic/content-derived, not random.
   - **Hashing libraries** — unnecessary; use the snippet string itself as the map key.

8. **`linkedom`/`marked` staying dev-only is confirmed correct** — neither is imported anywhere under `app/` or `design-system/` today, and nothing in the new client engine touches a DOM. One adjacent note: `scripts/verify-rules.mjs` (§7 step 10) needs to load TS (`editorSchema.ts`); don't add `tsx` as a new devDependency for this — `esbuild` is already present for exactly this purpose (bundling TS for the a11y gate) and should be reused the same way.

9. **One correctness fix to the link-run-merge design (§2/§7 step 2):** merge contiguous link-marked text runs by checking `schema.marks.link.isInSet(child.marks)` + matching `href`, not by requiring the full mark set to match. A link with inner formatting ("click **here**") has two text nodes with different complete mark sets — a full-mark-set merge would miss it and `link-text-generic` would never fire on "click here" split across a bold run. Full-mark-set merging is otherwise rare since `Fragment.fromArray` already coalesces truly identical-markup adjacent text nodes.

10. **One Safari-compatibility fix, since it's exactly the kind of thing that tempts a future dependency:** `long-sentence`'s split regex uses a lookbehind (`/(?<=[.!?])\s+/`). Next's shipped default browserslist still includes Safari 12, which predates lookbehind support, and SWC won't transpile it — a regex literal like this is compiled at module parse, so it would throw on load for those browsers. The fix a future implementer might reach for is a regex-polyfill package; the actual fix is free: use a capture-and-rejoin split (`split(/([.!?])\s+/)`, pairing each piece with its terminator) instead. Worth noting directly in §7 step 1 so the "port verbatim" instruction doesn't carry this bug forward.

**Confirmed correct, no change:** walking the PM tree instead of serializing to HTML/DOM is the cheaper choice by measurement too (2.3ms vs 3.3ms at 10k words, before memoization — which the DOM path can't do at all, since it rebuilds nodes on every serialization). `dismissedRef` and `tr.mapping`-based position carrying need no change.
