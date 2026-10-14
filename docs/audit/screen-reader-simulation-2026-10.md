# Hearing a document as a screen reader would, October 2026

**The question:** the checker tells people to "check the table with a screen reader", and the guides say to have someone read the document "ideally with a screen reader". Most clerks don't have one or know how to drive one. Can Ada Editor let someone hear their document as NVDA or VoiceOver would, without installing anything, and still be honest about it?

**What I looked at:**
- Every real screen reader the repo runs: NVDA and VoiceOver through Guidepup (`tests/screen-reader/`, `.github/workflows/screen-reader.yml`) and Orca (`scripts/verify-orca.mjs`). All three read only the design-system preview page, never a document or its export.
- Guidepup 0.34.0 as installed. It drives NVDA on Windows and VoiceOver on macOS, in a browser. It has no JAWS support and no way to drive a PDF reader.
- The two exports. `exportHtml` writes the whole document-to-HTML mapping in one place. `exportPdf` builds its tags inside its layout pass, and the two differ in small ways: language spans, header and footer placeholders, and heading levels above 6.
- Every place the product describes what a screen reader says (`app/_engine/rules.ts`, `app/_editor/findings.ts`, Help, the guides).
- NVDA itself, reading two exported pages a line at a time in CI: the [reading pack](../../tests/screen-reader/readingPack.ts), one of each thing the HTML export writes, and the [clerk walkthrough's agenda](clerk-walkthrough-2026-10/agenda-export.html). There were two runs, 38571242354 and 38573095047, and each was retried. All four readings of the agenda were identical, and so were both readings of each version of the pack.

## The one-line verdict

**Yes, as a simulation: Export › "Hear it as a screen reader" lists what NVDA says, line by line, reading the document's HTML export. On both recorded pages it says exactly the words NVDA said, and it says that it's a simulation.**

## Decisions

### 1. Read the export, not the editor's document

The simulator (`app/_editor/screenReader.ts`) reads the page `exportHtml` has just built, the same bytes Export HTML downloads. A walker over the editor's own document would be a second copy of exportHtml's mapping (which cells are headers, a missing alt is no `alt` attribute, an unsafe link is no link) that has to change in step with it. This way there is one mapping, and the real reader and the simulation read the same page.

### 2. A screen reader gets words only once it has been recorded

Nothing in the repo had ever recorded what a screen reader says about a document, so any phrasing would have been a guess. The order was recordings first, then the simulation. Two gates now hold them together:
- `reading.nvda.spec.ts` has NVDA read both pages in CI and fails if it says anything different from the committed recording.
- `scripts/verify-rules.mjs` fails if the simulation's words differ from that recording.

A recording is committed by hand after reading it, never regenerated automatically.

The recordings settled things the code could only guess at:
- **An image with no alt text, and its figure, are silent.** NVDA doesn't even say "graphic".
- **An empty heading is skipped altogether.**
- **A bare web address is read in pieces:** "https slash slash example dot org slash agenda".
- **Merged cells really do confuse.** Below a cell spanning two rows, NVDA said "Vote, column 1" for the second column.
- **A typed blank (`____`) isn't read at all.**
- **Spanish text on a computer without a Spanish voice is read as "Spanish (not supported)"** and then in the English voice.

### 3. Correct the copy the recordings contradict

Two rules described NVDA wrongly, and the dialog would have shown the contradiction next to the finding:
- `link-text-raw-url` said an address is read "character by character".
- `heading-empty` said an empty heading "is announced as a heading with nothing in it".

Both now say what NVDA was heard doing. Three claims held, and I left them: an image with no alt text is "silent" and "announces nothing", and a blank is read as "a run of underscores, or not at all". [Decorative images](decorative-images-2026-10.md) says a screen reader "may read out the file name" of an image with no `alt`. For the exports' embedded pictures, NVDA doesn't.

### 4. NVDA first, VoiceOver next, no JAWS

Guidepup drives NVDA and VoiceOver and nothing else. JAWS needs a licence, and nothing here can record it, so a JAWS profile would be words nobody heard. VoiceOver gets its own recordings once its CI job is reliable (#135); until then the dialog names NVDA only.

### 5. The HTML export only, not the PDF

No reader can be recorded reading a PDF here. The PDF carries the same structure, built from the same document, but how Acrobat or Preview presents it is untested, and the dialog says the PDF isn't simulated.

### 6. A dialog in the Export menu, speaking only when asked

The dialog sits beside the export it describes, so the top bar gains nothing. It plays aloud with the browser's own voice, and only when asked: someone using a real screen reader would otherwise hear two at once. It points to the screen readers already on the user's computer: VoiceOver on a Mac, Narrator on Windows.

## What would change these decisions

- **Something the recordings don't hold**, such as a list inside a merged cell, or a symbol NVDA names that isn't recorded yet. It is read as plain text until it is added to the reading pack and re-recorded.
- **A runner update that changes NVDA's words.** The NVDA spec fails, and the recording is read again and re-committed.
- **A way to record JAWS, or a PDF reader, in CI.** Either would get its own recordings and words.
- **People needing to edit while they listen.** The dialog would become a panel beside the page.
