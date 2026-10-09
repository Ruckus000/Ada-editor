# CivicPlus agenda products (CivicClerk, Agenda Center, Municode Meetings): what happens to clerk-uploaded tagged PDFs

Research date: 2026-10-08. Labels used below: **[Vendor]** = CivicPlus or Municode marketing/docs; **[Customer doc]** = city staff or public guide; **[Observed]** = my own inspection of public files served by the platform (read-only, no sign-in, via public API/web URLs; analyzed with pdfinfo/pypdf); **[Inference]** = my reasoning.

Note on methodology for [Observed] items: CivicClerk tenants expose a public, unauthenticated read API at `https://{tenant}.api.civicclerk.com/v1/...` (the same one the public portal uses). I read `Events` and `Meetings/{agendaId}` JSON and fetched published agenda/packet files with `Meetings/GetMeetingFileStream(fileId=N,plainText=false)`. Two tenants were sampled: Dubuque, IA and Wildwood, FL (a small Florida city). Agenda Center samples were from Wethersfield, CT and Battle Creek, MI. Sample sizes are tiny (2–3 files per product); treat them as spot checks, not proof of platform-wide behavior.

---

## Q1. Are individual attachments published separately (as uploaded) in addition to or instead of a merged packet? In Agenda Center, does the clerk upload a finished agenda/packet PDF directly?

### Takeaway
CivicClerk publishes **both**: a platform-built, merged "Agenda Packet" PDF **and** per-item attachment links that resolve to the stored file (for PDFs, apparently the uploaded file itself). Agenda Center has two modes: (a) the clerk uploads a finished agenda or packet PDF, which is served as uploaded (an uploaded Canva-made tagged PDF came back with its original producer, tags, and language intact); or (b) the built-in agenda builder, which produces an HTML view, a PDF, and a "Packet" PDF. In the samples, the builder's PDFs had no tags.

### Cited Findings
- [Customer doc] The Dubuque CivicClerk public-portal guide says the download icon offers "either the agenda or agenda packet." Within the packet viewer, users can "click on an agenda item attachment to view that specific attachment" and "download any attachment using the download button to the right of each attachment title." A "Meeting Overview" tab gives "a more basic view of the agenda, consisting of agenda sections, titles, and attachment links." — [Dubuque: Instructions for Accessing Agendas… (CivicClerk portal)](https://www.cityofdubuque.org/DocumentCenter/View/58137/Instructions-for-Accessing-Agendas-and-Searching-in-Agenda-and-Minutes-Portal)
- [Observed] The CivicClerk `Events` API lists separate published files per meeting, typed "Agenda", "Agenda Packet", and "Minutes" (e.g., Dubuque 9/21/2026: fileId 881 Agenda, 882 Agenda Packet, 888 Minutes). — [Dubuque CivicClerk Events API](https://dubuqueia.api.civicclerk.com/v1/Events?$top=3&$orderby=startDateTime%20desc); same pattern in [Wildwood FL CivicClerk Events API](https://wildwoodfl.api.civicclerk.com/v1/Events?$top=8&$orderby=startDateTime%20desc)
- [Observed] In the CivicClerk `Meetings/{id}` JSON, each attachment has `mediaFullPath` (the stored original), `pdfVersionFullPath` (the PDF rendition), and a `pdfAVersionFullPath` field. For uploaded **PDF** attachments, `mediaFullPath` and `pdfVersionFullPath` point to the **same blob** (same GUID .pdf). For **.docx/.doc** attachments, `mediaFullPath` is the .docx and `pdfVersionFullPath` is a separate .pdf with the same GUID. `pdfAVersionFullPath` was empty in the sampled record. — [Dubuque meeting 216 JSON](https://dubuqueia.api.civicclerk.com/v1/Meetings/216); [Dubuque meeting 260 JSON](https://dubuqueia.api.civicclerk.com/v1/Meetings/260)
- [Observed] Wethersfield CT's Agenda Center shows most meetings with a single uploaded "Agenda (PDF)" or "Agenda Packet (PDF)" link plus "Previous Versions." One builder-made meeting showed three links: `…_04202026-591?html=true` (HTML), `…_04202026-591` (PDF), and `…?packet=true` (Packet). — [Wethersfield Agenda Center](https://www.wethersfieldct.gov/agendacenter)
- [Observed] Agenda Center uploaded file: `/AgendaCenter/ViewFile/Agenda/_09282026-669` (Wethersfield, 11 pages) was served with Creator/Producer "Canva," CreationDate 2026-09-24 14:39 and ModDate 16:04 (both before posting), Tagged: yes, `/Lang en`, `/MarkInfo Marked true`, StructTreeRoot present. No CivicPlus producer string or modification was visible. — [Wethersfield agenda 9/28/2026](https://www.wethersfieldct.gov/AgendaCenter/ViewFile/Agenda/_09282026-669)
- [Customer doc] Durham NC Agenda Center training (per search snippet; direct fetch returned 403): documents "should be uploaded as PDFs," with an option to "Convert to PDF" if needed. The agenda file is required and minutes are optional. — [Durham Agenda Center Overview Training Slides](https://durhamnc.gov/DocumentCenter/View/39864/Agenda-Center-Overview-Training-Slides)
- [Observed] Agenda Center item-level attachments also exist as separate URLs in the form `/AgendaCenter/ViewFile/Item/{id}?fileID={n}`. This pattern appears in search results for Hillsborough County (FL) Supervisor of Elections and a Marianna FL reference, but I could not open those pages (403). — [votehillsborough.gov Agenda Center](https://www.votehillsborough.gov/AgendaCenter/ViewFile/ArchivedAgenda/_11192024-112)

### Inferences
- [Inference] For CivicClerk, a clerk-uploaded tagged PDF attachment is very likely downloadable unmodified from its item link, because the "PDF version" path *is* the original blob. I did not hash-compare against a known original, so "byte-for-byte" is not proven.
- [Inference] In Agenda Center's upload mode, the platform appears to pass the PDF through unchanged. Ada Editor PDF/UA output uploaded this way should reach the public intact. This is the safest path among the CivicPlus products.
- [Inference] The public will often open the **merged packet**, not the item attachment (it is the prominent download in CivicClerk). Packet behavior (Q2) therefore matters as much as attachment passthrough.

### Gaps
- No byte-level comparison of an uploaded original against the served attachment. The attachment blob URLs carry time-limited signed query strings, and I did not use them.
- I could not test what Agenda Center's "Convert to PDF" produces (tagged or not).
- I could not observe an Agenda Center builder packet that contained item attachments (both samples were attachment-free), so I don't know whether it merges attachments or how.

---

## Q2. How is the CivicClerk / Municode Meetings packet compiled? Are tags preserved, dropped, or re-generated? Any accessible-packet or auto-remediation feature?

### Takeaway
CivicClerk compiles the packet server-side with **Aspose.PDF for .NET 22.12**. The result is a tagged PDF (`/MarkInfo Marked true`) with an auto-built bookmark outline (section, then item, then each attachment by filename) and a **"Page X of N" stamp on every page**. In the samples, tags from Word-converted attachments and from at least one tagged PDF attachment **were carried into the packet's structure tree**. Untagged or scanned PDFs stayed untagged (no auto-tagging or OCR). Three defects were consistent across samples: the packet **drops the document-level `/Lang`**, the page stamp is **unmarked content** (neither tagged nor artifact, a PDF/UA failure), and the generated agenda/cover pages use **layout tables and no heading tags**. CivicPlus does not claim packet tag preservation. Its "accessible packet" answer is **DocAccess**, which generates a separate HTML view and leaves the PDF unchanged. Municode Meetings packet internals are undocumented publicly.

### Cited Findings
**CivicClerk, observed packets**
- [Observed] Wildwood FL CRA packet (fileId 5868, generated 2026-09-23, 20 pages): Producer "Aspose.PDF for .NET 22.12.0"; Tagged; StructTreeRoot present; **no catalog `/Lang`**. Bookmarks: I. Call to Order › 1. Swear in…; III. Items for Consideration › 1. Adoption of the FY27 CRA Budget › "Executive Summary", "R2026-27 CRA Budget Adoption", "FY27 CRA Budget"; › 2. Minutes… › "032326 CRA"; › 3. Facade Matching Grant… › "Executive Summary", "311 S Main - Facade Matching Grant Application", "Existing Awning"; IV. ADJOURNMENT. — [Wildwood packet 5868](https://wildwoodfl.api.civicclerk.com/v1/Meetings/GetMeetingFileStream(fileId=5868,plainText=false)); attachment list from [Wildwood meeting 1423 JSON](https://wildwoodfl.api.civicclerk.com/v1/Meetings/1423)
- [Observed] Per-page tagging in that packet:
  - pp.1–2 (CivicClerk-generated agenda): tagged.
  - p.3 (generated "Executive Summary" report): tagged.
  - p.4 (Word attachment R2026-27, .docx converted by CivicClerk): tagged with P/L/LI/Lbl/LBody (27 MCIDs).
  - pp.5–6 ("FY27 CRA Budget," uploaded PDF): **no marked content at all**.
  - pp.7–8 ("032326 CRA" minutes, uploaded as application/pdf): **tagged, 71+36 MCIDs, with artifacts preserved**.
  - pp.10–19 (scanned grant application, full-page 300-dpi JPEGs): untagged, no OCR text.
  - p.20 (JPEG "Existing Awning"): wrapped as a Figure whose **Alt text is the attachment filename** ("Existing Awning").
  — [same packet](https://wildwoodfl.api.civicclerk.com/v1/Meetings/GetMeetingFileStream(fileId=5868,plainText=false))
- [Observed] Every page in that packet carries a "Page N of 20" stamp drawn from a form XObject (`/Fm0 Do`) **outside any marked-content sequence**: not tagged and not an /Artifact. — [same packet](https://wildwoodfl.api.civicclerk.com/v1/Meetings/GetMeetingFileStream(fileId=5868,plainText=false))
- [Observed] The whole packet's structure tree contained **no H/H1–H6 elements**. Roles were Document (×6, one per merged source), Table/TR/TH/TD, P, L/LI, Figure, Link. The generated agenda and executive-summary pages are laid out as tables with TH cells. — [same packet](https://wildwoodfl.api.civicclerk.com/v1/Meetings/GetMeetingFileStream(fileId=5868,plainText=false))
- [Observed] Dubuque IA standalone **Agenda** PDF (fileId 881): Aspose.PDF 22.12.0, Tagged, `/Lang en-US`, Title "Dubuque, IA Agenda", `DisplayDocTitle true`, no bookmarks, structure = Table/TH/P (no headings). — [Dubuque agenda 881](https://dubuqueia.api.civicclerk.com/v1/Meetings/GetMeetingFileStream(fileId=881,plainText=false))
- [Observed] Dubuque **packet** for 9/28/2026 (fileId 887, 3 pages): Aspose; Tagged; **no `/Lang`** (the standalone agenda had en-US); bookmarks to "Item Cover Page" and the attachment "Kick Off Meeting Agenda_Dubuque IA_CM". Pages 1–2 (agenda + generated cover page, which carries a "Copyrighted / September 28, 2026" text block) are tagged. Page 3 (the consultant's uploaded PDF, born-digital text) has **no StructParents and zero marked content**. — [Dubuque packet 887](https://dubuqueia.api.civicclerk.com/v1/Meetings/GetMeetingFileStream(fileId=887,plainText=false)); attachment metadata in [meeting 260 JSON](https://dubuqueia.api.civicclerk.com/v1/Meetings/260)
- [Customer doc] The packet's "document outline" (bookmarks) lets users expand "each section, agenda item, and attachment," and "If you download the agenda packet, the document outline will remain accessible through your PDF viewer." — [Dubuque portal guide](https://www.cityofdubuque.org/DocumentCenter/View/58137/Instructions-for-Accessing-Agendas-and-Searching-in-Agenda-and-Minutes-Portal)
- [Customer doc] The CivicClerk item "Item Preview" shows "what the item will look like in the packet." Attachments "should be a PDF if possible." — [La Vergne TN CivicClerk Instructions](https://www.lavergnetn.gov/DocumentCenter/View/3199/CivicClerk-Instructions)

**CivicPlus accessibility tooling around packets**
- [Vendor] The DocAccess integration "automatically generates WCAG-aligned, screen reader–compatible HTML views" of agenda packets, minutes, and supporting documents in the Public Portal. "Original PDFs remain unchanged as the official record." Activation goes through a CivicPlus representative. — [CivicPlus blog: Meet accessibility and language access mandates without changing official records (Mar 2026)](https://www.civicplus.com/blog/am/meet-accessibility-and-language-access-mandates-without-changing-official-records/)
- [Vendor] The DocAccess fact sheet promises "WCAG-aligned, HTML accessible transcripts" for "new and existing public meeting agendas, packets, and supporting documents" and "Instant PDF translation in 250+ languages." It makes no PDF-tagging or PDF/UA claim. — [CivicPlus fact sheet: Agenda Accessibility and Translation powered by DocAccess](https://www.civicplus.com/fact-sheets/am/agenda-accessibility-and-translation-powered-by-docaccess/)
- [Vendor] CivicPlus acquired Streamline (maker of DocAccess) on Dec 18, 2025. DocAccess is described as "a PDF-to-HTML accessibility tool" that "automatically converts PDFs into WCAG 2.1 AA-aligned HTML transcripts." — [CivicPlus news: CivicPlus acquires Streamline](https://www.civicplus.com/news/nn/civicplus-acquires-streamline/); [GovTech coverage](https://www.govtech.com/biz/civicplus-buys-streamline-in-digital-accessibility-play)
- [Vendor] Webinar (aired June 9, 2026): Agenda and Meeting Management plus DocAccess make packets available in "WCAG-aligned, easy-to-navigate formats… without manual remediation." — [CivicPlus webinar: Make agenda packets & PDFs accessible](https://www.civicplus.com/webinars/am/make-agenda-packets-pdfs-accessible/). Follow-up "Agenda Accessibility in Action" (aired Aug 27, 2026) promises the same "without time consuming manual PDF remediation." — [CivicPlus webinar](https://www.civicplus.com/webinars/am/agenda-accessibility-deep-dive/)
- [Vendor] CivicPlus Agenda and Meeting Management embeds **Allyant CommonLook Clarity** WCAG 2.2 PDF compliance scanning into agenda workflows, so clerks get "real-time scan results and compliance reports." CivicPlus claims to be the only agenda vendor with built-in scanning. (This came from search-result excerpts of the CivicPlus page; my direct fetch of civicplus.com/?p=24009 returned 404.) The Allyant–CivicPlus partnership (announced 2024) covers an Acrobat remediation plugin, Word/PowerPoint-to-accessible-PDF tooling, and remediation services. — [Allyant press release: Allyant partners with CivicPlus](https://allyant.com/company-news/allyant-partners-with-civicplus-to-empower-local-governments-with-pdf-accessibility-remediation/); [BusinessWire](https://www.businesswire.com/news/home/20231010247549/en)
- [Customer doc] Teller County CO moved to the CivicClerk-hosted agenda platform in Jan 2025. From Feb 2025 it worked through "compliance issues flagged by the scanning software," added an ADA checklist for uploads, and used CommonLook PDF/Office for remediation. Fixes stayed manual. — [Teller County Accessibility Progress Report](https://tellercounty.gov/Accessibility-Progress-Report)

**Municode Meetings**
- [Vendor] "Create your agenda automatically with the click of a button… you can create your packets at the click of a button." The page notes that packet work "revolves around printing or converting all of the attachments and collating them." Nothing about tags, bookmarks, or accessibility. — [Municode: Easy Agenda Creation](https://www.municode.com/node/2081)
- [Observed] One old Municode Meetings packet (Sheboygan WI, 2021 meeting, file modified 2022-03-17): PDF 1.6, Producer "Adobe Acrobat 10.0 Paper Capture Plug-in," full-page JPEG scans, **no StructTreeRoot, no Lang, no Outlines**. The file appears to be a clerk-assembled scan served as uploaded, not a Municode-built packet. — [Sheboygan municodemeetings packet](https://sheboygan-wi.municodemeetings.com/sites/sheboygan-wi.municodemeetings.com/files/fileattachments/finance_and_personnel_committee/meeting/packets/6921/fpc210823packet.pdf)

### Inferences
- [Inference] CivicClerk/Aspose seems to **import the source PDF's existing structure tree** when merging (the tagged minutes PDF kept 100+ MCIDs and artifacts in the packet) rather than stripping it. I could not prove this for a third-party tagged PDF, because I couldn't confirm whether the Dubuque consultant PDF or the Wildwood budget PDF were tagged before upload. If import is the behavior, an Ada Editor PDF/UA attachment would probably keep its tags inside the packet. Still lost or broken: (1) its document-level `/Lang` (the packet catalog had none; any `/Lang` on a nested element was not observed), (2) its document title/DisplayDocTitle (the packet has an empty Title), and (3) PDF/UA conformance, because every page gains an untagged page-number stamp. The packet also has no headings in the generated agenda pages, so even a perfect attachment ends up in a non-conformant whole. Whether heading tags (H1–H6) from an attachment survive the merge is untested; none of the sampled attachments had headings, so their absence proves nothing.
- [Inference] Treat the CivicClerk packet as **not PDF/UA-conformant regardless of attachment quality**. The accessible path for an Ada Editor document is the individual item attachment link (served as uploaded) or the DocAccess HTML view if the town buys it.
- [Inference] DocAccess's "without changing official records" design means CivicPlus has deliberately **not** chosen to remediate PDFs in place. The PDF stays as-is, and accessibility is provided via an HTML alternative.

### Gaps
- No CivicPlus statement found (help center, release notes, VPAT) on whether packet assembly preserves attachment tags. civicplus.help pages did not surface in search.
- Packets over 10 MB (most city council packets, e.g., Wildwood City Commission, Dubuque 9/21) could not be fetched with my tools. Only small packets were inspected.
- No original-vs-packet test with a known tagged PDF (such as an Ada Editor export). This would settle tag carry-over, heading survival, and `/Lang` handling and is the most valuable next step: upload a test PDF/UA file in a CivicClerk sandbox and run PAC/veraPDF on the resulting packet.
- Municode Meetings: no public documentation or recent packet sample found. I could not determine how it compiles packets (merge engine, bookmarks, stamping, tags).
- CivicClerk's `pdfAVersionFullPath` field implies an optional PDF/A rendition pipeline. Its trigger and effect on tags are unknown. PDF/A-1b/2b conversion would not require tags; PDF/A-2a would.

---

## Q3. Are Word uploads converted to PDF server-side, and is that conversion tagged?

### Takeaway
Yes for CivicClerk: Word (.doc/.docx) and Excel uploads are converted server-side, and the original .docx is kept alongside the PDF. The converted pages I saw were **tagged** (paragraphs and lists). Agenda Center offers a "Convert to PDF" option, but I found no evidence on whether its output is tagged.

### Cited Findings
- [Customer doc] "You can add a file in Microsoft Word format and CivicClerk will upload and convert to a PDF for you." (Essex VT guide, version 20241030) — [Essex VT CivicClerk guide](https://www.essexvt.gov/DocumentCenter/View/16060). Search snippets from the related Essex guide also say: "You can upload Word and Excel documents and CivicClerk will automatically convert them to PDFs for the packet." — [Essex VT](https://www.essexvt.gov/DocumentCenter/View/16062)
- [Observed] Dubuque attachments typed `application/vnd.openxmlformats-officedocument.wordprocessingml.document` and `application/msword` each have a stored .docx/.doc (`mediaFullPath`) and a separate `.pdf` (`pdfVersionFullPath`). Generated "Item Cover Page" reports likewise exist as both `wordMediaFullPath` (.docx) and `pdfMediaFullPath`. — [Dubuque meeting 216 JSON](https://dubuqueia.api.civicclerk.com/v1/Meetings/216)
- [Observed] In the Wildwood packet, the page from the Word attachment "R2026-27 CRA Budget Adoption" (.docx, 36,850 bytes) was tagged with P, L, LI, Lbl, and LBody elements and two artifacts. No headings appeared, possibly because the source used none. — [Wildwood packet 5868](https://wildwoodfl.api.civicclerk.com/v1/Meetings/GetMeetingFileStream(fileId=5868,plainText=false)); [meeting 1423 JSON](https://wildwoodfl.api.civicclerk.com/v1/Meetings/1423)
- [Customer doc] Agenda Center has an option to "Convert to PDF" if needed (Durham training slides, via search snippet). — [Durham](https://durhamnc.gov/DocumentCenter/View/39864/Agenda-Center-Overview-Training-Slides)

### Inferences
- [Inference] CivicClerk's conversion engine is probably Aspose.Words (paired with the Aspose.PDF packet builder), which can emit tagged PDF. Tag quality depends on the Word file's use of real styles. This is one observation, not a vendor statement.
- [Inference] For Ada Editor, uploading the **PDF/UA export** is preferable to uploading a .docx, so the platform's converter does not decide the tag quality. If a .docx is uploaded to CivicClerk, the public's attachment link may serve the converted PDF, not the original.

### Gaps
- No vendor documentation on the converter, its tagging settings, `/Lang`, or alt-text handling.
- Agenda Center "Convert to PDF" output not observed.
- Municode Meetings: its agenda and minutes are Word-based (per vendor/press), but I found nothing on attachment conversion or tagging.

---

## Q4. Does the platform offer an HTML agenda/minutes view as the accessible alternative?

### Takeaway
Yes, in several forms. CivicClerk's portal has a "Meeting Overview" HTML view (sections, titles, attachment links), plus the paid DocAccess HTML "transcripts" of agendas, packets, and attachments. Agenda Center's builder mode offers `?html=true` agenda pages. Municode Meetings appears to expose an `adaHtmlDocument` HTML rendition. None of these HTML views has been independently audited in what I found.

### Cited Findings
- [Customer doc] CivicClerk Meeting Overview tab: "a more basic view of the agenda, consisting of agenda sections, titles, and attachment links." Portal search covers item titles, agenda files, and attachment text. — [Dubuque portal guide](https://www.cityofdubuque.org/DocumentCenter/View/58137/Instructions-for-Accessing-Agendas-and-Searching-in-Agenda-and-Minutes-Portal)
- [Vendor] DocAccess delivers HTML views of agendas, packets, minutes, and supporting documents within the Public Portal, with translation. Vendor statements variously cite 150+ or 250+ languages. — [CivicPlus blog (Mar 2026)](https://www.civicplus.com/blog/am/meet-accessibility-and-language-access-mandates-without-changing-official-records/); [Acquisition release (Dec 2025)](https://www.civicplus.com/news/nn/civicplus-acquires-streamline/)
- [Vendor] The CivicPlus Agenda and Meeting Management public portal is "aligned to WCAG 2.1 standards." — [CivicPlus Content Publishing page](https://www.civicplus.com/agenda-meeting-management/content-publishing/)
- [Observed] Agenda Center builder agendas expose `/AgendaCenter/ViewFile/Agenda/_{date}-{id}?html=true` alongside the PDF and `?packet=true`. The Battle Creek MI Civil Service Commission HTML agenda (4/27/2026) rendered as an outline of lettered sections and numbered items. The `?packet=true` PDF for the same meeting was **untagged** (no StructTreeRoot/MarkInfo/Lang/Outlines, no Producer, PDF 1.5 with an AcroForm), and the Wethersfield builder packet was the same. — [Battle Creek HTML agenda](https://battlecreekmi.gov/AgendaCenter/ViewFile/Agenda/_04272026-3174?html=true); [Battle Creek packet](https://battlecreekmi.gov/AgendaCenter/ViewFile/Agenda/_04272026-3174?packet=true); [Wethersfield packet](https://www.wethersfieldct.gov/AgendaCenter/ViewFile/Agenda/_04202026-591?packet=true)
- [Observed, via search] A Los Altos CA Agenda Center page links a Municode `adaHtmlDocument/index?cc=…&me=…&ip=…` URL alongside an HTML web agenda and a printable PDF. I could not fetch the page directly (403). — [Los Altos Agenda Center page](https://www.losaltosca.gov/AgendaCenter/ViewFile/Agenda/_10252023-1072)

### Inferences
- [Inference] The platforms' own answer to "accessible agenda" is HTML, not tagged PDF. That fits a town using Ada Editor for the agenda, minutes, or attachments only if those documents are uploaded as files. The platform-generated agenda and packet PDFs are either untagged (Agenda Center builder) or weakly tagged (CivicClerk: layout tables, no headings, packet missing Lang, untagged stamps).
- [Inference] Under the DOJ Title II rule, an HTML alternative can help, but the PDF posted on the website is itself covered content. The vendor's "official record unchanged" stance leaves the PDF's conformance to the clerk.

### Gaps
- I could not view the raw HTML markup (headings, lang, landmarks) of Agenda Center `?html=true` pages or CivicClerk's Meeting Overview; my fetch tool returns rendered text only.
- No independent audit of DocAccess HTML output found.
- The meaning of Municode's `adaHtmlDocument` (generated from the Word agenda? includes attachments?) is undocumented.

---

## Q5. What do vendor accessibility statements, VPATs/ACRs, release notes, help articles, or clerk posts say? Any complaints or lawsuits citing inaccessible packets from these platforms?

### Takeaway
I found no public VPAT/ACR for CivicClerk, Agenda Center, or Municode Meetings, and no public help-center article on tag handling. CivicPlus content in 2025–2026 frames compliance as scan (CommonLook), remediate at the source (Allyant tools/services), and offer an HTML alternative (DocAccess). I found no lawsuits or complaints that specifically name a CivicPlus/Municode packet.

### Cited Findings
- [Vendor] CivicPlus guidance (Nov 10, 2025) lists "Public notices and meeting packets" and agendas/minutes as DOJ-rule-covered content. It says PDFs "must meet… WCAG 2.1 AA" and describes remediation as "Applying a logical reading order and document structure through tags." It urges building accessibility into publishing, gives deadlines of Apr 24, 2026 (≥50k population) and Apr 24, 2027 (smaller), and promotes a free PDF scan and DocAccess. — [CivicPlus blog: Verify PDF documents are fully accessible](https://www.civicplus.com/blog/wa/verify-pdf-documents-are-fully-accessible/). Note: the brief says these compliance dates were extended in 2026. The vendor pages I read still cite the original dates, and I did not verify the extension in this pass.
- [Vendor] A webinar presenter bio claims customers can "achieve and maintain 100% ADA compliance" with DocAccess and CMS tools. This is unverified marketing. — [CivicPlus webinar page](https://www.civicplus.com/webinars/am/make-agenda-packets-pdfs-accessible/)
- [Vendor/third party] Diligent announced (Sep 22, 2026) a DocAccess integration with Diligent Community to create HTML alternatives for PDFs. DocAccess is becoming a cross-vendor HTML-alternative layer. — [Diligent newsroom](https://www.diligent.com/company/newsroom/diligent-announces-integration-with-civicplus-docaccess)
- [Customer doc] York County SC approved a CivicPlus DocAccess-type service (Mar 13, 2026). — [York County News Flash](https://www.yorkcountysc.gov/CivicAlerts.asp?AID=722). A CivicPlus service agreement (Apr 13, 2026) for automated document accessibility compliance was listed at $11,974/yr (per search summary; I did not open the source). — [search lead: Capterra CivicPlus PDF Accessibility listing](https://www.capterra.ca/software/1237716/CivicPlus-PDF-Accessibility)
- [Customer doc] Teller County's progress report shows the real workflow: scan, manual CommonLook remediation, an upload checklist, and VPAT requests to vendors. — [Teller County](https://tellercounty.gov/Accessibility-Progress-Report)
- [Independent] An Aug 2026 public testimony on a Hawaii commission's agenda packet (not identified as a CivicPlus product) faults documents for no heading navigation and no document language entry. These are the same two defects I observed in CivicClerk packets. — [AHC 08-06-2026 Public Testimony](https://ahc.ehawaii.gov/wp-content/uploads/2026/08/AHC-08-06-2026-Public-Testimony.pdf)
- [Search result] VPAT/ACR searches for CivicClerk returned nothing product-specific. — (no source; see Gaps)

### Inferences
- [Inference] CivicPlus's 2026 positioning (DocAccess HTML plus CommonLook scanning) implicitly concedes that its packet PDFs are not reliably accessible on their own. Otherwise an HTML alternative "without manual remediation" would not be its headline answer.
- [Inference] A small Florida town (Title II deadline for under-50k populations; check the 2026 extension) using CivicClerk will likely see packets fail automated checks (missing Lang, untagged stamps, scanned exhibits) even when every Ada Editor attachment is PDF/UA. Ada Editor's value holds at the attachment level, where the file is served as uploaded, and in Agenda Center upload mode.

### Gaps
- No CivicClerk/Agenda Center/Municode Meetings VPAT or ACR located publicly. Buyers must request it.
- No release notes found describing packet-tagging changes in 2025–2026.
- No court filings, DOJ/OCR complaints, or news items found that name CivicClerk/Agenda Center/Municode packets specifically.
- The 2026 extension of Title II compliance dates was not verified in this research thread.
