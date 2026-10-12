# Agenda platforms and tagged PDFs, October 2026

**The question:** a town clerk exports a tagged PDF from Ada Editor and posts it through the town's agenda system. Is it still accessible when a resident opens it?

**What I looked at:**
- *Towns are labelled, not named (since 2026-10-12): results name platforms, never towns. The key is kept outside the repository.*
- 23 public files from 10 Florida towns and cities on 7 agenda platforms, from meetings held between July and October 2026. (This said 9 until October 12, 2026; the notes' own table lists 10.)
- Spot checks in five out-of-state towns: P2 (PrimeGov/OneMeeting), K1 (Granicus Peak), C4 (CivicClerk), and A4 and A5 (CivicPlus Agenda Center).
- Vendor documentation, accessibility statements and release notes.
- The full evidence is in [`agenda-platforms-2026-10/`](agenda-platforms-2026-10/): [the report](agenda-platforms-2026-10/report.md) and [the four research notes](agenda-platforms-2026-10/notes/).
- **Published** on October 12, 2026 at [adaedit.com/research/agenda-platforms](https://www.adaedit.com/research/agenda-platforms) (`app/research/agenda-platforms/page.tsx`), naming platforms and never towns, as decision 6 below requires. A change to a finding here changes that page too, with a dated correction line and a new `updated` date in `app/_site/pages.ts`.

## The one-line verdict

**The merge is where accessibility is lost, not the file.** Most platforms leave a clerk's PDF alone on its own attachment link. They break it when they combine it with everything else into one agenda packet. And if the clerk uploads the Word file instead, the platform converts it and the tags are usually gone before anything is published.

## How we got here

This decision came out of three steps, all taken in October 2026.

1. **A review of the plan to sell to Florida towns.** The owner had a business review written of the outbound plan: audits and fixes sold to small towns below their purchasing thresholds. Its central finding was that the problem towns can't fix in one pass is not a list of website pages but the documents clerks post every week (agendas, minutes, forms, packets). Fixing 15 PDFs once doesn't stop next week's packet from being inaccessible, and documents posted after the DOJ Title II compliance date get no exemption. It proposed an accessible-documents program sold to clerks.
2. **Does Ada Editor solve that?** Partly. It covers documents that start in Word or are written in it: it checks them as they're written and exports a tagged PDF/UA-1 that CI validates with veraPDF. It doesn't cover scanned or third-party PDFs, the packet as a whole, or the website. That left an open question that decides whether the product promise holds: **do agenda platforms keep Ada's tags once the clerk posts the file?**
3. **Research on the platforms.** Four research threads: one per vendor group (Granicus; CivicPlus and Municode; Diligent, eSCRIBE, OnBase and others) and one that downloaded and inspected real Florida files. The [report](agenda-platforms-2026-10/report.md) reconciles them.

## Method and its limits

- **Structure, not validation.** Every finding comes from reading the files' internals: the tag tree (StructTreeRoot), MarkInfo, `/Lang`, the ParentTree, page `/StructParents` keys, tag counts by type, and Producer strings. No finding rests on veraPDF or PAC. veraPDF was later run on two pairs of platform files only, while testing `check-posted` (decision 4).
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
| Legistar | Mostly kept: re-saved, title replaced with the file number. Of the 7 served files that reached the public untagged (2 of 16 cities), 6 were already untagged when uploaded, and 1 lost a partly broken tag tree in Legistar's re-save (browser collection, October 12) | No packet to test | Converted to a tagged PDF | Moderate: served copies sampled in 16 cities; 7 originals compared by hand |
| PrimeGov / OneMeeting | Kept in FL town P1, **removed** in town P2 | **Removed** (both towns) | Untagged | Strong for packets |
| CivicClerk | Kept, served as uploaded | Tags and headings kept (20 of 22 packets in the October 12 sample of 25 towns), but the document language is dropped (22 of 22) and the page stamps aren't marked, so it **fails PDF/UA** | Thinly tagged (paragraphs only) | Strong: sampled across 25 towns |
| Municode Meetings | **No attachment link**, only "Agenda" and "Agenda Packet" | **Removed** in 7 of 7 towns (2 in the research, 5 by browser collection on October 12) | Not tested | Strong for packets |
| Diligent Community / iCompass | Only Diligent's rebuilt PDFs are public | **Re-tagged as plain paragraphs**, yet labelled PDF/UA-1 | The vendor says not to rely on it | One town |
| CivicPlus Agenda Center | Kept, served as uploaded | Untagged when the platform builds it; the clerk can upload their own | Not tested | Moderate |
| OnBase (FL town O1) | Kept, served as uploaded | None published | Untagged | One meeting |

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
- **FL town M1's agenda against its Municode Meetings packet** gave "removed": no tree, 26 pages still pointing into one, and the language dropped.
- **FL town L2's stored Legistar attachment against the copy the public link serves** gave "kept": 515 elements on both sides, but the title replaced with the file number.

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

### 6. Test the platforms from public files; talk to clerks only about demand

Decided October 12, 2026, after the owner asked whether the pilot could be run without involving clerks.

**What changed:** where the platforms allow it, the platform half of the pilot is now a script, `npm run sample-platforms` (see "Platform testing without clerks" below). It reads files Florida towns already publish and compares each tagged attachment with the packet it went into, the comparison the research did by hand. Clerks are no longer asked to post anything. The conversation with them is the discovery call the business review recommended, about how they work and how they buy.

**Why:**
- **It answers the platform questions better, where it can run.** About 25 towns per platform instead of one cooperating clerk each, and the packet questions are about the platform's merge, which any tagged attachment exercises.
- **It costs clerks nothing** and puts nothing in their public record.
- **What it can't answer stays with clerks:** whether they'd use Ada Editor, pay for it, and who signs. That was always the more important question for the business.
- **What it can't prove:** that Ada's own exports behave like the tagged Word and Acrobat files it measures. Nothing in the research points to a difference, and `check-posted` settles it for any town that does post an Ada file.

**The rules that come with it:**
- **Results name platforms, never towns.** The repository is public, and a list of towns whose packets lose their tags is exactly what a plaintiff firm would want. Per-town rows stay on the machine that ran the sampler (`scripts/sample-platforms/out/`, gitignored). The offline gate checks that the summary names no town.
- **Nothing goes to any town.** The ground rule against assessing a town's posts was about what we send and publish: the sampler reads public files the way any visitor does, and its per-town results go nowhere.
- **Polite by construction:** robots.txt respected, one request at a time and at least two seconds apart per host, no retries, and the first block or browser check stops that host.
- **Three of the five platforms turn automated research away, so they aren't sampled.** Checked October 12, 2026, while building the sampler:
  - **PrimeGov / OneMeeting:** the tenants' robots.txt disallows all crawlers (towns P1 and P2 alike).
  - **Diligent (civicweb.net):** robots.txt disallows every crawler except named search engines.
  - **Municode Meetings:** the load balancer in front of every tenant drops the connection for a User-Agent that names us as research, while it answers an anonymous client. Changing how we identify ourselves to get through would be working around a block.
  - eSCRIBE and BoardDocs block scripted downloads, as the research found.

  That leaves **CivicClerk and Legistar** for automated sampling. For Legistar, only the served copies: most clients' stored originals sit on legistar.granicus.com, whose robots.txt disallows crawlers. The other platforms need one of the routes in "What the sampler can't reach" below. crt.sh, the usual source for finding a platform's customers, disallows crawling too, so towns are found through the Wayback Machine's index instead.
- **A correction to the October research.** Its scripted downloads from PrimeGov, Municode and Diligent, and of stored Legistar originals from legistar.granicus.com, didn't check robots.txt. Those findings stand as observations of public files, but the same method won't be repeated. From now on, every automated request goes through the sampler's fetcher, which checks robots.txt first.

## What would change these decisions

- **The sampler shows most target towns publish only a packet** (Municode Meetings is common among small Florida towns), or its origin estimate shows most packet pages start in Word: look again at a packet builder, or at a PDF the clerk uploads in place of the platform's packet.
- **Clerks ask to check posted files themselves** (in discovery calls or after trying Ada): move the checker to a Vercel route that fetches the link (with the guarding above), with veraPDF in Vercel Sandbox.
- **A vendor ships packets that keep tags:** update the Help guidance and the platform table above. Granicus's 2026 release notes already mention a fix for attachments losing "accessibility features" in publishing; it hadn't reached town P2's files in September 2026.
- **The sampler contradicts a row of the table:** the sampler wins. The table is a few towns inspected by hand; the sampler is about 25 per platform.
- **A town posts an Ada file and `check-posted` disagrees with the sampler for its platform:** the Ada file wins, since it's the thing the product promises.

## Platform testing without clerks

Decision 6 replaced the clerk pilot's platform half with a sampler. It answers, per platform, the questions the pilot was going to answer one town at a time.

### What it does

1. **Finds the towns** (`npm run sample-platforms -- discover --write`). The Wayback Machine's index lists the hostnames archived under each platform's domain. Each tenant is matched to one of Florida's 411 municipalities (`scripts/sample-platforms/fl-municipalities.json`) by name or by a state suffix in the hostname. Legistar's index is too large for the Wayback Machine to scan, so Legistar clients are confirmed through Legistar's official Web API (built for programmatic use, no robots.txt), for municipalities of 25,000 people or more. On October 12, 2026 this found 68 CivicClerk towns and 21 Legistar cities. The candidates in `tenants.json` are reviewed by hand. Which towns use which platform is public (vendors publish their customers). How any of them performed is never recorded there.
2. **Samples a platform** (`npm run sample-platforms -- run --platform civicclerk`). For up to 25 Florida towns, it takes the latest meeting from the last 120 days that has the files the platform is sampled for, then inspects every attachment (up to 30) and the packet. Each PDF is downloaded, inspected and discarded; only the inspection is kept.
3. **Summarises** (`npm run sample-platforms -- summary`). The output is a table per platform with no town names, and it is what goes in "Sampler results" below.

### What each platform is sampled for

| Platform | Public files | What the sample settles |
|---|---|---|
| CivicClerk | Each attachment (the stored file is the served file) and the packet | Do headings, tables and alt text survive the packet? Does the language? |
| PrimeGov / OneMeeting (switched off) | Each served attachment and the packet | Is attachment stripping (town P2) a per-town setting? Does every packet drop the tree? |
| Municode Meetings (no adapter) | The agenda and the packet (the agenda's pages are inside it) | Does every packet drop the tree? Who builds the packet: the platform (Aspose) or the clerk (Acrobat, Word)? |
| Legistar | The copy the public link serves. The stored original is listed by the Web API, but most clients keep it on legistar.granicus.com, whose robots.txt disallows crawlers | How many served attachments keep a tag tree after the PLOP re-save, and whether any arrive stripped. The original-vs-served comparison only runs for clients whose originals sit on an allowed host |

Packets are compared with the tagged attachments that went into them, with no page mapping: their structure is summed, and the packet must hold at least that much of each kind. "Removed" (no tree, pages still pointing into one) and "flattened" (headings, lists, tables and figures turned into paragraphs) are strong findings. "Partly kept" is weak, because a packet may leave an attachment out.

Each attachment's pages are also labelled by origin (Word or another Office app, Acrobat, a scan, a server converter) from its Producer and from whether its pages are pictures without fonts. That gives an estimate of how much of a real packet starts in Word, the question behind decision 5.

### What the sampler can't reach

PrimeGov / OneMeeting, Municode Meetings and Diligent turn automated research away (decision 6). These are the platforms where the research saw packets lose their tags, and Municode is common among small Florida towns, so they matter most. Three routes, in order of preference:
1. **Ask the vendor.** Write to Granicus (PrimeGov), CivicPlus (Municode) and Diligent: describe the research, the rate limits and the no-town-names rule, and ask them to allow the sampler. The PrimeGov adapter is already written and switched off (`DISABLED` in `adapters/index.mjs`); the others would be written once allowed.
2. **A person in a browser.** robots.txt governs crawlers, not people. Someone opening a few towns' meeting pages and saving the files is ordinary use. `check-posted` then compares each tagged attachment with its packet. This is slower: maybe five towns per platform, not 25.
3. **The clerk route.** The optional ask in the discovery calls, for a town that wants to try Ada Editor.

### How to run it

Start with `--dry-run` (listings only) on one town, then a real run. veraPDF is off by default: `--vera` runs it on everything a run downloads. The offline gate (`node scripts/verify-sample-platforms.mjs`, in `npm run verify` and CI) checks politeness, the packet verdicts, each adapter against recorded listings, and that no signature or town name reaches the output.

### Sampler results

**First run: October 12, 2026.** The output of `npm run sample-platforms -- summary`, unedited:

Sampled 41 Florida towns on 2 platform(s), meetings from 2026-08-25 to 2026-10-12. Towns are not named; per-town rows stay local.

#### CivicClerk

| Measure | Result |
|---|---|
| Towns sampled (one meeting each) | 25 |
| Attachments inspected | 367, of which tagged 276 (75%) |
| Attachment pages by origin (estimate) | office 31%, converter 21%, printed 17%, other 15%, pdf editor 10%, scan 6% |
| Served attachments untagged but carrying tag remnants (tags removed before or during publishing) | 2 in 2 of 25 towns |
| Packets inspected | 25; with a tagged attachment to compare: 22 |
| Packet structure vs. its tagged attachments | kept 20, partly kept 2 |
| Kinds of structure short in "partly kept" packets | figures 2 |
| Packet language | dropped 22 |
| Packet tagged but not marked as tagged | 2 of 22 |
| Packet built by (from its Producer) | converter 24, pdf editor 1 |

#### Legistar

| Measure | Result |
|---|---|
| Towns sampled (one meeting each) | 16 |
| Attachments inspected | 158, of which tagged 88 (56%) |
| Attachment pages by origin (estimate) | office 52%, pdf editor 24%, converter 14%, scan 9%, printed 1% |
| Served attachments untagged but carrying tag remnants (tags removed before or during publishing) | 7 in 2 of 16 towns |

**What it says:**
- **CivicClerk keeps attachments' structure in its packets, at scale.** 20 of 22 packets held every kind of structure their tagged attachments carried. The other two were short only of some figures, which a packet that leaves an attachment out would also show. This confirms the research's finding from two towns across 25.
- **CivicClerk drops the document language from every packet: 22 of 22.** This is decision 3's case. Ada's export now also puts the language on the root tag, which the packet keeps, but no CivicClerk packet in the sample contained an Ada file, so whether that is enough is still unproven.
- **Three quarters of CivicClerk attachments, and over half of Legistar's, arrive tagged.** Most CivicClerk "converter" pages are CivicClerk's own conversions of uploaded Word and Excel files. Printed-to-PDF files (17% of CivicClerk attachment pages) carry no structure at all.
- **Legistar: some files reach the public with their tags removed.** 7 served attachments in 2 of 16 cities carry tag remnants without a tree. The browser collection below compared each with its original.
- **Packets are mostly Word, editors and scans.** Office files are 31% (CivicClerk) and 52% (Legistar) of attachment pages, plus most of CivicClerk's converter pages. Scans are 6% and 9%. That is more Word than decision 5 assumed, but the sample is pages from attachments, not whole packets, and Office origin doesn't mean the clerk wrote it.
- **Not measured:** PDF/UA conformance of the packets (run with `--vera` for that), and anything on PrimeGov or Diligent. Municode Meetings was measured by hand instead; see below.

Per-town rows are on the machine that ran the sampler and are not committed.

### Browser collection: Municode Meetings

**October 12, 2026.** The owner opened five more Florida towns' Municode Meetings pages in a browser and copied the links to the latest meeting's Agenda and Agenda Packet (route 2 above). The files themselves sit on Azure storage that serves our tool, so the comparison ran with the sampler's fetcher and `comparePacket`. This took 11 requests and 101 MB.

| Measure | Result |
|---|---|
| Towns | 5 (plus 2 in the October research) |
| Agendas | 5 of 5 tagged Word PDFs (42 to 108 structure elements each), language set |
| Packets | 5 of 5 **removed**: no structure tree. 554 of their 844 pages still point into a tree that was dropped |
| Packet language | dropped in 5 of 5 |
| Packet built by | the platform in 5 of 5 (Aspose.PDF for .NET 23.8.0), not the clerk |

**What it says:**
- **Municode Meetings removes every tag from every packet it builds:** 7 of 7 towns, with the same library version each time. This is the platform's merge, not the clerks: their agendas arrive tagged.
- **On Municode, an Ada document is accessible in the packet only if the platform changes.** There's no per-item attachment link, so the agenda is the only separately posted file. For anything else, decision 1's guidance (post the PDF on the town website too) is the only route a clerk has.
- **The same company's other product keeps the tags.** CivicPlus owns both Municode Meetings and CivicClerk, and both build packets with Aspose.PDF. CivicClerk (22.12) keeps the attachments' structure, while Municode Meetings (23.8) drops it. That makes a concrete, fixable report to CivicPlus, and the strongest opening for the research-access request in route 1.

Per-town results and the town key are kept outside the repository.

### Browser collection: Legistar originals

**October 12, 2026.** The owner saved the stored originals of the 7 Legistar files the sampler found reaching the public untagged (they sit behind robots.txt). Each was compared with the copy the public link serves, fetched with the sampler's fetcher: 38 requests, 33 MB.

| Original as uploaded | Files | Served copy |
|---|---|---|
| Already untagged, with leftover tag links from the author's tool (PDFium, Acrobat, DocuSign, a PDF-combining library) | 6 | Untagged, as uploaded: not Legistar's doing |
| Tagged, but the tree covered only 11 of 43 pages, with the rest pointing into nothing (a Word file "converted from PDF") | 1 | **Tree removed** by Legistar's re-save (PDFlib PLOP); title replaced |

**What it says:**
- **Legistar didn't remove the tags in 6 of the 7.** Those files were untagged before the clerk uploaded them, a reminder that many attachments arrive inaccessible whatever the platform does.
- **Legistar's re-save dropped one tree, and that tree was already broken.** The research's file, whose tree was well formed, kept all 515 of its elements through the same re-save. One case each way suggests PLOP keeps a sound tree and drops a damaged one. Ada's exports pass veraPDF, so they should be on the safe side. That's a lead, not a finding, until an Ada file goes through Legistar.
- **The checker was wrong about these six.** It called them "removed" because the posted copy had leftover tag links. It now says "untagged in both" when the original had no tags either.

Per-file results and the town key are kept outside the repository.

## Discovery calls with clerks

Clerks are still the only source for the demand questions. The framing from the pilot carries over: this is research on the software, not a sale and not an audit of the town.

**The opener:** *"We're testing which agenda systems keep accessible PDFs accessible after a clerk posts them, and we'd like to understand how your office produces agendas and packets."*

**Why this framing:**
- **It's true, and nobody else answers it.** No vendor publishes what its packets do to tags.
- **It's about the vendor's software, not the town's compliance.** A report telling a town manager "your packets are inaccessible" may count as notice under the deliberate-indifference standard (the business review's legal point, still to be put to a lawyer).
- **There's nothing to buy yet.** That keeps purchase splitting and purchasing thresholds out of the conversation.

**An optional ask, not a protocol:** a clerk who wants to try Ada Editor writes one item they'd post anyway, posts it the usual way, and we run `check-posted` on the links. Never a test file, which would put a fake document into the official record. The [explainer](agenda-platforms-2026-10/pilot-explainer.md) is on hold for this case.

**Ground rules:**
- **Write everything as if it will be published.** Under Chapter 119, every email and note is a public record.
- **Never send a town findings about its own posts or website.** The sampler's per-town results stay local.
- **No town with a pending solicitation for this work.** Okeechobee is out: its ADA website work is headed for a bid.
- **Check lobbyist registration before contacting a town.** Palm Beach County's ordinance covers its cities. Every email carries a mailing address and an opt-out line.
- **Lawyer first** on notice, public records and outreach rules.

**What the calls measure:**

| Question | Evidence |
|---|---|
| Whether clerks will use Ada | Whether they try it on a real document, and then write a second one without being asked |
| Whether a packet builder is ever worth it | Their account of how a packet is assembled, alongside the sampler's origin estimate |
| How a purchase would happen | Who signs, and the amount that needs quotes or council approval |

| Date | Town size (population band) | Platform | How packets are assembled | Tried Ada? Second document? | Who signs, at what amount | Notes |
|---|---|---|---|---|---|---|
| | | | | | | |

## Sources

- [Explainer for clerks](agenda-platforms-2026-10/pilot-explainer.md) (on hold since October 12, 2026).
- [Report: agenda packets break what attachments preserve](agenda-platforms-2026-10/report.md), which has every citation, file URL and producer string.
- Research notes: [Granicus](agenda-platforms-2026-10/notes/granicus.md), [CivicPlus and Municode](agenda-platforms-2026-10/notes/civicplus_municode.md), [Diligent, eSCRIBE, OnBase and others](agenda-platforms-2026-10/notes/diligent_escribe_onbase_others.md), and [the Florida file tests](agenda-platforms-2026-10/notes/empirical_florida_samples.md).
