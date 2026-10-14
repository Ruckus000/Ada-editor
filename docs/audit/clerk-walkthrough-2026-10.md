# A clerk's path through Ada Editor, October 2026

**The question:** a town clerk hears about Ada Editor, creates an account, imports next week's agenda from Word, fixes what it finds and posts the PDF. Does that work on the live site, end to end, and where does it go wrong?

**What I looked at:**
- The live site, www.adaedit.com, on 12 October 2026, at release 4d26fc0. I drove it in the desktop app's browser and checked the phone size (375 px) along the way. The owner created the account, a fresh address, because I can't create accounts on a live site.
- One agenda, built to look like what clerks post. Its shape follows a Florida city commission agenda in the [agenda-platforms](agenda-platforms-2026-10.md) research sample. The evidence copy's items, date and wording are invented, so no town can be found from it. The agenda has the habits seen in the research:
  - section titles that are bold, underlined capitals rather than headings;
  - a table used only to lay out the officials' names;
  - a "click here" link, a web address typed as plain text, and a city seal with no alt text;
  - grey small print for the accommodation notice.
- The file was built with pandoc from [`agenda.html`](clerk-walkthrough-2026-10/agenda.html), not saved from Word, so a real clerk's file will differ in its styles and properties.
- Posting was simulated with the research's own transformations (`scripts/harness/pdf-variants.mjs`), not a real agenda portal. The checker's output for each is in [`check-posted.txt`](clerk-walkthrough-2026-10/check-posted.txt).
- Sentry, through the AdaEdit Sentry connection, for anything that crashed along the way: nothing did.

## The one-line verdict

**The path works, and the PDF it produces is valid PDF/UA-1. But an agenda's most important structure, its section headings, never gets flagged, and fixing a "click here" link the obvious way deletes the link.** A clerk who does everything Ada asks still posts an agenda that a screen reader user can't navigate by section.

*Both were fixed on 12 October 2026, the day of the walkthrough, and so were findings 3 to 5: each says how.*

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

**Fixed (#91).** The finding now offers **Turn into text** beside Apply fix. It replaces the table with its caption, then each cell's text in reading order, and drops empty cells. One-row tables, which had no fix before, get it too. The finding and Help say which to choose.

### 4. The document preview on the desk runs words together (should fix)

The desk shows "6:00 PMPolice Department…" and "MayorCommissioner, District 1Commissioner…". `excerptOf` (`app/_data/store.ts`) takes each block's `textContent`, which joins table cells and line breaks with nothing between them.

**What to do:** join the text with a space at cell and line-break boundaries. Add a case to the excerpt self-check in `scripts/verify-rules.mjs`.

**Fixed (#92), as described.** Documents already saved show it straight away, because the preview is computed when the desk loads.

### 5. On a phone, the findings are below the whole document (should fix)

At 375 px the findings list starts about 3,000 px down the page, after the agenda. The top bar shows the counts, but nothing takes you to the list.

**What to do:** a "Findings" link or button in the top bar on small screens that moves to the list. Clerks will mostly work on a desktop, so this comes after 1–4.

**Fixed (#93).** Below 64rem the top bar shows the count, such as "11 findings". It moves focus to the findings heading, and it's hidden where the findings sit beside the page.

### 6. Smaller things

- **The landing page talks to developers.** It mentions ProseMirror, an `issue.json` sample, "veraPDF in CI" and "row-level security". A clerk deciding whether to trust the product won't know these terms. The same points can be made in plain words. **Fixed (#110).** The same four points are still there, in plain words: "PDF exports tested with veraPDF", "check your document as you write", "only you can open them" (the privacy page's wording). The JSON sample is gone rather than replaced, because the page already shows a finding twice. Later that line became "no other account can open them", on the landing page and the privacy page alike: row-level security keeps other accounts out, but we can still open any document or image through the Supabase dashboard, so "only you" overclaimed.
- **"Upload a .docx" leads to the sign-up page,** which says nothing about uploading. Either say "Create an account to import your Word file" there, or call the button "Start writing". **Fixed (#108)** by naming it **Import a Word file**, the desk's own words. "Upload" also contradicted the "0 bytes uploaded" card beneath it. A new account's empty desk offers Import a Word file first, so the sign-up page didn't need to change.
- **The alt text dialog says "Describe what this image 1 shows".** Use "this image" (`app/_editor/dialogs.tsx`). **Fixed (#104)** in that dialog and in four other sentences that had the same wording. Button names and finding excerpts keep the number, because there it tells pictures apart.
- **The title comes from Word's file properties,** which clerks never see. This file's title was "Agenda". A real one may carry last month's meeting or the template's name. Show the imported title in the import announcement, and make it easy to change.

  **Fixed (#106).** The title now follows the document's main heading (its first H1), which the clerk sees and edits. Import takes the H1 before Word's Title property, and editing the H1 retitles the document, its tab and its exports. It turned out to matter for our own templates: their Title property is a placeholder, so every PDF made from one would have been titled "[Board or council name] agenda, [meeting date]". There's no Rename: the heading is the title, as the New document dialog already said.

## Export HTML, checked afterwards

*12 October 2026, at 0177203, after the fixes above.* The agenda was rebuilt as its header comment says, imported into the app in local mode, and every finding resolved the way a clerk would:
- Make it a heading on all 11 section titles;
- Turn into text on the officials table;
- Use default colours on the small print;
- "City seal" as the seal's alt text;
- "use the city's YouTube channel" typed over "click here".

The editor then reported no open findings, and Export HTML produced [`agenda-export.html`](clerk-walkthrough-2026-10/agenda-export.html), captured from the page byte for byte. Opened in headless Chrome:
- **axe 4.13.0, with the same WCAG 2.0–2.2 A and AA tags as the app gate, found no violations.**
- **The outline is the editor's:** one H1 and 11 H2s, one per section title.
- **What was fixed in the editor arrived in the page.** No table is left. The link kept its address. The seal has its alt text. No text is grey.
- **The page has `lang="en-US"`** (from the Word file) and **its `<title>` is "Agenda"**, the H1.

That H1 is a visible line, not a hidden property. pandoc writes `agenda.html`'s `<title>` as a paragraph in Word's Title style, which the importer makes the H1. So finding 1's "made from the file's title property" was wrong about where the heading came from. A clerk sees "Agenda" at the top and can retitle the page by editing it.

## What I didn't check

- A real Word file from a clerk, and a real agenda portal. The pilot covers both.
- Screen readers. CI runs NVDA, VoiceOver and Orca against the app, not against this agenda or its export.
- A second device picking up the same document.
- The sign-up email's wording. The owner received it; I didn't see it.

## Addition, 2026-10-14: what the screen readers in CI read

"What I didn't check" says CI runs NVDA, VoiceOver and Orca against the app. It doesn't. All three read only the design system's preview page, four finding cards built from the real components. None of them reads the app's screens, this agenda or its export. JAWS isn't run at all.

So screen readers are unchecked for the whole path a clerk takes, not just for this agenda. What CI does cover, and how reliably, is in the [screen reader test plan](../design-system/screen-reader-test-plan.md#where-the-ci-screen-readers-stand).
