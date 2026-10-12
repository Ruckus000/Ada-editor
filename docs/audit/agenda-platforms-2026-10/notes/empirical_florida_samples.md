# Empirical test: do Florida municipal agenda platforms keep PDF tags? (sampled 2026-10-08)

*Towns are labelled, not named (since 2026-10-12): results name platforms, never towns. The key is kept outside the repository.*

Scope and method, in brief. Between 2026-10-08 17:15 and 17:35 local time I downloaded 23 public, unauthenticated PDFs (about 101 MB in total, the largest 40.8 MB) from 9 Florida municipalities on 7 platforms. I did not sign in, did not get past any bot challenge, and sent only a few requests to each site. Each file was inspected with `pdfinfo` (poppler), with `qpdf 12.4.1 --json=2` (catalog keys plus a walk of the structure tree from /StructTreeRoot that counts every element with an /S key), with a check of each page's /StructParents and the ParentTree, and with `pdftotext`, page by page, to spot stamped headers and footers. In a few cases I also read decompressed content streams (`qpdf --qdf`) to see whether stamps were marked content. Meeting dates are 2026-07-29 through 2026-10-14.

Key terms used below:
- **"Orphan /StructParents"** means a page still has a /StructParents key and marked-content MCIDs in its content stream, but the catalog has no /StructTreeRoot. This is the fingerprint of a source page that was tagged and then lost its tag tree during a merge.
- **Lang** values are shown without qpdf's `u:` prefix.
- **File IDs** (L1, C1, M1, P1, G1, I1, O1, …) name files, not towns. Town labels always carry the word "town" (for example, file C2 comes from town C1).
- **Signed blob URLs** (CivicClerk attachments, PrimeGov packet redirect) expire. For those I cite the stable API or portal URL and give the blob path.

---

## Q1. What do the sampled platforms actually publish? (raw per-file table)

### Takeaway
Of the 23 files, 15 were tagged (pdfinfo `Tagged: yes`). All five platform-compiled packets were produced by a .NET PDF library: Aspose.PDF on CivicClerk, PrimeGov and Municode Meetings, and ABCpdf on Diligent. Whether the tags survived depended on the platform: CivicClerk kept the source tag trees, PrimeGov and Municode Meetings dropped them, and Diligent produced its own flat tags. Where platforms convert Word uploads to PDF themselves, they use Aspose.Words or Aspose.PDF. That conversion gave untagged output on PrimeGov and OnBase (FL town O1), and tagged output made only of /P elements on CivicClerk.

### Cited Findings

Column key: Tag = pdfinfo Tagged; Mk = /MarkInfo /Marked; STR = /StructTreeRoot present; SE = number of structure elements found by walking the tree; SP = pages with /StructParents out of total pages; OL = /Outlines (bookmark) count; UA = pdfuaid in XMP.

| ID | Platform | Municipality | Meeting | Doc type | Size MB / pages | Tag | Mk | STR | SE (top types) | SP | Lang | OL | Producer / Creator | Notes | URL |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| L1 | Legistar | FL town L1 (pop. over 50k) | Site Plan Review & Appearance Bd, 2026-09-23 | Agenda (Legistar-generated) | 0.11 / 4 | no | – | no | 0 | 0/4 | – | – | Powered By Crystal / Crystal Reports | | agenda |
| L2 | Legistar | Town L1 | same | Single attachment (applicant narrative) | 1.09 / 13 | yes | true | yes | 462 (P 266, LI 34, TD 17, TH 16, Figure 9) | 13/13 | en | – | Microsoft Word for Microsoft 365 (both) | Served as uploaded | att |
| L3 | Legistar | Town L1 | same | Single attachment (narrative letter) | 0.40 / 10 | yes | true | yes | 320 (P 184, LI 31, Link 9, Figure 2) | 10/10 | en | – | Microsoft Word for Microsoft 365 | Served as uploaded | att |
| L4 | Legistar | FL town L2 (larger city) | City Commission Regular, 2026-09-15 | Agenda (Legistar-generated) | 0.25 / 16 | no | – | no | 0 | 0/16 | – | – | Powered By Crystal / Crystal Reports | | agenda |
| C1 | CivicClerk | FL town C1 (pop. 10–25k) | CRA Advisory Bd, 2026-09-21 | **Compiled agenda packet** | 1.98 / 14 | yes | true | yes | 513 (P 186, TH 117, TR 89, Table 44, H2 15, Figure 6, Document 5) | 11/14 | **none** | 7 | Aspose.PDF for .NET 22.12.0 / Aspose Pty Ltd. | "Page X of 14" footer stamped; stamp is unmarked content | packet |
| C2 | CivicClerk | Town C1 | same | Single attachment (staff report, also packet pp. 11–14) | 0.23 / 4 | yes | true | yes | 61 (H2 15, P 13, LI 11, H3 2, H1 1, Figure 1) | 4/4 | EN-US | 18 | Adobe PDF Library 26.2.141 / Acrobat PDFMaker 26 for Word | Uploaded PDF served as-is (attachment id 2595, blob `stream/{TENANT}/643a107c83b54d79a95ca8d724a385f8.pdf`) | meeting API |
| C3 | CivicClerk | Town C1 | same | Single attachment (CIP table, packet pp. 8–9) | 0.10 / 2 | no | – | no | 0 | 0/2 | – | – | Acrobat Distiller 11.0 / PScript5.dll | Untagged at source (attachment id 2592) | meeting API |
| C4 | CivicClerk | FL town C2 (pop. 10–25k) | Planning & Zoning, 2026-10-05 | **Compiled agenda packet** | 40.8 / 144 | yes | true | yes | 1,967 (Standard 648, TD 446, P 254, TR 221, TH 156, Table 60, H1 27) | 33/144 | **none** | 8 | Aspose.PDF for .NET 22.12.0 | "Page X of 144" stamped | packet |
| C5 | CivicClerk | Town C2 | same | Single attachment (Native Yard Proposal, packet pp. 141–144) | 0.17 / 4 | yes | true | yes | 170 (Standard 56, TD 27, H1 7, Table 5; custom roles "List 1"/"Numbering 1") | 4/4 | en-US | 10 | (blank) | Uploaded PDF served as-is (id 14797, blob `stream/{TENANT}/a5c001d1bf824ae49e29d19457cdae60.pdf`) | meeting API |
| C6 | CivicClerk | Town C2 | same | Platform "PDF version" of a **.docx** upload (P&Z minutes) | 0.15 / 5 | yes | true | yes | 140 (P 139, Document 1) | 5/5 | en-US | – | Aspose.PDF for .NET 22.12.0 | XMP declares pdfuaid part 1; tags are flat P only (id 14812; original `...b5b5ea64....docx`, PDF version `...b5b5ea64....pdf`) | meeting API |
| M1 | Municode Meetings | FL town M1 (pop. under 5k) | Town Council Regular, 2026-10-06 | **Compiled agenda packet** | 11.08 / 38 | **no** | – | **no** | 0 | **26/38 orphan** | – | 6 | Aspose.PDF for .NET 23.8.0 | 691 MCID-marked sequences (/P 658, /LBody 22, /Span 4) left without a tree; "Section VI. Item #B." header and page number stamped | packet |
| M2 | Municode Meetings | Town M1 | same | Agenda (separate link; same content as packet p. 1) | 0.47 / 1 | yes | true | yes | 58 (P 28, TD 12, TR 7, Table 1) | 1/1 | en-US | – | Microsoft Word 2016 | Served as uploaded | agenda |
| M3 | Municode Meetings | FL town M2 (pop. under 5k) | Town Council Agenda Review, 2026-07-29 | Agenda (= packet pp. 1–2) | 0.39 / 2 | yes | true | yes | 37 (P 21, TR 6, TD 6, Table 1, Figure 1) | 2/2 | en-US | – | Microsoft Word 2016 | | agenda |
| M4 | Municode Meetings | Town M2 | same | **Compiled agenda packet** | 0.89 / 6 | **no** | – | **no** | 0 | **6/6 orphan** | – | 3 | Aspose.PDF for .NET 23.8.0 | "Item 1." header and page numbers stamped | packet |
| P1 | CivicPlus Agenda Center | FL town A1 (pop. under 5k) | Town Council, 2026-09-21 | "Agenda and Agenda Packet" (clerk-built single upload) | 2.59 / 67 | no | **false** | yes | 1,223 (P 709, "Artifact" used as a structure type 240, LI 89, Sect 22, H1 7) | 49/67 | – | 22 | Adobe Acrobat (64-bit) 26.2.21931 | Clerk-made packet; "Page X of 67" stamped; ?packet=true returns the same file | file |
| G1 | PrimeGov | FL town P1 (pop. 25–50k) | City Council Work Session, 2026-09-28 | **Compiled packet** | 15.76 / 68 | **no** | – | **no** | 0 | **24/68 orphan** | – | 9 | Aspose.PDF for .NET 25.10.0 | Packet pp. 20–32 = G3; pp. 56–66 = a second tagged attachment | packet (302 to `pgwest.blob.core.windows.net/{tenant}/Meetings/2732/Packet_20260924182731113.pdf`) |
| G2 | PrimeGov | Town P1 | same | Single attachment (Ordinance 1776; uploaded as Word) | 2.35 / 7 | no | – | no | 0 | 0/7 | en-US | – | Aspose.Words for .NET 25.11.0 / Microsoft Office Word | Server-side Word-to-PDF conversion gave **untagged** output | att |
| G3 | PrimeGov | Town P1 | same | Single attachment (a county's draft ordinance) | 1.06 / 20 | no (no /MarkInfo) | – | yes | 750 (Artifact 549, P 150, TH 15, Sect 13, Table 5) | 13/20 | – | 2 | Adobe Acrobat (64-bit) 26.1.21367 | Has a tag tree but no MarkInfo (partly tagged); pp. 2–7 are image-only | att |
| I1 | Diligent Community (iCompass CivicWeb) | FL town D1 (pop. 10–25k) | City Council, 2026-09-15 | **Compiled agenda package** | 20.24 / 199 | yes | true | yes | 19,276 (**P 19,230**, Link 45, Document 1; no H/Table/Figure) | 199/199 | en-US | 55 | "Diligent Corporation using ABCpdf" / Microsoft Office Word | XMP pdfuaid part 1; "ITEM n." header and "Page X of 199" stamped as tagged /Span; 8,018 /Artifact marks; no /Figure or /Alt anywhere | package |
| I2 | Diligent Community | Town D1 | same | Per-item PDF (minutes item; packet pp. 12–16) | 0.23 / 5 | yes | true | yes | 92 (P 90, Link 1) | 5/5 | en-US | 2 | Diligent Corporation using ABCpdf / Microsoft Office Word | pdfuaid part 1 | item |
| I3 | Diligent Community | Town D1 | same | Per-item PDF (legal invoices item; packet pp. 17–31) | 0.39 / 15 | yes | true | yes | 18 (P 16, Link 1) | **1/15** | en-US | 2 | Diligent Corporation using ABCpdf | Only the platform cover page is tagged; the 14 attachment pages are untagged, yet pdfuaid part 1 is declared | item |
| O1 | OnBase Agenda Online (Hyland) | Town O1 (larger city) | CRA Regular, 2026-10-08 | Single attachment (scanned memo, Acrobat OCR + tags) | 0.27 / 2 | yes | true | yes | 44 (P 13, Sub 9, Figure 5, L 3) | 2/2 | en | – | Adobe Acrobat Pro (64-bit) 24 Paper Capture Plug-in / Xerox AltaLink C8055 | Uploaded PDF served as-is | att |
| O2 | OnBase Agenda Online | Town O1 | same | Attachment uploaded as **.DOCX**, rendered to PDF on download | 0.47 / 1 | no | – | no | 0 | 0/1 | en-US | – | Aspose.Words for .NET 23.11.0 / Microsoft Office Word | Untagged rendition | att |

How each portal presents documents (observed):
- **Legistar (towns L1 and L2, and FL town L3).** The MeetingDetail page has an Agenda link (a Crystal Reports PDF) and per-item attachments. Uploaded originals are served in their own format: town L1 staff reports are served as raw `.docx`, for example this staff report, which was listed via the Legistar Web API. The sampled MeetingDetail pages showed no "Agenda Packet" link (town L1, town L3).
- **CivicClerk (town C1, town C2).** The portal and API publish "Agenda", "Agenda Packet" and "Minutes" files, plus per-item attachments. For every attachment the API returns `mediaFullPath` (the original upload) and `pdfVersionFullPath` (a PDF rendition), and also a `pdfAVersionFullPath` field, which was empty in these samples. For uploaded PDFs the two paths point to the same blob or to a byte-identical copy (C5 and C2 match their listed `fileSize`). For .docx, .pptx, .xls, .csv and .jpeg uploads, CivicClerk makes its own PDF (town C2 meeting API, town C1 meeting API, town C1 events API).
- **Municode Meetings (towns M1 and M2, and FL town M3).** Each meeting page offers only two PDFs, "Agenda" and "Agenda Packet", served from `mccmeetings.blob.core.usgovcloudapi.net`. I saw no per-item attachment links (town M1 meeting page, town M2 meeting page, town M3 meeting page).
- **CivicPlus Agenda Center (town A1).** A per-meeting file list. Town A1 uploads one combined "Agenda and Agenda Packet" PDF that it builds itself. The `?packet=true` link returns the same file, with the same 2,586,889 bytes (town A1 Agenda Center).
- **PrimeGov (town P1).** The archive API lists "HTML Agenda", "Agenda", "Minutes" and "Packet" for each meeting. The HTML agenda links each item attachment through `historyattachment` (archive API, HTML agenda).
- **Diligent Community / iCompass CivicWeb (town D1).** An HTML agenda with "Packet Page N" references. Each item links to a per-item PDF that Diligent builds (a cover "Agenda Item Report" plus the attachments). A full "agenda package" PDF is linked from the meeting page. The Oct 6, 2026 package was 111,962,117 bytes, so I skipped it as over 60 MB (HTML agenda, meeting page).
- **OnBase Agenda Online (town O1).** An HTML agenda, with item attachments loaded per item. Attachments uploaded as DOCX are offered as `NAME.DOCX.pdf` and rendered when downloaded. Town O1's meeting JSON shows `IsAgendaPacketAvailable: false` for every meeting from Aug to Oct 2026 (town O1 Agenda Online, CRA 10/8 meeting).

### Inferences
- In these Florida samples, "the platform PDF" is really four kinds of output: (a) files served exactly as uploaded, (b) PDFs the platform converts from Office uploads, (c) agendas and cover sheets the platform generates, and (d) packets the platform compiles. Each needs its own answer on tagging.
- Every platform-compiled packet came from a .NET PDF library: Aspose.PDF in three vendors, ABCpdf in Diligent. So whether tags survive depends on how each vendor calls the library, not on the PDF format itself. CivicClerk and Municode Meetings both use Aspose.PDF yet give opposite results.

### Gaps
- Population figures are approximate and from general knowledge, not looked up. They are only there to show "small vs. large".
- I did not hash or compare server files with the clerk's originals. "Served as-is" is inferred from Producer/Creator strings, from intact tags, and for CivicClerk from the API's file size matching.

---

## Q2. When the same item exists as a separate attachment and inside the compiled packet, does the packet keep its tags? (paired comparisons)

### Takeaway
There were four paired comparisons, plus one Diligent pairing.
- **Municode Meetings strips tags.** This was seen twice: town M1 and town M2.
- **PrimeGov strips tags.** Seen once in town P1, with the caveat that the source PDF lacked /MarkInfo.
- **CivicClerk keeps the source tag tree.** Seen twice: town C1 and town C2. The packet still loses the document /Lang and adds unmarked page-number stamps. In town C1, the page-to-structure mapping on two pages was also wrong.
- **Diligent builds its own new, flat tag tree** in which all content is /P.

### Cited Findings
- **Municode Meetings, town M1, 2026-10-06.** The separately posted agenda (M2) is a tagged Word 2016 PDF: Marked true, /Lang en-US, 58 structure elements including Table/TR/TD. In the packet (M1), the same agenda is page 1. The packet's catalog has no /StructTreeRoot and no /MarkInfo, so pdfinfo reports Tagged: no. Yet page 1 and 25 other pages still carry /StructParents, and the content streams hold 691 MCID-tagged marked-content sequences (/P, /LBody, /Span) with no tree to point to. The packet was produced by Aspose.PDF for .NET 23.8.0. Sources: agenda, packet.
- **Municode Meetings, town M2, 2026-07-29.** The agenda (M3) is a tagged Word 2016 PDF with 37 elements and en-US. In the 6-page packet (M4), pages 1–2 are that agenda and pages 3–6 are the "Item 1." attachment. All 6 pages keep orphan /StructParents, and there is no /StructTreeRoot or /MarkInfo. The packet adds "Item 1." headers and page numbers. Sources: agenda, packet.
- **PrimeGov, town P1, 2026-09-28.**
  - The attachment "[County] Draft Ordinance" (G3, Adobe Acrobat) has a /StructTreeRoot with 750 elements, but no /MarkInfo.
  - In the packet (G1, Aspose.PDF for .NET 25.10.0), its 20 pages appear as pages 13–32. Pages 20–32 keep orphan /StructParents 0–12, matching the attachment's own pages 8–20, but the packet has no /StructTreeRoot.
  - A second attachment, "Order of Business and Rules", appears at packet pages 56–66. It also has orphan /StructParents 0–10, which suggests it was tagged too; I did not download it.
  - Sources: attachment, packet.
- **CivicClerk, town C2, 2026-10-05.**
  - The attachment "Native Yard Demonstration Project Proposal" (C5) is tagged: 170 elements, H1×7, tables, custom roles mapped through a RoleMap.
  - In the packet (C4, Aspose.PDF 22.12.0, Tagged: yes), it is pages 141–144. Those pages carry StructParents 29–32, and each ParentTree entry 29–32 holds the same number of elements as the source's entries 0–3 (6, 40, 38 and 49), resolving to the correct packet pages.
  - The source's /Document subtree (39 kids) is kept as one of seven /Document children under the packet root. The RoleMap is merged (Standard→P, "List 1"→P).
  - The catalog /Lang (en-US in the source) is missing in the packet, and so is /ViewerPreferences /DisplayDocTitle (true in the source).
  - Sources: packet, meeting API listing attachment 14797.
- **CivicClerk, town C1, 2026-09-21.**
  - The staff report attachment (C2, Acrobat PDFMaker for Word, 61 elements, H1/H2/H3) appears at packet pages 11–14. Its subtree comes through intact under a /Document wrapper: 15 H2 elements, with element-level Lang EN-US kept. The catalog /Lang is missing.
  - **Defect observed:** the source's pages 1–4 use StructParents 0–3. The packet's matching ParentTree entries 7–10 have identical element counts (28/29/23/5), but packet pages 11–14 point to 8, 9, 9 and 10, when they should point to 7, 8, 9 and 10. Entry 7 is left unreferenced, two pages share key 9, and the MCIDs on pages 11–12 resolve to the wrong structure elements. Town C2 (above) did not show this.
  - Source: packet.
- **CivicClerk stamps.** The added "Page 11 of 14" footer is drawn in a separate content stream with no BDC/EMC: it is neither tagged nor marked /Artifact. This was checked on town C1 packet page 11, and town C2 packet page 142 likewise has a short extra stream with no marked content. Source: town C1 packet.
- **CivicClerk untagged sources.** These stay untagged in the packet: the Distiller CIP table (C3) became packet pages 8–9 without StructParents. Source: town C1 packet.
- **Diligent Community, town D1, 2026-09-15.**
  - The per-item PDF for the legal-invoices item (I3) tags only its cover page (1/15 pages have StructParents). In the full package (I1), all 15 of those pages (packet pp. 17–31) are tagged.
  - Across the whole 199-page package the tree contains only /P (19,230), /Link (45) and one /Document. There are no headings, tables, lists or figures, and no /Alt. The "ITEM 3." and "Page 17 of 199" stamps are tagged as /Span with MCIDs, not as artifacts.
  - Both the package and the item PDFs declare pdfuaid part 1 in their XMP.
  - Sources: package, item.

### Inferences
- **Municode Meetings and PrimeGov.** Orphan /StructParents with no /StructTreeRoot is strong evidence that the merge step threw away tag trees that were present in the inputs. It is not just a case of clerks uploading untagged files. The Municode agendas are cleanly tagged (Marked true, Lang set), so a tagged PDF/UA file from Ada Editor would very likely come out of a Municode Meetings packet untagged. For PrimeGov the evidence is somewhat weaker: the paired source had a tag tree but no /MarkInfo, so it is possible (though I think unlikely) that PrimeGov keeps trees only from fully marked sources. The second orphan-tagged attachment in the same packet points the same way. This was one meeting in one city.
- **CivicClerk** keeps incoming tag trees in the packet, but the packet would not pass PDF/UA as is, for three reasons:
  - catalog /Lang and DisplayDocTitle are lost (and Title is empty);
  - the page stamps are untagged and not marked as artifacts (a PDF/UA failure);
  - at least one packet had a broken ParentTree mapping.
  The individual attachment remains a good accessible copy.
- **Diligent Community.** The platform appears to re-tag the package itself (auto-tagging into /P), not to keep source trees. If that holds, an Ada Editor file with headings, tables and alt text would become flat /P in the package, while still carrying a PDF/UA-1 claim. This is an inference: I could not find a source attachment in that package that was richly tagged, because Diligent shows only its own per-item compilations, not raw uploads.

### Gaps
- Only one paired meeting each for PrimeGov and Diligent, and two each for CivicClerk and Municode. Vendors may configure these per customer, so results may differ by customer or version: Aspose.PDF 22.12 on CivicClerk, 23.8 on Municode, 25.10 on PrimeGov.
- No full PDF/UA validator (veraPDF or PAC) was run. The findings come from structural checks.
- I did not test whether CivicClerk's `pdfAVersion` (PDF/A) option, if turned on by a clerk, changes this.

---

## Q3. Do platforms alter individual attachments (as opposed to packets)?

### Takeaway
Uploaded PDFs were served unchanged on every platform that exposes raw attachments: Legistar, CivicClerk, PrimeGov and OnBase. Tagged uploads stayed tagged. When a clerk uploads Word (or other Office) files, the platform makes the PDF itself. PrimeGov (Aspose.Words 25.11) and OnBase/town O1 (Aspose.Words 23.11) produced untagged PDFs. CivicClerk (Aspose.PDF 22.12) produced tagged PDFs with flat /P and a PDF/UA-1 claim. Legistar simply served the .docx.

### Cited Findings
- **Legistar.** Word-made narrative PDFs are served tagged (462 and 320 elements, Producer "Microsoft Word for Microsoft 365"), and staff reports uploaded as .docx are served as .docx. Legistar's own agendas are untagged Crystal Reports output in both town L1 and town L2. Sources: L2, docx, L1, L4.
- **CivicClerk.** Uploaded PDFs are served as-is (town C1 staff report, town C2 proposal). A .docx upload becomes an "Aspose.PDF for .NET 22.12.0" PDF that is tagged but contains 139 /P and nothing else, with pdfuaid part 1 in its XMP (town C2 P&Z minutes). Source: town C2 meeting API.
- **PrimeGov.** A Word upload, served via `historyattachment`, is an "Aspose.Words for .NET 25.11.0" PDF with no StructTreeRoot. An Acrobat PDF upload keeps its Acrobat Producer and its tag tree. Sources: G2, G3.
- **OnBase (town O1).** An Acrobat-OCR'd, tagged PDF is served unchanged (44 elements, Lang en). An attachment uploaded as `CRA2512421.DOCX` is delivered as an untagged "Aspose.Words for .NET 23.11.0" PDF. Sources: O1, O2.
- **Diligent Community.** Only Diligent-compiled per-item PDFs are exposed: cover report plus attachments, made with ABCpdf. In the legal-invoices item, the attachment pages were untagged while the cover was tagged as flat /P. Source: I3.
- **Municode Meetings and CivicPlus Agenda Center** expose only the uploaded or compiled agenda and packet files. Separately posted agendas were served as their original tagged Word PDFs (M2, M3), and the town A1 upload kept its Acrobat Producer. Sources: M2, P1.

### Inferences
- For Ada Editor, the practical advice is to have clerks upload the exported PDF/UA file, not the .docx, and to point the public to the individual attachment link where one exists: Legistar, CivicClerk, PrimeGov, OnBase. On Municode Meetings and PrimeGov, the packet copy of the same document will very likely be untagged.
- A platform-generated agenda or cover sheet is a separate accessibility problem from what happens to the clerk's attachments. Legistar's Crystal Reports agendas were untagged. Diligent's cover reports were tagged, but only as /P.

### Gaps
- I did not test Legistar's packet builder (where a city enables it), Granicus Peak Agenda, or Novus Agenda.

---

## Q4. Per-platform interpretation (observation vs. inference)

### Takeaway
Ranked by how well a tagged upload survives in the packet: CivicClerk keeps trees (with defects), then Diligent (re-tags, flat), then PrimeGov and Municode Meetings (drop trees). Legistar, OnBase and CivicPlus Agenda Center left uploaded PDFs untouched, and none of the sampled meetings on those three had a packet compiled by the platform.

### Cited Findings
- **Granicus Legistar.** *Observed:* tagged uploads served tagged (L2, L3); system agendas untagged (L1, L4); no packet link on the sampled meeting pages. *Not tested:* packet merging. Sources: town L1 MeetingDetail, L2.
- **PrimeGov (town P1).** *Observed:* packet untagged, with orphan StructParents on the pages taken from tagged attachments; Word uploads converted to untagged PDF. *Inference:* the packet merge drops tag trees. Sources: G1, G2.
- **CivicClerk (town C1, town C2).** *Observed:* source trees, RoleMap and element Lang kept. Catalog Lang and DisplayDocTitle dropped. Page stamps unmarked. One ParentTree off-by-one in town C1. Docx-derived PDFs are flat /P with a PDF/UA-1 claim. Sources: C1, C4.
- **CivicPlus Agenda Center (town A1).** *Observed:* hosting only; the clerk assembled the packet in Acrobat. That file has a 1,223-element tree but /Marked false, so pdfinfo reports Tagged: no, and it uses "Artifact" as a structure-element type 240 times. *Inference:* any loss of tags here comes from the clerk's own workflow (Acrobat combine plus header/footer), not the platform. Source: P1.
- **Municode Meetings (town M1, town M2).** *Observed (2 of 2 paired meetings):* packets have no tag tree; orphan StructParents on pages from tagged sources; header and page stamps added. *Inference:* the platform's Aspose.PDF merge drops tags. Sources: M1, M4.
- **Diligent Community / iCompass (town D1).** *Observed:* package and per-item PDFs carry "Diligent Corporation using ABCpdf", a PDF/UA-1 claim, and tags made only of /P and /Link. Pages that were untagged in the item PDF are tagged in the package. *Inference:* tags are generated at build time, and rich source tags are probably flattened (not proven). Source: I1.
- **OnBase Agenda Online (town O1).** *Observed:* PDFs passed through unchanged; DOCX rendered untagged by Aspose.Words; no packets published (the IsAgendaPacketAvailable flag was false for every Aug–Oct 2026 meeting). Source: town O1 Agenda Online.

### Inferences
- In this sample, a PDF/UA file from Ada Editor would survive as an individual attachment on Legistar, CivicClerk, PrimeGov and OnBase. It would survive with tags inside the packet only on CivicClerk, and even there the packet itself would not conform to PDF/UA. On Municode Meetings and PrimeGov the packet copy would very likely be untagged. On Diligent it would likely be re-tagged as flat paragraphs.

### Gaps
- Each platform was sampled in only 1–2 municipalities, and versions or configuration may differ elsewhere.

---

## Q5. What could not be tested, and why

### Takeaway
I could not test eSCRIBE, BoardDocs, Novus Agenda or Granicus Peak Agenda. eSCRIBE and BoardDocs are behind bot protection that I did not try to get around. For Novus and Peak, I could not identify a Florida customer currently publishing 2025–26 documents.

### Cited Findings
- **eSCRIBE.** File downloads from FL towns E1 and E2 (`FileStream.ashx?DocumentId=...`) returned HTTP 403 with a Cloudflare page titled "Verifying your browser — eScribe". I stopped there. Portals: town E1, town E2.
- **BoardDocs.** The portal of FL town B2 returned a CloudFront "403 ERROR … Request blocked" to a plain request, and I stopped there (town B2 BoardDocs). Most Florida BoardDocs users found in search were school boards, not cities.
- **Novus Agenda.** `*.novusagenda.com/agendapublic/` answers HTTP 200 for any subdomain (wildcard), and none of the Florida names I tried showed 2025–26 meeting lists in static HTML. A search-result summary said FL town X1 moved its agendas to PrimeGov and keeps older items on NovusAgenda; I did not verify this, because the town X1 site returned 403 to curl (town X1 agendas page).
- **Granicus Peak Agenda.** I found no Florida instance.
- **Diligent iCompass, other towns.** The CivicWeb sites of FL towns D2 and D3 appear stale, with folders ending in 2019 and 2022 (town D2, town D3). FL town D4 has an active CivicWeb portal but was not sampled (town D4).

### Inferences
- A browser-based follow-up, run by a person, could cover eSCRIBE and BoardDocs.
- Additional CivicClerk customers in Florida were seen but not sampled: FL towns C5, C6 and C7, and C8 and C9 (their API hosts answer).

### Gaps
- No evidence for eSCRIBE, BoardDocs, Novus or Peak Agenda. Do not treat their behavior as known.
- **Possible test-design improvement:** to remove the remaining "maybe the clerk uploaded untagged sources" doubt, a cooperating clerk on each platform could upload a known Ada Editor PDF/UA test file, and the posted attachment and packet could then be compared byte for byte.

The 23 files were downloaded to a temporary folder for inspection and were not kept. The inspection scripts were throwaway Python that read the catalog, structure tree, ParentTree and content streams.
