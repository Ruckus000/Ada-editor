# A clerk's path through Ada Editor, October 2026

**The question:** a town clerk hears about Ada Editor, creates an account, imports next week's agenda from Word, fixes what it finds and posts the PDF. Does that work on the live site, end to end, and where does it go wrong?

**What I looked at:**
- The live site, www.adaedit.com, on 12 October 2026, at release 4d26fc0. I drove it in the desktop app's browser and checked the phone size (375 px) along the way. The owner created the account, a fresh address, because I can't create accounts on a live site.
- One agenda, built to look like what clerks post. The items come from a Florida city commission's conference meeting of 6 October 2026, found by the [agenda-platforms](agenda-platforms-2026-10.md) sampler. The town is labelled, not named, so the evidence copy changes its address and the details that would identify it. The agenda has the habits seen in the research:
  - section titles that are bold, underlined capitals rather than headings;
  - a table used only to lay out the officials' names;
  - a "click here" link, a web address typed as plain text, and a city seal with no alt text;
  - grey small print for the accommodation notice.
- The file was built with pandoc from [`agenda.html`](clerk-walkthrough-2026-10/agenda.html), not saved from Word, so a real clerk's file will differ in its styles and properties.
- Posting was simulated with the research's own transformations (`scripts/harness/pdf-variants.mjs`), not a real agenda portal. The checker's output for each is in [`check-posted.txt`](clerk-walkthrough-2026-10/check-posted.txt).
- Sentry, through the AdaEdit Sentry connection, for anything that crashed along the way: nothing did.

## The one-line verdict

**The path works, and the PDF it produces is valid PDF/UA-1. But an agenda's most important structure, its section headings, never gets flagged, and fixing a "click here" link the obvious way deletes the link.** A clerk who does everything Ada asks still posts an agenda that a screen reader user can't navigate by section.

*Both were fixed on 12 October 2026, the day of the walkthrough: findings 1 and 2 say how.*

## What worked

- **Sign-up to desk.** Separate sign-up, a code by email, then an empty desk that explains itself, with a two-step tour offered rather than forced.
- **Import.** The Word file opened in the editor at once, read in the browser and never uploaded. It was announced as "2 blocking · 2 failing AA · 2 advisory".
- **Alt text, contrast and table headers each took one action.** Each fix was announced. Focus moved to the next finding.
- **The PDF passes.** veraPDF found no PDF/UA-1 failures in the export from the live site. The seal's alt text, the table headers, the link and the document language all made it into the tags.
- **Posting matches the research.** A plain re-save, or a replaced title, keeps everything that matters. Merging into a packet, or stripping the tags, loses them, and the checker says which rules then fail.
- **Nothing crashed.** Sentry recorded no errors during the walkthrough.

## Findings, most serious first

### 1. Section titles that look like headings aren't flagged (must fix)

Agendas mark their sections with bold, underlined capitals: "PUBLIC APPEARANCES", "CITY MANAGER'S REPORT", "OLD/NEW BUSINESS". Those nine lines imported as ordinary paragraphs, and no rule noticed. The only heading in the result was "Agenda", which the importer made from the file's title property, so the "no headings" and "no top-level heading" checks were satisfied. The exported PDF has one heading and 28 paragraphs.

This matters more than anything else here. Moving by heading is how screen reader users skim a long agenda to their item, and it's what WCAG 1.3.1 is about.

**What to do:** a new check for paragraphs that look like headings: short, all bold (or all capitals, or underlined), and followed by ordinary text. It should be a "needs your call" finding, because a machine can't be sure, with a one-click "Make it a heading". The fix should pick the level that keeps the outline in order. Agendas are the main case to test it against.

**What would change it:** if real clerks' Word files turn out to use Word's heading styles, which the importer already understands, this matters less. The pilot's own files will show.

**Fixed (#87).** A new check, `heading-unmarked`, asks about a top-level line of up to 12 words that is all bold or all heading-sized and doesn't end like a sentence. Apply makes it a heading: H1 if none comes before it, otherwise H2. It also removes the bold, size and underline that faked the heading. On the 28 real documents in the test corpus it fires 11 times: nine section titles and two names. A line set only in capitals or only underlined isn't counted yet; that's the next step if the pilot's agendas show it.

### 2. Typing over "click here" deletes the link (must fix)

"Go to text" selects the words "click here". Typing a better description over them, which is the obvious thing to do, removes the link and its address. The finding then disappears, so it looks fixed. The link dialog can't help either: it edits the address, not the words. The only way to keep the link is to retype the words, select them, and paste the address back in.

The cause is that links are non-inclusive in the editor (`inclusive: false` in `app/_editor/editorSchema.ts`), so text typed over the whole link doesn't inherit it.

**What to do:** give the link dialog a "Link text" field, and open it from the finding, so that fixing link text never touches the address. Typing over a whole selected link could also keep the link, but the dialog is the clearer fix.

**Fixed differently (#85).** Working on it showed the cause is the editor's typing, not the dialog. So the fix keeps a link when its words are typed over, on every route to it, and needs no new controls. Typing after a link the cursor has moved to still isn't linked. Pasting over a link, and IME or Android input, still drop it; that's marked in the code.

### 3. The table fix is wrong for layout tables (should fix)

The officials' names were laid out in a table. The checker said "Blocks access: table has no header cells" and offered "Make the first row a header row". Applying it made "Mayor" and two commissioners column headers, so a screen reader now reads "Vice Mayor" as a value under "Mayor". That's worse than before, and the finding counts as fixed.

**What to do:** when a table has no headers, offer a second way out: "This table is only for layout", which turns it into paragraphs. The help page's "how to fix it" should say the same.

### 4. The document preview on the desk runs words together (should fix)

The desk shows "1:05 PMPolice Department…" and "MayorCommissioner, District 1Commissioner…". `excerptOf` (`app/_data/store.ts`) takes each block's `textContent`, which joins table cells and line breaks with nothing between them.

**What to do:** join the text with a space at cell and line-break boundaries. Add a case to the excerpt self-check in `scripts/verify-rules.mjs`.

### 5. On a phone, the findings are below the whole document (should fix)

At 375 px the findings list starts about 3,000 px down the page, after the agenda. The top bar shows the counts, but nothing takes you to the list.

**What to do:** a "Findings" link or button in the top bar on small screens that moves to the list. Clerks will mostly work on a desktop, so this comes after 1–4.

### 6. Smaller things

- **The landing page talks to developers.** It mentions ProseMirror, an `issue.json` sample, "veraPDF in CI" and "row-level security". A clerk deciding whether to trust the product won't know these terms. The same points can be made in plain words.
- **"Upload a .docx" leads to the sign-up page,** which says nothing about uploading. Either say "Create an account to import your Word file" there, or call the button "Start writing".
- **The alt text dialog says "Describe what this image 1 shows".** Use "this image" (`app/_editor/dialogs.tsx`).
- **The title comes from Word's file properties,** which clerks never see. This file's title was "Agenda". A real one may carry last month's meeting or the template's name. Show the imported title in the import announcement, and make it easy to change.

## What I didn't check

- A real Word file from a clerk, and a real agenda portal. The pilot covers both.
- Screen readers. CI runs NVDA, VoiceOver and Orca against the app, not against this agenda.
- Export HTML, and a second device picking up the same document.
- The sign-up email's wording. The owner received it; I didn't see it.
