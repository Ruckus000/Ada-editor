# Agenda platforms and tagged PDFs, October 2026

**The question:** a town clerk exports a tagged PDF from Ada Editor and posts it through the town's agenda system. Is it still accessible when a resident opens it?

**What I looked at:**
- 23 public files from 9 Florida towns and cities on 7 agenda platforms, from meetings held between July and October 2026.
- Spot checks in Boulder CO, Burbank CA, Dubuque IA, Wethersfield CT and Battle Creek MI.
- Vendor documentation, accessibility statements and release notes.
- The full evidence is in [`agenda-platforms-2026-10/`](agenda-platforms-2026-10/): [the report](agenda-platforms-2026-10/report.md) and [the four research notes](agenda-platforms-2026-10/notes/).

## The one-line verdict

**The merge is where accessibility is lost, not the file.** Most platforms leave a clerk's PDF alone on its own attachment link. They break it when they combine it with everything else into one agenda packet. And if the clerk uploads the Word file instead, the platform converts it and the tags are usually gone before anything is published.

## How we got here

This decision came out of three steps, all taken in October 2026.

1. **A review of the plan to sell to Florida towns.** The owner had a business review written of the outbound plan: audits and fixes sold to small towns below their purchasing thresholds. Its central finding was that the problem towns can't fix in one pass is not a list of website pages but the documents clerks post every week (agendas, minutes, forms, packets). Fixing 15 PDFs once doesn't stop next week's packet from being inaccessible, and documents posted after the DOJ Title II compliance date get no exemption. It proposed an accessible-documents program sold to clerks.
2. **Does Ada Editor solve that?** Partly. It covers documents that start in Word or are written in it: it checks them as they're written and exports a tagged PDF/UA-1 that CI validates with veraPDF. It doesn't cover scanned or third-party PDFs, the packet as a whole, or the website. That left an open question that decides whether the product promise holds: **do agenda platforms keep Ada's tags once the clerk posts the file?**
3. **Research on the platforms.** Four research threads: one per vendor group (Granicus; CivicPlus and Municode; Diligent, eSCRIBE, OnBase and others) and one that downloaded and inspected real Florida files. The [report](agenda-platforms-2026-10/report.md) reconciles them.

## Method and its limits

- **Structure, not validation.** Every finding comes from reading the files' internals: the tag tree (StructTreeRoot), MarkInfo, `/Lang`, the ParentTree, page `/StructParents` keys, tag counts by type, and Producer strings. Nobody ran veraPDF or PAC on a platform's output.
- **Small samples.** Most platforms rest on one or two towns, and a town's own settings may change the result. PrimeGov/OneMeeting gave opposite results in two towns.
- **Not tested.**
  - eSCRIBE and BoardDocs blocked automated downloads.
  - No Florida town on Granicus Peak was found.
  - NovusAGENDA has been retired.
  - Most Granicus help articles require a login, so they're known only from search snippets.
- **The strongest test is a paired comparison:** the same document taken as its own attachment and taken from inside the packet. Pages that still point into a structure tree that no longer exists (orphaned `/StructParents`) show tags were removed during the merge. They rule out the other explanation, that the clerk uploaded an untagged file.

## What we found

| Platform | Ada PDF on its own attachment link | Ada PDF inside the packet | Word file uploaded instead | Evidence |
|---|---|---|---|---|
| Legistar | Kept. Re-saved, and its title is replaced with the file number | No packet to test | Converted to a tagged PDF | Strong for attachments |
| PrimeGov / OneMeeting | Kept in Oviedo FL, **removed** in Boulder CO | **Removed** (both towns) | Untagged | Strong for packets |
| CivicClerk | Kept, served as uploaded | Tags and headings kept, but the document language and title are dropped and the page stamps aren't marked, so it **fails PDF/UA** | Thinly tagged (paragraphs only) | Strongest packet evidence |
| Municode Meetings | **No attachment link**, only "Agenda" and "Agenda Packet" | **Removed** (2 of 2 towns) | Not tested | Strong for packets |
| Diligent Community / iCompass | Only Diligent's rebuilt PDFs are public | **Re-tagged as plain paragraphs**, yet labelled PDF/UA-1 | The vendor says not to rely on it | One town |
| CivicPlus Agenda Center | Kept, served as uploaded | Untagged when the platform builds it; the clerk can upload their own | Not tested | Moderate |
| OnBase (Tampa) | Kept, served as uploaded | None published | Untagged | One meeting |

No vendor claims its packets keep tags. Granicus, Diligent and a Laserfiche reseller explicitly leave attachment accessibility to the customer. The vendors' own answer is an HTML copy alongside the PDF: CivicPlus's DocAccess, also licensed to Diligent from September 2026, and Granicus's PDF tool, which is still a preview. DocAccess says the original PDF stays "unchanged as the official record".

## Decisions

The owner approved these on October 8, 2026.

### 1. Tell clerks how to post: upload the PDF, link the document itself

The guidance is in the Help page under **Posting a PDF to your agenda system** (`app/help/page.tsx`):
- Upload the exported PDF, never the Word file.
- Link residents to the document's own attachment, not only the packet.
- Where the system publishes only a packet, also post the PDF on the town website.

**Why:** these are the only paths on which the evidence shows the tags surviving. Telling clerks costs nothing, and without it most clerks would upload Word (it's what they have) and link the packet (it's what they post). The product copy doesn't name vendors: the samples are too small to put a claim about a named company in the product, and the behaviour can change with each release.

### 2. Describe it narrowly in sales

- **Say:** the document is accessible when it leaves the clerk's desk, and stays that way wherever the platform posts the file as-is. Ada can show the clerk whether it did.
- **Don't say:** "accessible on any platform", "compliant", or anything that rests on a PDF/UA label.

**Why:** the broad claim is false on Municode Meetings and on OneMeeting in some towns. And the label proves nothing: Diligent and CivicClerk both stamp PDF/UA-1 on files with no headings or tables. Ada's case is the structure it keeps (headings, tables, alt text, reading order), so the pitch names that structure. This follows the existing rule: never claim compliance the tool can't verify ([principles](../design-system/principles.md), §3).

The vendors' move to HTML copies helps this position. Ada isn't competing to make packets accessible, which no vendor has managed in PDF. It's competing to be the accessible original those HTML views and attachment links point back to.

### 3. Write the language on the root tag as well as the catalog

`exportPdf.ts` now writes `/Lang` on the root `Document` element as well as in the catalog, and `verify-pdf.mjs` checks both.

**Why:** CivicClerk's packets dropped the catalog's `/Lang` but kept each file's structure tree, including element-level `/Lang`. So the language set on the root tag should survive where the catalog entry doesn't. It costs one line, and the PDF stays valid PDF/UA. That it survives in a real CivicClerk packet is an inference until the pilot below tests it.

### 4. A command-line checker now; a version in the app later

`npm run check-posted` takes the original Ada PDF and the posted copy (a file or a public link). It reports whether the file was served unchanged, and whether its tags were kept, removed or flattened. It also reports whether the language and title survived, which PDF/UA rules newly fail (veraPDF), and whether the posted copy looks like a packet.

Before relying on it, I ran it on two pairs of public files from the research:
- **Eatonville's agenda against its Municode Meetings packet** gave "removed": no tree, 26 pages still pointing into one, and the language dropped.
- **Fort Lauderdale's stored Legistar attachment against the copy the public link serves** gave "kept": 515 elements on both sides, but the title replaced with the file number.

Both match what the research found by hand. It compares veraPDF results rule by rule, so a rule can show as "new" only because a different rule failed in the original. For example, Word's PDF fails "no metadata" while the packet fails "metadata without the PDF/UA identifier". Ada's exports always carry metadata, so the pilot won't see this.

**Why a script first (the owner's choice):**
- **No server code yet.** Ada Editor runs on Vercel, but no code of ours runs there: Vercel serves the pages, and checking and export run in the browser. A checker that fetches a pasted link would be the app's first server route.
- **The route needs guarding** so it can't be pointed at internal or arbitrary addresses.
- **veraPDF is Java.** Vercel Functions don't run Java, so it would need Vercel Sandbox or a separate service.
- **Server fetches get blocked.** eSCRIBE and BoardDocs blocked automated downloads during the research.
- **Demand isn't proven.** Until clerks show they want to check files themselves, the script does the job the pilot needs at no running cost.

### 5. No packet builder, and no PDF upload or repair, for now

**Why:**
- **A packet builder only helps where the clerk controls the packet file.** That's confirmed for Agenda Center and town websites, and likely for Legistar. On CivicClerk, Municode Meetings and OneMeeting the platform builds the packet whatever Ada produces.
- **Real packets are mostly other people's PDFs.** Scanned resolutions, contracts, maps and vendor PDFs, mostly untagged. A builder would have to import and repair those, which is PDF remediation: a much larger product with established competitors.

## What would change these decisions

- **The pilot shows most target towns publish only a packet** (Municode Meetings is common among small Florida towns): look again at a packet builder, or at a PDF the clerk uploads in place of the platform's packet.
- **Clerks ask to check posted files themselves:** move the checker to a Vercel route that fetches the link (with the guarding above), with veraPDF in Vercel Sandbox.
- **A vendor ships packets that keep tags:** update the Help guidance and the platform table above. Granicus's 2026 release notes already mention a fix for attachments losing "accessibility features" in publishing; it hadn't reached Boulder's files in September 2026.
- **The pilot contradicts a row of the table:** the pilot wins. The table is structural inspection of a few towns; the pilot is a known file through a real account.

## Pilot: one known file through each platform

The decisive test the research couldn't run. A cooperating clerk posts a known Ada test file, and we compare what the public receives.

1. **Make the test file.** Export a seed document that has headings, a table with header cells, a figure with alt text, a Spanish passage and a title. Keep the file.
2. **The clerk posts it** as an item attachment at a real meeting, or in a test meeting if the platform allows one, uploading the PDF, not Word.
3. **Check both copies.** Run `npm run check-posted -- --original test.pdf --posted <attachment link>`, then again with `--posted <packet link>`. If a portal blocks the download, save the file in a browser and pass the file.
4. **Record the result** below, and update the table in "What we found" if it differs.

Order, by what each test settles:
1. CivicClerk: do headings, alt text and the root `/Lang` survive the packet?
2. Municode Meetings: can a clerk supply their own packet?
3. A second Florida OneMeeting town: settles Oviedo against Boulder.
4. Legistar: does the PDF/UA identifier survive its re-save?
5. Diligent: are rich tags flattened to paragraphs?
6. eSCRIBE and BoardDocs, by a person using a normal browser.

| Platform | Town | Date | Attachment: tags / language / title | Packet: tags / language / title | New PDF/UA failures | Notes |
|---|---|---|---|---|---|---|
| | | | | | | |

## Sources

- [Report: agenda packets break what attachments preserve](agenda-platforms-2026-10/report.md), which has every citation, file URL and producer string.
- Research notes: [Granicus](agenda-platforms-2026-10/notes/granicus.md), [CivicPlus and Municode](agenda-platforms-2026-10/notes/civicplus_municode.md), [Diligent, eSCRIBE, OnBase and others](agenda-platforms-2026-10/notes/diligent_escribe_onbase_others.md), and [the Florida file tests](agenda-platforms-2026-10/notes/empirical_florida_samples.md).
