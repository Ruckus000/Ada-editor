# Research notes: the Title II driver, what clerks search for, who ranks, where to be listed, and the brand name

Written on 2026-10-09 by a research agent working from public sources, and kept as it was delivered (minus 0 line(s) about this session's tooling). Claims carry their own sources and dates. The decisions drawn from it are in [the decision record](../search-and-ai-2026-10.md).

---

I couldn't confirm whether Google has indexed adaedit.com, but every engine I could query shows nothing from either host. The biggest correction for your planning is that the compliance dates in your brief changed in April 2026.

**Method notes.** Google's results pages refused automated fetches, and so did DuckDuckGo and Mojeek. The Wayback Machine was offline. Bing fetched through this tool only searched one word of a multi-word query, so I don't rely on Bing results. "Who ranks" comes from the WebSearch tool's engine plus Brave. Demand is estimated from Google and Bing autocomplete, Brave's "People also ask", and how crowded the results are. I had no keyword-volume tool: the Ahrefs and Similarweb connectors in this session need authorizing first. Reddit is blocked to these tools.

## Top line
- **The deadlines moved.** A DOJ interim final rule on April 20, 2026 set **April 26, 2027** for entities serving 50,000 or more people, and **April 26, 2028** for smaller ones and special districts. The National Federation of the Blind (NFB) is suing to undo the extension, and DOJ says it plans further rulemaking on the rule's substance.
- **Clerk-specific results are thin and vendor-owned.** Most of them are blog posts from CivicPlus, Granicus, PublicInput and similar companies. No page I found documents what agenda platforms do to tagged PDFs, which is exactly the owner's research.
- **adaedit.com does not show up in any engine I could check.** The GitHub repo does.
- **"Ada Editor" collides heavily with other uses of the name.** "adaedit" collides less.

---

## 1. The regulatory driver

### Takeaway
Title II still requires WCAG 2.1 AA for posted documents, on new dates (2027 and 2028). Two things could change it: DOJ has said it plans substantive rulemaking (none published yet), and the NFB lawsuit, which is unresolved, seeks to restore the original dates.

### Findings
- **The interim final rule.** Published April 20, 2026 and effective the same day, with comments due June 22, 2026. It moved the 50,000+ deadline from April 24, 2026 to **April 26, 2027**, and the under-50,000 and special-district deadline from April 26, 2027 to **April 26, 2028**. FR Doc 2026-07663, RIN 1190-AA82, Docket CRT150. [govinfo text](https://www.govinfo.gov/content/pkg/FR-2026-04-20/html/2026-07663.htm); [ada.gov fact sheet table](https://www.ada.gov/resources/2024-03-08-web-rule/)
- **DOJ's stated reasons** (public-domain text):
  - DOJ "overestimated the capabilities (whether staffing or technology) of covered entities".
  - "generative AI, does not yet reliably automate the remediation of inaccessible content at scale."
- **Further rulemaking.** DOJ "plans to engage in future rulemaking processes related to the substantive requirements of the 2024 final rule" and "will consider issuing an NPRM". The IFR also criticizes the 2024 rule's references to changing W3C pages. [govinfo](https://www.govinfo.gov/content/pkg/FR-2026-04-20/html/2026-07663.htm)
  - I found no proposed rule published through early October 2026. [search summary of RIN 1190-AA82 materials](https://public-inspection.federalregister.gov/2026-07663.pdf)
  - A November 2025 commentary had already reported that DOJ planned to revisit the rule. [Pivotal Accessibility](https://www.pivotalaccessibility.com/2025/11/doj-to-revisit-ada-title-ii-and-iii-and-what-it-means-for-digital-accessibility/)
- **NFB lawsuit.** *NFB v. DOJ*, No. 1:26-cv-02007 (D. Md.), filed May 2026, challenges both the DOJ and HHS extensions under the Administrative Procedure Act. [complaint](https://democracyforward.org/wp-content/uploads/2026/06/NFB-vs-DOJ-Complaint.pdf); [GovExec, May 2026](https://www.govexec.com/management/2026/05/disability-advocates-sue-over-website-accessibility-delays/413785/)
  - Docket aggregators show NFB filed for summary judgment on Sept 28, 2026. There is no ruling yet. [PacerMonitor](https://www.pacermonitor.com/public/case/64778075/National_Federation_of_the_Blind_v_Department_of_Justice_et_al); [Deque](https://www.deque.com/blog/nfb-sues-doj-and-hhs-over-deadline-extensions-ada-title-ii-and-section-504/)
- **HHS Section 504 (relevant to health departments).** An interim rule around May 7, 2026 moved the dates to May 11, 2027 for entities with 15 or more employees and May 10, 2028 for smaller ones. I couldn't fetch HHS's own page, so this comes from summaries. [HHS release](https://www.hhs.gov/press-room/hhs-extends-mobile-and-web-accessibility-deadline.html); [Duane Morris](https://www.duanemorris.com/alerts/health_human_services_follows_department_justices_lead_extends_section_504_web_mobile_0526.html)
- **The two exceptions, as written.** Preexisting conventional electronic documents are excepted if posted "before the date the public entity is required to comply with this subpart", unless they are "currently used to apply for, gain access to, or participate in" services. [28 CFR 35.201 (LII)](https://www.law.cornell.edu/cfr/text/28/35.201)
  - Archived content must meet four tests: created before the compliance date, kept only for reference, never altered, and stored in a clearly labeled archive. [ada.gov](https://www.ada.gov/resources/2024-03-08-web-rule/)
- **DOJ's own examples that matter for clerks** ([ada.gov](https://www.ada.gov/resources/2024-03-08-web-rule/)):
  - City council minutes created after the compliance date don't qualify as archived, even if they sit in an archive.
  - A PowerPoint posted after the compliance date for an upcoming council meeting isn't excepted.
  - A 2014 sample ballot would probably qualify as preexisting.
  - A document edited after the date loses the exception.
- **How agencies are applying it.** Some label archives with an exception notice and offer copies on request: [Vermont ACCD](https://accd.vermont.gov/node/900), [Palomar](https://www.palomar.edu/ipc-hiring/archive/). Salisbury University's FAQ flagged doubt about whether the cutoff moved with the extension. [Salisbury PDF](https://www.salisbury.edu/administration/campus-governance/faculty-senate/_files/25-26/2026-02-10/2025-02-10-Response-to-FS-Digital-Accessibility-Questions-Part-2.pdf)
- **Colorado.** The HB24-1454 grace period ended July 1, 2025. OIT rule amendments took effect June 30, 2025: five ways to comply (including publishing an accessibility plan), an undue-burden route, a required public way to report problems, and accessibility statements. OIT says the state obligations stand regardless of the federal delay. [OIT law page](https://oit.colorado.gov/accessibility-law); [OIT April 2026 newsletter](https://oit.colorado.gov/accessibility/news/april-2026)
- **Other states.** New Mexico HB 120 (2025, state agencies) apparently didn't pass, and HB 295 (2026) refiled it. [nmlegis HB295](https://www.nmlegis.gov/Sessions/26%20Regular/bills/house/HB0295.html) Hawaii issued Administrative Directive 26-01 on May 5, 2026. [Hawaii DCAB](https://health.hawaii.gov/dcab/files/2026/05/2604095_AD-26-01-HTH-Admin-Directive.pdf) NCSL reported in September 2026 that legislatures are working through the rule for their own PDFs. [NCSL](https://www.ncsl.org/news/details/ada-web-rule-sends-legislatures-racing-toward-digital-access)
- **Section 508.** It still incorporates WCAG 2.0 AA, and I found no 2026 change to the standard. [Access Board](https://www.access-board.gov/news/2023/11/27/w3c-wcag-2-2-now-available/) Section508.gov added a Content Library (June 2, 2026), a government supplement to the Accessibility Conformance Report (August 2026), and Word accessibility courses (September 2026). [What's New](https://www.section508.gov/whats-new/)

### Inferences
- Both exception cutoffs are defined by "the date the public entity is required to comply", so the IFR very likely moved them too. Large entities' documents posted before April 26, 2027 can count as "preexisting". No DOJ statement confirms this.
- An agenda for an upcoming meeting is plausibly "currently used to participate" in a program, so it may not be excepted even before the date. Treat this as an open question, not a selling point.
- Many vendor pages still show the old dates (for example [GovTech, Dec 2025](https://www.govtech.com/biz/civicplus-buys-streamline-in-digital-accessibility-play)). A date-correct, primary-sourced explainer would stand out.

### Gaps
- Any DOJ Unified Agenda entry for 2026.
- NFB case activity after Sept 28, 2026.
- Whether Colorado's 2021 private right of action still applies as enacted (not checked).

---

## 2. Demand landscape

### Takeaway
Real search volume sits in generic PDF and Word questions ("ada compliant pdf", "how to make a pdf ada compliant", "make pdf accessible free", "pdf accessibility checker"). Clerk-specific phrasings are low-volume but high-intent, and they surface mainly as template searches and "People also ask" questions.

### Findings
- **Google autocomplete, Oct 9, 2026 (en-US).** A deep autocomplete list (about 10 variants) means many real searches use that phrasing.
  - "ada compliant pdf" → checker, example, files, reader, 508 compliant pdf.
  - "how to make a pdf ada compliant" → in adobe acrobat, scanned, fillable, form, 508.
  - "make pdf accessible" → free, online free, from word.
  - "pdf accessibility checker" → online free, pac, mac, "title failed", 2026.
  - "pdf/ua" → identifier missing, vs wcag, -1, -2, requirements.
  - "wcag pdf" → checker, techniques, requirements, checklist.
  - "ada title ii pdf" → requirements.
  - "ada compliant document" → checker, requirements, deadline, checklist.
  - Agenda and minutes seeds return only template variants: "accessible agenda template", "accessible meeting agenda template", "accessible meeting minutes template", "ada compliant agenda template".
  - "alt text for maps" → writing, examples.
  - **No suggestions at all** for: accessible pdf agenda, agenda packet accessibility, archived content exception, ada title ii documents, ada editor accessibility.
- **"People also ask" (Brave, clerk query):**
  - "Do government meeting agendas need to be accessible?"
  - "Should meeting agendas be published as HTML or PDF?"
  - "How do I make meeting minutes accessible?"
  [Brave SERP](https://search.brave.com/search?q=reddit%20city%20clerk%20accessible%20pdf%20agendas%20minutes%20ada)
- **Forums.** Brave surfaced r/accessibility threads about flat, image-only PDFs and WCAG; I couldn't read Reddit directly. WebAIM list archives and Adobe Community threads show recurring "tags lost when combining PDFs" problems. [Adobe Community](https://community.adobe.com/questions-9/accessibility-tags-missing-when-combining-pdfs-1305073)
- **Clerk education is vendor-led.**
  - CivicPlus webinars: "Make agenda packets PDFs accessible" (aired June 9, 2026), "Clerk's guide…", and an agenda deep dive. [CivicPlus](https://www.civicplus.com/webinars/am/make-agenda-packets-pdfs-accessible/)
  - Massachusetts Municipal Association free webinars Jan 14 and Aug 4, 2026. [MMA](https://www.mma.org/resource/digital-accessibility-awareness-for-municipalities-2-0/)
  - UKY HDI held a documents session on May 28, 2026. [UKY](https://research.uky.edu/events/4th-thursday-ada-talks-ada-title-ii-pdfs-and-basic-accessibility-techniques)
  - I found no IIMC Title II document session for 2026. [IIMC learning](https://www.iimc.com/131/Online-Learning-Opportunities)
- **Government media.**
  - GovTech, "The Great PDF Reckoning". [GovTech](https://www.govtech.com/voices/the-great-pdf-reckoning-a-wake-up-call-for-ada-compliance)
  - GovLoop, "Your Website May Be ADA Compliant—But Are Your Public Records?". [GovLoop](https://www.govloop.com/community/blog/your-website-may-be-ada-compliant-but-are-your-records/)
  - NLC explainer, Feb 18, 2026. [NLC](https://www.nlc.org/article/2026/02/18/is-your-city-ready-for-website-accessibility-requirements/)
  - Route Fifty calls it a "slow-moving crisis" (May 2026). [Route Fifty](https://www.route-fifty.com/digital-government/2026/05/website-accessibility-remains-slow-moving-crisis-despite-rule-delay-experts-warn/413476/)

### Gaps
- Absolute search volumes (needs Ahrefs or Search Console).
- Reddit thread text.
- Content from IIMC and state clerk associations.

---

## 3. Competitors and who ranks

### Takeaway
Big tools own checking and repair. Agenda platforms are moving to *HTML copies* of PDFs, not fixing the PDFs themselves. Universities own the how-to guides, and vendors own the clerk content. Nobody I found ranks with primary research on what agenda platforms do to documents.

### Competitor changes, 2025–2026
- **CivicPlus**
  - Bought Streamline, which brought DocAccess (converts PDFs to accessible HTML, plus translation), on Dec 18, 2025. [GovTech](https://www.govtech.com/biz/civicplus-buys-streamline-in-digital-accessibility-play)
  - Integrated DocAccess into its agenda product, and uses Allyant CommonLook for PDF checks. [CivicPlus fact sheet](https://www.civicplus.com/fact-sheets/am/agenda-accessibility-and-translation-powered-by-docaccess/)
  - DocAccess runs an active SEO blog. [DocAccess](https://docaccess.com/blog/doj-extends-title-ii-deadline-one-year)
- **Diligent** (Community, BoardDocs, iCompass) added DocAccess HTML versions alongside PDFs on Sept 22, 2026. Its compliance language is hedged, and the original PDFs are not remediated. [Diligent](https://www.diligent.com/company/newsroom/diligent-announces-integration-with-civicplus-docaccess)
- **Granicus** says WCAG 2.2 AA "wherever possible". Legistar InSite has offered HTML agendas and minutes since 2021, and its packet guide uses Acrobat's combine command. [Granicus statement](https://granicus.com/wp-content/uploads/granicus-trust-center-corporate-accessibility-statement.pdf); [packet guide](https://support.granicus.com/articles/How_To/Creating-an-Agenda-Packet-in-Legistar)
- **Microsoft Word** improved tagged-PDF export in Office 2024 / Microsoft 365 version 2408+ (Dec 2024). [Microsoft devblog](https://devblogs.microsoft.com/microsoft365dev/accessibility-improvements-in-microsoft-365-pdf-export)
- **Google Docs** has exported tagged PDFs since about Jan 2025, with caveats. [TMU](https://www.torontomu.ca/accessibility/guides-resources/document-accessibility/)
- **axes4** released PAC 2026 (free, Windows-only, PDF/UA plus WCAG 2.2 machine checks) and an axesWord 25.9 beta with accessible forms (July 2026). [PAC 2026](https://pac.pdf-accessibility.org/en/resources/quickstart-guide/introducing-pdf-accessibility-checker-2026)
- **Grackle** became free campus-wide at the University of Washington (March 2026). [UW](https://www.washington.edu/accessibility/2026/03/10/grackle-for-google)
- **Equidox** was offered to Kansas state agencies (April 2026). [Kansas](https://www.ebit.ks.gov/Home/Components/News/News/43/17)
- **PAVE** is free, with a 5 MB limit, and keeps files on its server up to three weeks. [Perkins](https://www.perkins.org/resource/pave-web-tool-check-PDF-accessibility/)
- **PDFix.io** is a free online toolkit. [PDF Association](https://pdfa.org/introducing-pdfixio-free-online-pdf-processing-toolkit/)
- **FractalApps** (Google Docs add-on) checks WCAG 2.1 AA and PDF/UA-1 with 61 checks, and exports tagged PDF on its server (listing updated August 2026). It is the closest analog to Ada Editor. [Marketplace](https://workspace.google.com/marketplace/app/accessibility_checker_for_docs_slides_an/620872258362)
- **Packet tag loss.** No Legistar or CivicClerk documentation or user report about tag loss when packets are built turned up. Tag loss on merge is documented generically in Acrobat forums. [Adobe](https://community.adobe.com/questions-9/accessibility-tags-missing-when-combining-pdfs-1305073)

### Which content types dominate
- **Rule and deadline questions:** ada.gov, law-firm alerts, university compliance pages.
- **How-to questions:** university and UK council guides.
- **Checker questions:** free tool pages and "best tools" roundups written by vendors.
- **Clerk questions:** civic-tech vendor blogs and webinars.
- **Templates:** Microsoft Create and community colleges.

### Two AI-answer probes
- **"Best free tool for town clerks…"** The answer recommended LibreOffice, Google Docs or Word plus PAC, and named no dedicated tool.
- **"Browser-based accessible document editor with WCAG checking and PDF/UA export"** The answer said it found no standalone browser editor and named FractalApps instead.

Ada Editor is invisible for its own category description.

### Openings
1. **Original research.** The platform tag-handling study and the 28-document study have no competitors. AI answers cite primary research.
2. **Date-correct regulatory explainers** that quote the CFR and ada.gov examples.
3. **"HTML or PDF?"** Ada Editor exports both, and the main competitors sell HTML copies.
4. **Agenda and minutes templates.**
5. **Weak-competition how-tos.** "How to make meeting minutes accessible" is dominated by GoTranscript's content-farm pages.

### (a) Candidate queries and prompts
Demand basis: G = Google autocomplete variants; PAA = Brave "People also ask"; none = no suggestions. Rankings are from my searches; "n/c" means not checked.

| # | Query / prompt | Intent | Demand (basis) | Who ranks now | Fit for Ada Editor |
|---|---|---|---|---|---|
| 1 | how to make a pdf ada compliant | Info | High (G: 10) | Similar query: MSU Texas, Okaloosa County, Pitt, Sonoma County, WP ADA Compliance, accessibilitychecker.org | "Fix it in the source" guide that is honest about limits |
| 2 | ada compliant pdf checker / pdf accessibility checker online free | Transactional | High (G: 10 each) | Siteimprove toolkit, axes4 PAC/axesCheck, UWM, accessibilitychecker.org, imageonline | Poor fit (not a PDF checker); comparison or explainer only |
| 3 | make pdf accessible free online | Transactional | High (G) | Warwick, PDFix.io, axes4, Paperturn | Tool page: free, no upload, new documents rather than repair |
| 4 | convert word to accessible pdf | Info/transactional | Med–High (G: 6) | Oregon State, Moraine Valley, Syracuse, Norfolk and Nottinghamshire councils | Tutorial plus .docx import page (PDF/UA-1 checked by veraPDF) |
| 5 | accessible word document checklist | Info | Med (G) | n/c | Checklist mapped to the 19 rules and their criteria |
| 6 | pdf/ua vs wcag | Info | Med (G) | Siteimprove, Recite Me, PDF Association, Buffalo, Continual Engine | Technical explainer with veraPDF evidence |
| 7 | pdf/ua identifier missing | Troubleshooting | Low–Med (G) | n/c | Short technical note |
| 8 | wcag pdf requirements / wcag for word documents | Info | Med (G) | n/c | Matrix of which criteria apply to an agenda |
| 9 | how to make a pdf 508 compliant | Info | Med (G) | n/c | Explainer: 508 = WCAG 2.0 AA; Ada Editor checks 2.1 AA |
| 10 | ada title ii pdf requirements / are pdfs covered | Info | Med (G: 5) | ada.gov rule PDF, Siteimprove, Boise State, Mass.gov, Bricker | Primary-sourced FAQ |
| 11 | ada title ii deadline extended 2027 | News | High in Apr–Jun 2026, now fading | Reed Smith, Duane Morris, Venable, NACo, UNC SOG, DocAccess blog | Maintained tracker of the rule and the lawsuit (crowded, low priority) |
| 12 | do government meeting agendas need to be accessible | Info | Low–Med (PAA) | Flipbooks AI, Accessible Compliance Group, PublicInput, Govably, Granicus, CivicPlus | **Clerk guide using ada.gov's examples** |
| 13 | should agendas be HTML or PDF | Info/commercial | Low (PAA) | Same vendor set; CivicPlus and Diligent sell HTML | **Honest comparison** |
| 14 | how to make meeting minutes accessible | Info | Low–Med (PAA) | GoTranscript (6 of 9 results), UM-Flint | Guide plus minutes template |
| 15 | accessible meeting agenda template | Transactional | Low–Med (G) | Microsoft Create, Santa Monica College, Foothill College | **Free templates that open with no account** |
| 16 | accessible meeting minutes template | Transactional | Low–Med (G) | n/c (similar to #15) | Same |
| 17 | accessible agenda PDF Title II clerk | Info/commercial | Low (none) | PublicInput, CivicPlus, city pages, Illinois workNet | Clerk landing page |
| 18 | make agenda packets accessible | Commercial | Low, but high value | CivicPlus webinar and blog, Diligent news | **Agenda-platform research** |
| 19 | Legistar / CivicClerk / eSCRIBE accessible PDF | Commercial | Low | Granicus support docs, CivicPlus | One neutral findings page per platform |
| 20 | archived web content exception agendas minutes | Info | Low (none) | accessible.org, UKY, NC DPI, Salisbury, Palomar, Vermont | **Regulation-text explainer covering the moved cutoff** |
| 21 | preexisting conventional electronic documents | Info | Low | ada.gov, universities | Same cluster |
| 22 | alt text for maps (site plans, charts) | Info | Low–Med (G: 3) | Uni Hamburg, Penn State Press, MN.gov, Nottinghamshire, Pearson | Packet-specific alt-text guide |
| 23 | Prompt: "free tool for clerks to make accessible agendas" | Commercial | Low volume, high intent | AI answer: LibreOffice, Google Docs, Word + PAC | Clerk page plus third-party listings AI can cite |
| 24 | Prompt: "browser accessible document editor, WCAG + PDF/UA export" | Commercial | Very low | AI answer: "none found", FractalApps | Crawlable product page (needs indexing) |
| 25 | "ada editor" / "adaedit" | Navigational | Very low | Ada-language editors, AdaEdit papers | Brand clean-up (§5) |

---

## 4. Off-site places

### (b) Listing opportunities

| Place | Relevance | Eligibility / process | Effort |
|---|---|---|---|
| [W3C WAI Evaluation Tools List](https://www.w3.org/WAI/test-evaluate/tools/submit-a-tool/) | High: universities and AI answers cite it | Online form, processed publicly on GitHub. Fields include "Product evaluated: document", license, tool type, WCAG 2.1. No PDF/UA field (use Comments). Excludes tools that mainly change content to improve accessibility, so frame it as evaluation during writing. No implying endorsement. Staff support limited until November 2026. | Low |
| [A11y Project resources](https://www.a11yproject.com/contributing-guidelines/) | Medium | GitHub pull request in original wording; no backlink or affiliate schemes | Low–Med |
| [brunopulis/awesome-a11y](https://github.com/brunopulis/awesome-a11y) (2.0k stars) | Low–Med (developers, AI crawlers) | Pull request per its contributing file; overlays banned | Low |
| [AlternativeTo: PAC alternatives](https://alternativeto.net/software/pdf-accessibility-checker) | Low–Med (page lists only 3 alternatives) | Free account; anyone can add an app | Low |
| Product Hunt | Low for clerks | Free launch | Medium |
| G2 / Capterra / Software Advice | Low–Med (CivicClerk, axesWord, Grackle are listed) | Free vendor profile; needs reviews | Medium |
| State leagues and training centers: [LMC](https://www.lmc.org/news-publications/news/all/doj-extends-web-accessibility-compliance-deadlines-for-local-governments/), [MMA](https://www.mma.org/resource/digital-accessibility-awareness-for-municipalities-2-0/), [MRSC](https://mrsc.org/stay-informed/mrsc-insight/february-2026/ada-standards-websites-apps), [CTAS Tennessee](https://www.ctas.tennessee.edu/news/doj-extends-wcag-21-aa-compliance-deadlines-local-governments), [UNC SOG](https://canons.sog.unc.edu/blog/2026/04/20/deadlines-to-comply-with-ada-web-accessibility-requirements-extended-by-one-year/), CML | High | No vendor directories found; pitch research or a webinar | Med–High |
| IIMC and state clerk associations | High | Education sessions, magazine, exhibitor programs | Med–High |
| ADA National Network ([adata.org](https://adata.org/event/939/)), UKY HDI | Medium | They run neutral sessions; offer research, not product | Medium |
| University tool pages (UW, SDSU, [Harvard vendors list](https://accessibility.huit.harvard.edu/doc-vendors.md), UVA) | Medium | Usually list licensed or free tools; outreach | Medium, low hit rate |
| [GovLoop community blog](https://www.govloop.com/community/blog/the-ada-title-ii-clock-has-moved/), GovTech "Voices", Route Fifty | Med–High for government readers | Contributed posts | Medium |
| [Chax Chat podcast](https://www.castfox.net/podcast/chax-chat-accessibility-podcast-2477889/episode/what-2025-taught-us-about-accessibility-and-what-comes-next-758686) (PDF specialists; Title II episode spring 2026), IAAP podcast, a11y Weekly, WebAIM list | Medium | Pitch the 28-document and platform studies | Low–Med |
| section508.gov | Low | Didn't verify whether it lists third-party tools; unrealistic | n/a |

---

## 5. Brand discoverability

### Findings
- **Indexing.**
  - Brave, site:adaedit.com: "Too few matches". [Brave](https://search.brave.com/search?q=site%3Aadaedit.com)
  - Brave, site:ada-editor-umber.vercel.app: no results.
  - WebSearch tool, site:adaedit.com: no adaedit.com pages.
  - Exact "adaedit.com": no mentions, only aedit.com and Delinea ADEdit.
  - Bing: inconclusive because of the fetch problem. Google: unverifiable here.
- **GitHub.** The repo is public with 0 stars, 0 forks, 111 commits, no topics and no license shown. Its description is "Write Ada compliant documents". [repo](https://github.com/Ruckus000/Ada-editor)
  - The homepage field and the README "Live demo" link both point to **ada-editor-umber.vercel.app**, not www.adaedit.com.
  - Brave ranks the repo #14 for "ada editor wcag document accessibility"; adaedit.com doesn't appear.
- **Technical state** (curl, Oct 9, 2026):
  - "/" serves the app shell with **two title tags** ("Loading your documents · Ada Editor" and "Your desk · Ada Editor").
  - No canonical tag. robots.txt and sitemap.xml both return 404.
  - The Vercel host returns 200 with no redirect, so the same content lives on two hosts. The apex domain redirects (308) to www correctly.
  - The real landing page is **/welcome** ("Accessible document editor · Ada Editor").
  - /help, /accessibility and /privacy reuse the generic meta description, "Write documents that meet WCAG 2.1 AA and Section 508."
  - The two research write-ups exist only in the repo's `docs/audit/` folder, not as site pages.
  - No stale deadline dates in the app copy.

### (c) Brand-collision verdict
- **"Ada Editor": high collision.**
  - Brave for the quoted phrase returns only other meanings: [OneCompiler Ada](https://onecompiler.com/ada), Editrocket's product page literally titled "Ada Editor" ([Editrocket](https://editrocket.com/features/ada_editor.html)), AdaCore GNATbench, an American Dental Association editor announcement, RIBA "ADA Editors", and Ada Health's "Ada Editorial".
  - The WebSearch tool returns 1989–1997 Ada-language Usenet threads.
  - Google autocomplete suggests "ada editorial", "ada editor in chief", "ada code editor" and "ada diabetes editorial".
  - "ADA" on its own pulls in ADA.gov and the American Dental and Diabetes Associations.
- **"adaedit": moderate collision.**
  - Google autocomplete shows only "adaedit" itself.
  - Brave shows AdaEdit research papers (ACL 2025 and [arXiv 2603.21615](https://arxiv.org/abs/2603.21615), March 2026) with their GitHub repos, a Gnoga "AdaEdit" demo from the Ada-language world, and #adaedit fan-edit hashtags.
  - There is an old ADAEDIT trademark (serial 74092183, Aetech, Inc.); I couldn't check its status.
  - Bing autosuggest drifts to "adsi edit" and "audacity".
- **Messaging conflict.** "Ada compliant" on GitHub and "documents that meet WCAG 2.1 AA" in the meta description cut against the product's refusal to call documents compliant.
- **Overall.** The brand name won't carry navigational search on its own. Discovery will come from descriptive queries, third-party listings that pair "Ada Editor" with "accessible document editor", and consistent use of the adaedit.com domain everywhere.

### Gaps
- Google indexing: check with Search Console URL inspection.
- Bing: check with Bing Webmaster Tools.
- Backlinks: unknown (Wayback was offline).
- ADAEDIT trademark status: unknown.
