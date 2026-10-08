# Granicus agenda platforms: what happens to a clerk-uploaded tagged PDF (Legistar, Peak, OneMeeting/PrimeGov, NovusAGENDA, iQM2)

Research date: 2026-10-08. Public sources only, no sign-in. Most Granicus help-center articles (support.granicus.com) now require a customer login. Their content below comes from **search-engine snippets only** and is marked that way. Login was confirmed when the browser was redirected to `/s/login` for the Peak Agenda Accessibility article.

**Independent tests (done for this research, 2026-10-08).** Public files were fetched from live portals and inspected with qpdf/pdfinfo. The checks were StructTreeRoot, MarkInfo, /Lang, the ParentTree mapping, /StructParents and MCID remnants, the producer chain, XMP dc:title and outlines.
- **Legistar:** City of Fort Lauderdale, FL. City Commission Regular Meeting, 2026-10-06.
- **OneMeeting (formerly PrimeGov):** City of Boulder, CO. Meetings from Jan 2026 and Oct 1 2026.
- **Peak:** City of Burbank, CA. Planning Commission, 2026-10-12.

These are observations of three customer sites. They are not vendor statements, and results could depend on each tenant's settings.

Current Granicus product names, per the [Granicus product directory](https://granicus.com/?p=280) (search snippet):
- **Agenda Management LE** = Legistar
- **Agenda Management OE** = OneMeeting, formerly PrimeGov
- **Agenda Management PE** = Peak

The [OneMeeting product page](https://granicus.com/solution/govmeetings/onemeeting/) says "OneMeeting (formerly known as PrimeGov)". A [Worcester, MA clerk guide](https://www.worcesterma.gov/city-clerk/document-center/onemeeting-guide.pdf) also says "PrimeGov is now OneMeeting".

---

## Q1. Are individual attachments published as separate links, served as-is, in addition to or instead of a merged packet?

### Takeaway
All three current platforms publish each attachment as its own public link, and OneMeeting also offers a compiled PDF packet. Only Peak appeared to serve the uploaded file unchanged. Legistar rewrites every PDF on the way out with PDFlib PLOP, but in the test the tags survived. OneMeeting rewrites every PDF with Aspose.PDF for .NET and, in every Boulder sample tested, the structure tree was removed. Signs of earlier tagging remain in the stripped files.

### Cited Findings

**Legistar (LE)**
- **Separate public links.** InSite meeting pages link each attachment separately through `View.ashx?M=F&ID=…`. There are also "Agenda" (PDF), "Accessible Agenda" (`M=AADA`) and "Accessible Minutes" (`M=MADA`) links.
  - Observed on [Fort Lauderdale meeting detail, 2026-10-06](https://fortlauderdale.legistar.com/MeetingDetail.aspx?LEGID=2153&GID=252&G=F11871F6-88F5-40B5-BD94-B6711694F9A7) and a [legislation detail page](https://fortlauderdale.legistar.com/LegislationDetail.aspx?ID=8257549&GUID=B73F6463-E7FB-45CB-8088-869A1D791C8F&G=F11871F6-88F5-40B5-BD94-B6711694F9A7).
  - No combined packet link was shown for this meeting.
- **Stored original vs. served copy.** The [Legistar Web API](https://webapi.legistar.com/v1/fortlauderdale/events/2153/eventitems?Attachments=1) exposes each attachment's stored file, for example [`…/FortLauderdale/attachments/cbe4c2c1-….pdf`](https://legistar.granicus.com/FortLauderdale/attachments/cbe4c2c1-7309-49f8-a428-be3c7b2c4b09.pdf). Word memos are stored as `.docx`.
  - The InSite `View.ashx` copy of the same attachment is **not byte-identical**. *Independent observation:*
    - Exhibit 1: stored file 6,658,459 bytes, served file 6,659,677 bytes. They share only the first 10 bytes and have different SHA-256 hashes.
    - Exhibit 3: stored 1,370,034 bytes, served 906,813 bytes.
  - The served copy has Producer = `PDFlib PLOP 4.1 (.NET/Win64)/<original producer>` and "Optimized: yes" (linearized).
  - Info Title **and** XMP `dc:title` are overwritten with "<File #> - <attachment name>". Example: the original "Utility Report" became "26-0775 - Exhibit 3 – 2025 Annual Water Supply Utilities Project Report".
  - Served from [View.ashx ID=15972073](https://fortlauderdale.legistar.com/View.ashx?M=F&ID=15972073&GUID=36D551A1-47D0-40FC-87C9-CF76B2E5B236&G=F11871F6-88F5-40B5-BD94-B6711694F9A7), compared with stored original [attachment 134534](https://legistar.granicus.com/FortLauderdale/attachments/cbe4c2c1-7309-49f8-a428-be3c7b2c4b09.pdf).
- **Tags survived the PLOP pass.** *Independent observation:* in the tagged Acrobat-made original (Exhibit 3), the served copy kept:
  - StructTreeRoot and MarkInfo Marked=true
  - the same 515 structure elements with the same type counts
  - 5 /Alt entries
  - Outlines (bookmarks)
  - [Served file](https://fortlauderdale.legistar.com/View.ashx?M=F&ID=15972073&GUID=36D551A1-47D0-40FC-87C9-CF76B2E5B236&G=F11871F6-88F5-40B5-BD94-B6711694F9A7)
- **Many uploads are already tagged.** *Independent observation:* about 50 of the 123 stored PDF attachments for the Fort Lauderdale meeting were tagged per pdfinfo, according to the [Web API attachment list](https://webapi.legistar.com/v1/fortlauderdale/events/2153/eventitems?Attachments=1).
- **Packet (vendor how-to, snippet only).** "The Agenda Packet feature allows you to create the agenda with all corresponding attachments in one electronic PDF document." The snippet describes generating packet files and then combining them in Adobe Acrobat. — [Creating an Agenda Packet in Legistar](https://support.granicus.com/articles/How_To/Creating-an-Agenda-Packet-in-Legistar) (401 when fetched directly)
- **Packet options (release note, 2020, snippet only).** An "Include Attachments" option was added for packets, so attachments that are confidential or not set to print can still be included. — [What's New in Legistar and InSite, Jan 24 2020](https://support.granicus.com/articles/How_To/What-s-New-in-Legistar-and-Insite-January-24-2020)
- **Packet upload to InSite (snippet only).** Uploading a packet to InSite requires meeting-attachment permission. — [Creating an Agenda Packet from InSite](https://support.granicus.com/articles/How_To/Creating-an-Agenda-Packet-from-InSite)

**OneMeeting / Agenda OE (formerly PrimeGov)**
- **Public portal layout.** The portal offers "HTML Packet" (in-browser) and "Packet (Adobe PDF)". Each agenda item has view (eye) and download links per attachment. — [City of Boulder, OneMeeting helpful tips](https://bouldercolorado.gov/onemeeting-helpful-tips)
- **San José (PrimeGov era).** Attachments can be viewed and downloaded one at a time. "By selecting the green PDFs icon, you may download a mini packet with all attachments for the item included in one PDF." — [San José agenda guide](https://sanjoseca.gov/home/showpublisheddocument/113946/638599296775670000)
- **Download URLs and producer.** Individual downloads are served from `/api/compilemeetingattachmenthistory/historyattachment/?historyId=…` as `application/octet-stream`. They are **re-written by `Aspose.PDF for .NET 25.10.0`** (Creator "Aspose Pty Ltd."). *Independent observation:* every uploaded PDF sampled from Boulder had this producer.
  - Jan 2026 example: [Proposed Ordinance 8731](https://bouldercolorado.primegov.com/api/compilemeetingattachmenthistory/historyattachment/?historyId=9df078d2-f3fc-494b-910e-9ea7e7973099)
  - Sept 24 2026 example: [Proposed Resolution 1383](https://bouldercolorado.primegov.com/api/compilemeetingattachmenthistory/historyattachment/?historyId=5320befe-2d9e-41b8-9098-5c74bd5f75e0)
- **Tags stripped from individual downloads.** *Independent observation:* these Aspose-written files have **no StructTreeRoot and no MarkInfo**, but every page still has `/StructParents` and the content streams still hold hundreds of `/MCID` marked-content sequences. Examples:
  - [Proposed Ordinance 8731](https://bouldercolorado.primegov.com/api/compilemeetingattachmenthistory/historyattachment/?historyId=9df078d2-f3fc-494b-910e-9ea7e7973099): 9 pages, 9 StructParents, 306 MCIDs
  - [IGA Amendment Procedures](https://bouldercolorado.primegov.com/api/compilemeetingattachmenthistory/historyattachment/?historyId=7900f030-c2aa-47e2-a431-21f303eb6f4d): 15 pages, 646 MCIDs
  - [Proposed Ordinance 8764 (Sept 2026)](https://bouldercolorado.primegov.com/api/compilemeetingattachmenthistory/historyattachment/?historyId=9465c28b-b8ab-415e-9939-34dfb68e2bf9): 6 pages, 96 MCIDs
  - These remnants show the files were tagged before OneMeeting processed them.
- **Possible vendor fix (snippet only, undated).** "We resolved an issue wherein the attachments could lose their accessibility features during publishing." — [What's New in Agenda OE (OneMeeting) 2026](https://support.granicus.com/s/article/Whats-New-in-OneMeeting?language=en_US) (login-gated)
  - Boulder attachments published on 2026-09-24 were still stripped. The fix is either not deployed to that tenant, depends on configuration, or covers a different path.

**Peak / Agenda PE**
- **Public pages.** Peak publishes to the Granicus ViewPublisher pages. The HTML agenda (`GeneratedAgendaViewer.php`) links each staff report and attachment through `MetaViewer.php?…&meta_id=…`, which returned `application/pdf` directly from `burbank.granicus.com`. — [Burbank Planning Commission agenda, 2026-10-12](https://burbank.granicus.com/AgendaViewer.php?view_id=6&event_id=9895)
- **Attachments appear unchanged.** *Independent observation:* the served attachments keep their original producers, with no Granicus or Peak post-processing stamp:
  - Acrobat PDFMaker/Adobe PDF Library, Microsoft Word, Bluebeam, ActiveReports
  - XMP `pdf:Producer` also unchanged
  - Tagged originals were still tagged, for example [meta_id=481490](https://burbank.granicus.com/MetaViewer.php?view_id=6&event_id=9895&meta_id=481490) (PDFMaker 26, Tagged yes, 61 MCIDs, outlines) and [meta_id=481492](https://burbank.granicus.com/MetaViewer.php?view_id=6&event_id=9895&meta_id=481492) (Word, Tagged yes, /Lang en)
- **Burbank rollout.** Burbank launched Peak on Aug 26, 2025 and said it would "Enhance accessibility for the public." — [Burbank newsroom, Aug 13 2025](https://www.burbankca.gov/newsroom/-/newsdetail/20124/updates-to-city-meeting-agendas-and-agenda-packets)
- **Packets (vendor, snippet only).** "Agenda packets are always a collated PDF document." The packet contains the PDF version of the agenda report. — [Downloading an Agenda in Peak](https://support.granicus.com/articles/How_To/Downloading-an-Agenda-in-Peak); [Publishing an Agenda in Peak](https://support.granicus.com/customersupport/s/article/Publishing-an-Agenda-in-Peak?language=en_US)
- **Custom agendas (snippet).** "Your custom agenda must be in PDF format." — [Upload a Custom Agenda in Peak](https://support.granicus.com/s/article/Upload-a-Custom-Agenda-in-Peak?language=en_US&c=govMeetings+Suite&p=Peak)

**NovusAGENDA and iQM2 (MinuteTraq)**
- **Retirement dates.** Granicus's end-of-life FAQ (file last modified 2024-10-30):
  - **NovusAGENDA:** end of support Oct 31, 2024; end of life Sept 30, 2025.
  - **iQM2:** end of support listed as "September 20, 2025" in the table and "after September 30, 2025" in the text; end of life **Sept 30, 2027**.
  - At end of life "the products will be completely decommissioned… no data from them will be accessible."
  - Go-forward products are "One Meeting, Peak, Legistar."
  - Source: [Granicus EOL FAQ for IQM2 and NovusAGENDA (PDF)](https://granicus.com/wp-content/uploads/application/pdf/FAQ_EOL_IQM2_NOVUS.pdf); also the [migration checklist](https://granicus.com/wp-content/uploads/application/pdf/checklist_migration_action_IQM2_NOVUS.pdf)
- **Novus portals hosted packet PDFs.** Example: "agenda packets are also available in PDF format on the City's webpage at http://newportbeachpublic.novusagenda.com". Undated, older. — [Newport Beach notice](https://www.newportbeachca.gov/home/showpublisheddocument/18105/635682493202100000)
- **Novus user complaint (2017).** Novus "does not allow much annotation… only for the cover page, definitely not the attachments". The same post describes duplicate packet names. — [Boulder council hotline, Nov 2017](https://webappsprod.bouldercolorado.gov/mailing-lists/mailman-archive/bouldercouncilhotline/2017-November/001531.html)

### Inferences
- **Peak:** a tagged PDF/UA file uploaded as an attachment probably reaches the public byte-for-byte through MetaViewer, with tags, language, alt text and bookmarks intact. That is likely the best outcome of the three.
- **Legistar:** the file is rewritten (linearized, title replaced) but the tag tree, alt text and outlines were preserved. The title overwrite changes the document title the author set, and both Info and XMP are rewritten.
  - **Untested PDF/UA risk:** whether PLOP keeps the `pdfuaid:part` XMP property, ViewerPreferences/DisplayDocTitle and catalog /Lang when present. The Word-generated memo kept /Lang en-US after PLOP. None of the sampled originals had a pdfuaid identifier or DisplayDocTitle, so preservation of those could not be verified.
- **OneMeeting:** as observed at Boulder through Sept 2026, a tagged PDF/UA file uploaded as an attachment would lose its structure tree, its MarkInfo flag, and probably its alt text, which lives in the tree. That holds even for the individual download link, so a tagged upload would not stay accessible. The cause appears to be how the server-side Aspose.PDF re-save is configured, not the source file.

### Gaps
- No PDF/UA-identified sample (with `pdfuaid:part=1/2` and DisplayDocTitle) was found on any platform, so preservation of the PDF/UA identifier through Legistar's PLOP pass is unverified. Recommended test: upload an Ada Editor PDF/UA file to a Legistar sandbox and compare.
- Peak: the stored original could not be fetched separately to prove byte identity. The finding rests on unchanged producer and XMP data and the absence of any post-processor stamp.
- OneMeeting: only one tenant (Boulder) was tested. A tenant setting such as stamping or "flatten" could cause the stripping. The login-gated release note might describe a fix that has not reached Boulder.
- iQM2 and Novus: no live portal was tested. Novus should be offline since Sept 30, 2025.

---

## Q2. How is the packet compiled (server-side merge, which library), and does the vendor say tags are preserved, dropped or re-generated? Any accessible-packet, remediation or auto-tagging feature?

### Takeaway
OneMeeting compiles packets server-side with Aspose.PDF for .NET, adds per-item bookmarks, and stores the result as a static PDF on Azure blob storage. In the packet tested, only the generated agenda pages kept a real structure tree. The pages taken from attachments lost their structure trees but kept stale `/StructParents` keys. Those keys now point at the agenda's tags, which gives a broken tag tree while the file still claims to be tagged.

Granicus has a "PDF accessibility compliance" tool that evaluates, remediates and validates PDFs before publication. It is listed only as **Preview** in its 2026 mid-year innovation page. No partnership with a remediation vendor (Equidox, CommonLook, AbleDocs, Adobe auto-tag) was found.

### Cited Findings
- **OneMeeting packet storage.** *Independent observation:* `Public/CompiledDocument?meetingTemplateId=…&compileOutputType=1` 302-redirects to a pre-compiled static file, for example `pgwest.blob.core.windows.net/bouldercolorado/Meetings/191/Packet_20260116184526325.pdf`. — [Boulder packet link](https://bouldercolorado.primegov.com/Public/CompiledDocument?meetingTemplateId=1106&compileOutputType=1)
- **OneMeeting packet contents.** *Independent observation:* the Boulder packet for the Jan 22, 2026 meeting:
  - **Producer:** `Aspose.PDF for .NET 25.10.0`. 199 pages, catalog /Lang en-US, a PDF/A-style OutputIntent, and Outlines with 40 bookmarks named like "Item A - Attachment A - Proposed Ordinance 8731".
  - **Tagging:** MarkInfo Marked=true, but the structure tree has only 257 elements (Document, Table, TR, TH, P, Link, Figure). Its ParentTree has 6 entries, which correspond to the agenda pages (pp. 1–3).
  - **Stale keys:** 45 other pages (minutes pp. 5–23; ordinance pp. 58–66; IGA pp. 79–93; and others) carry `/StructParents` 0–14 left over from their source files. Some collide with the agenda's ParentTree entries (for example p. 58 key 0 maps to the agenda's page-1 elements). The rest point at nothing.
  - **Untagged pages:** the remaining ~150 pages have no structure at all.
  - [Packet](https://bouldercolorado.primegov.com/Public/CompiledDocument?meetingTemplateId=1106&compileOutputType=1)
- **Granicus's Preview tool (vendor claim).**
  - "Accelerate PDF accessibility compliance (Preview): Automatically evaluate, remediate, and validate PDFs against accessibility standards before publication."
  - "Accessible PDF viewer (Preview)" provides "real-time accessibility controls for public documents" (contrast, font, spacing, keyboard).
  - "Public portal search & accessibility" is listed as Available.
  - No dates, no named remediation partner, and no description of auto-tagging technology.
  - Source: [Granicus 2026 Mid-year Innovation update](https://granicus.com/innovation/)
- **Peak packets (vendor, snippet).** Peak packets are "a collated PDF document". "Any RTF, TXT, DOC, XLS, PPT, or image file document attachments are converted to PDF and appended to the packet." "The packet will not generate if any encrypted files are attached." — [Downloading an Agenda in Peak](https://support.granicus.com/articles/How_To/Downloading-an-Agenda-in-Peak)
  - No statement on tags found. No Peak combined packet was found on the tested Burbank page to inspect.
- **Legistar packets (vendor, snippet).** Legistar's documented packet workflow uses Adobe Acrobat to combine the packet files. — [Creating an Agenda Packet in Legistar](https://support.granicus.com/articles/How_To/Creating-an-Agenda-Packet-in-Legistar)
  - Fort Lauderdale's InSite did not show a packet, so none was inspected.
- **Peak accessibility article (vendor, snippet; a search tool dated it April 2026, unverified).**
  - PDF agendas, cover pages and minutes "work with Adobe Screen Reader and pass a compliance test when using PAC3", but users "will most likely need to manually fix some issues in Adobe Acrobat Pro before uploading".
  - "Attachments to agenda items are not ADA compliant by default, you must check these for accessibility issues and fix prior to attaching."
  - Source: [Peak Agenda Accessibility](https://support.granicus.com/s/article/Peak-Agenda-Accessibility?language=en_US)
- **Granicus disclaimer (snippet).** Granicus "cannot guarantee that these PDFs, or any attachments, will be ADA compliant", and passing the Acrobat checker "does not mean it is fully ADA compliant". — [Identify and Fix Accessibility Issues with Adobe Acrobat Pro](https://support.granicus.com/s/article/Identify-and-Fix-Accessibility-Issues-with-Adobe-Acrobat-Pro?language=en_US)

### Inferences
- In the OneMeeting PDF packet, tags from Ada Editor files would not survive, judging by the observed Aspose merge. The packet's "Tagged" flag is misleading: screen readers that trust the structure tree may skip attachment pages or read them in the wrong order. That is arguably worse than an honestly untagged file.
- The individual attachment link and the HTML packet are the only OneMeeting channels where accessibility could survive. In Boulder, even the individual link was stripped, so on OneMeeting a clerk would currently need to host the accessible original elsewhere, for example on the town website, and link to it.
- Granicus is not yet shipping vendor-side auto-remediation as a generally available feature (Preview only as of the mid-2026 page). Its own help content puts responsibility for attachment accessibility on the customer. That supports an Ada Editor position of "accessible at the source", provided the platform does not strip the tags.

### Gaps
- The Aspose merge settings are not public. The Agenda OE "lose their accessibility features" fix is undated and unexplained, and its full text is behind a login.
- No inspectable Legistar-generated or Peak-generated combined packet was found. Whether Peak's server-side collation keeps attachment tags is unknown.
- General availability date and pricing for the Preview "PDF accessibility compliance" tool are not published. No Equidox, CommonLook, AbleDocs or Adobe partnership was found in public sources.

---

## Q3. Are Word uploads converted to PDF server-side, and is that conversion tagged?

### Takeaway
Yes, on all three platforms, but the results differ:
- **Legistar:** the stored file stays `.docx`, and the public link serves a PDF whose Creator is Microsoft Word. That PDF was **tagged** with /Lang, then passed through PLOP.
- **OneMeeting:** generated memos are rendered by **Aspose.Words for .NET 25.11.0**, **untagged**.
- **Peak:** Granicus says Office files are converted. The one Peak staff report inspected was produced by **UniDoc v3.51.0 (Go)** and was **untagged**. Whether it came from a converted Word upload or a Peak-generated report is unclear.

### Cited Findings
- **Legistar.** The Web API lists Commission Agenda Memos as `.docx`, for example [memo 26-0775 stored as .docx](https://legistar.granicus.com/FortLauderdale/attachments/40432894-ec93-46fb-9f23-ca1bbbaaa85b.docx). The InSite link serves `application/pdf` named "Commission Agenda Memo 26-0775.pdf".
  - *Independent observation:* Creator "Microsoft® Word 2016", Producer "PDFlib PLOP 4.1 (.NET/Win64)/Microsoft® Word 2016", Tagged yes, /Lang en-US, 119 structure elements (P, Table, L, Figure…), no XMP metadata stream, no DisplayDocTitle.
  - [Served memo](https://fortlauderdale.legistar.com/View.ashx?M=F&ID=15972374&GUID=5D95F1E6-6AB4-4639-9FDB-53DB1C005054&G=F11871F6-88F5-40B5-BD94-B6711694F9A7)
- **Legistar release note (Dec 13 2019, snippet only).** It lists an improvement to "ADA compliance of converted PDF documents". — [What's New in Legistar and InSite, Dec 13 2019](https://support.granicus.com/articles/How_To/What-s-New-in-Legistar-and-Insite-December-13-2019)
- **OneMeeting.** *Independent observation:* Boulder "Agenda Memo" and "Study Session Memo" downloads have Creator "Microsoft Office Word" and Producer "Aspose.Words for .NET 25.11.0". They are untagged, with no StructParents or MCIDs, but have /Lang en-US. This was seen in Jan 2026 and Sept 2026 files.
  - [Agenda Memo, Sept 2026](https://bouldercolorado.primegov.com/api/compilemeetingattachmenthistory/historyattachment/?historyId=02f4c826-b10f-4950-907f-7904e7040130)
  - [Agenda Memo, Jan 2026](https://bouldercolorado.primegov.com/api/compilemeetingattachmenthistory/historyattachment/?historyId=5c6cb5f9-c37a-4f10-8e16-ccafc794c936)
- **OneMeeting Word integration (vendor).** "Office 365 integration enables staff to edit system-generated agenda docs in Word." — [OneMeeting product page](https://granicus.com/solution/govmeetings/onemeeting/)
- **Peak (vendor, snippet).** "Microsoft documents will be converted to PDF format." DOC/XLS/PPT/RTF/TXT/images are converted and appended to the packet. — [Downloading an Agenda in Peak](https://support.granicus.com/articles/How_To/Downloading-an-Agenda-in-Peak)
- **Peak (observed).** *Independent observation:* Burbank's "Staff Report" (16 pages) has Creator "UniDoc - http://unidoc.io" and Producer "UniDoc v3.51.0 (Commercial License - Business)". It is untagged, with no /Lang. — [Burbank meta_id=481478](https://burbank.granicus.com/MetaViewer.php?view_id=6&event_id=9895&meta_id=481478)

### Inferences
- **Legistar** appears to convert Word to PDF using Microsoft Word itself, which is why the output is tagged. Whether this runs in the Legistar desktop client or on a server is unknown. Tagging quality then depends on the Word source (heading styles, alt text).
- **OneMeeting and Peak** use third-party .NET and Go libraries (Aspose.Words, UniDoc) that were configured to produce untagged PDFs here. Aspose.Words can export tagged PDF when told to (the `ExportDocumentStructure` option, from general knowledge of the library, not verified for OneMeeting), so this looks like a configuration choice.
- **Upshot for Ada Editor:** clerks should upload the Ada-exported **PDF**, not Word, especially on OneMeeting and Peak.

### Gaps
- No vendor documentation says whether Legistar's conversion runs client-side or server-side.
- Peak: it is unconfirmed whether the UniDoc-produced staff report came from a Word upload or from Peak's own report template.

---

## Q4. Does the platform offer an HTML agenda or minutes view as the accessible alternative?

### Takeaway
Yes. Legistar has "Accessible Agenda" and "Accessible Minutes" (HTML, since 2021). OneMeeting has an "HTML Agenda" and "HTML Packet". Peak can publish agendas, cover pages and minutes as HTML, and the ViewPublisher shows a generated HTML agenda. These cover the agenda and minutes text only. Attachments are still linked as PDFs, so attachment accessibility is not solved by the HTML views.

### Cited Findings
- **Legistar (2021, snippet).** Legistar and InSite gained HTML accessible agendas and minutes. "Launching the accessible agenda or minutes in Insite will show an accessible report that passes the Wave tool." — [What's New in govMeetings, July 30 2021](https://support.granicus.com/articles/How_To/Whats-New-in-govMeetings-July-30-2021)
- **Legistar (observed).** *Independent observation:* Fort Lauderdale's [Accessible Agenda (M=AADA)](https://fortlauderdale.legistar.com/View.ashx?M=AADA&ID=1339152&GUID=9ED09DE8-F548-4585-B24E-3367A08CF731&G=F11871F6-88F5-40B5-BD94-B6711694F9A7) has `lang="en"` and a descriptive `<title>`, but no heading elements. It has 172 links to attachments via `gateway.aspx?M=F…`. The standard Agenda PDF is untagged, made by Crystal Reports. — [Agenda PDF](https://legistar.granicus.com/FortLauderdale/meetings/2026/10/2153_A_City_Commission_Regular_Meeting_26-10-06_Regular_Agenda.pdf)
- **OneMeeting (observed and portal tips).** The Boulder portal lists "HTML Agenda", "Agenda" (PDF) and "Packet" for each meeting through `/api/v2/PublicPortal/ListArchivedMeetings`. The city's tips page describes the "HTML Packet". — [Boulder OneMeeting tips](https://bouldercolorado.gov/onemeeting-helpful-tips); [Boulder portal](https://bouldercolorado.primegov.com/public/portal)
- **Peak (vendor, snippet).** Agendas, cover pages and minutes can be published or downloaded as HTML, and HTML versions pass a WAVE check. — [Peak Agenda Accessibility](https://support.granicus.com/s/article/Peak-Agenda-Accessibility?language=en_US)
- **Peak (observed).** *Independent observation:* Burbank's generated HTML agenda (`GeneratedAgendaViewer.php`) had an empty `<title>` and no `lang` attribute when inspected. — [Burbank agenda](https://burbank.granicus.com/AgendaViewer.php?view_id=6&event_id=9895)

### Inferences
- The HTML views make the agenda itself reasonably accessible, but the attachments (staff reports, ordinances, exhibits) are where Ada Editor's tagged PDFs matter. Those remain PDF links on every platform.

### Gaps
- Not checked: whether OneMeeting's HTML Packet inlines attachment content or only links to it, and whether its attachment "view" uses the same stripped Aspose file.

---

## Q5. What do vendor accessibility statements, VPATs/ACRs, release notes and forums say? Any complaints or lawsuits citing inaccessible packets?

### Takeaway
Granicus's public position is that its products aim for WCAG 2.2 AA "wherever possible", but customer content and attachments are the customer's responsibility and are not compliant by default. No public ACR/VPAT for Legistar, Peak or OneMeeting was found. No lawsuit or formal complaint naming these platforms' packets was found.

### Cited Findings
- **Corporate statement.** "Wherever possible, Granicus products meet the accessibility guidelines recommended under WCAG 2.2 for AA compliance and… Section 508." It also warns that customer customizations may affect compliance. — [Granicus Trust Center corporate accessibility statement (PDF)](https://granicus.com/wp-content/uploads/granicus-trust-center-corporate-accessibility-statement.pdf)
- **Customer responsibility (snippet).** Customers should review their own portal styling, content and design choices at the time of publishing. — [Granicus Web Accessibility Overview for Government Agencies](https://support.granicus.com/customersupport/s/article/Accessibility-for-Government-Agencies?language=en_US)
- **Agenda OE 2026 release notes (snippet, login-gated, undated within 2026).**
  - "We resolved an issue wherein the attachments could lose their accessibility features during publishing."
  - "We resolved an issue wherein screen readers did not announce agenda items that had attachments."
  - [What's New in Agenda OE (OneMeeting) 2026](https://support.granicus.com/s/article/Whats-New-in-OneMeeting?language=en_US)
- **DOJ deadlines (Granicus press release, July 30 2026).** The Title II rule now requires WCAG 2.1 AA by **April 26, 2027** for jurisdictions of 50,000 or more and **April 26, 2028** for smaller ones and special districts. A small Florida town falls in the 2028 group. — [Granicus press release](https://granicus.com/press-release/why-the-2027-accessibility-deadline-is-really-a-2026-problem-according-to-granicus/)
  - Older third-party guides still cite the original April 2026/2027 dates, for example [CivicPlus](https://www.civicplus.com/blog/wa/why-pdf-remediation-matters-a-guide-for-clerks/). Verify against the Federal Register.
- **No public ACRs.** No public ACR/VPAT for Legistar (LE), OneMeeting (OE) or Peak (PE) turned up in searches. Product naming is per the [Granicus product directory](https://granicus.com/?p=280).
- **Availability issue, not accessibility.** In July 2026 Granicus had an intermittent InSite problem where "Some users may receive a 'This document has been removed' error when attempting to access agendas, agenda packets, attachments". — [City of Madison, 2026-07-31](https://www.cityofmadison.com/news/2026-07-31/intermittent-issue-with-legistar-insite-documents)
- **Florida litigation context, not platform-specific.** A 2019 CivicPlus article reports that a Miami resident filed nearly 200 ADA suits over website documents, and that Orange County, FL settled. — [CivicPlus (via search)](https://www.civicplus.com/blog/wa/local-governments-facing-ada-accessibility-fines/)
- **No platform-specific suit found.** No lawsuit or DOJ action specifically citing Legistar, Peak, PrimeGov/OneMeeting, Novus or iQM2 packets was found in the searches run.

### Inferences
- Granicus's own guidance tells clerks to fix attachments before uploading. A clerk following it with Ada Editor output would be compliant on Peak and Legistar. On OneMeeting, the platform's own processing undoes that work, at least as observed at Boulder through Sept 2026.
- That gives Ada Editor a concrete, testable message: "Upload the Ada PDF as-is. Do not upload Word. On OneMeeting, verify the downloaded attachment still shows Tagged: yes, or link to a copy hosted on the town site."

### Gaps
- The full text of the login-gated Granicus KB articles was not read (Peak Agenda Accessibility, the Acrobat guide, the Agenda OE release notes). Only search snippets were available.
- No public ACRs were found. Ask a Granicus account rep.
- No clerk forum posts (IIMC/FACC listservs, Reddit) specifically about tags stripped by these platforms were found.
- Local copies of the test files are in the session scratchpad and are not retained.
