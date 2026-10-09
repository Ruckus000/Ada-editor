# Research notes: classic SEO for Google and Bing, and Google's AI features (AI Overviews, AI Mode)

Written on 2026-10-09 by a research agent working from public sources, and kept as it was delivered (minus 1 line about this session's tooling). Claims carry their own sources and dates. The decisions drawn from it are in [the decision record](../search-and-ai-2026-10.md).

---

# SEO and AI-search optimization for Google and Bing: what works as of 9 Oct 2026 (for Ada Editor)

Each claim is tagged with its source type and date. **OD** = official doc (the date is the page's "last updated" date). **OB** = official blog post. **NS** = statement by a named staff member. **IS** = independent study. **VS** = vendor study (the vendor sells SEO tools or services, so it has a conflict of interest). **TP** = trade press or secondary report. **AN** = agency analysis or anecdote. **Stale** = from before 2025.

## 1. AI Overviews and AI Mode: Google's guidance, controls and reporting

**Takeaway:** Google's position is that no special optimization is needed: the page must be indexed and eligible to show a snippet, and normal SEO applies. A new Google guide in May 2026 restated this. What actually changed in 2026 is a real opt-out switch and a report that counts AI impressions (not clicks).

- **Official AI-features doc (OD, 2025-12-10):** "There are no additional requirements to appear in AI Overviews or AI Mode, nor other special optimizations necessary." A page must be "indexed and eligible to be shown in Google Search with a snippet." You don't need special schema.org markup or "AI text files." [AI features and your website](https://developers.google.com/search/docs/appearance/ai-features)
- **John Mueller's post (NS/OB, 2025-05-21)** lists 7 ways to perform well:
  - unique, valuable content;
  - good page experience;
  - crawl access;
  - preview controls;
  - structured data that matches what's visible on the page;
  - images and video as well as text;
  - "understand the full value of your visits."
  - He claims clicks from AI features are "higher quality" but gives no data. [Top ways…](https://developers.google.com/search/blog/2025/05/succeeding-in-ai-search)
- **New AI-optimization guide (OD, added 2026-05-15, updated 2026-07-10)** [guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide):
  - Optimizing for generative AI "is optimizing for the search experience, and thus still SEO."
  - Google Search ignores llms.txt, AI text files and Markdown copies of pages.
  - "There's no requirement to break your content into tiny pieces," and "There's no ideal page length."
  - Structured data "isn't required."
  - Chasing inauthentic "mentions" "isn't as helpful as it might seem."
  - Mass-producing pages for query variations or fan-out queries can violate the scaled content abuse policy.
  - "No third-party tool has access to our internal ranking or AI systems."
- **Controls:**
  - **nosnippet** "will also prevent the content from being used as a direct input for AI Overviews and AI Mode." It also removes normal snippets.
  - **max-snippet** limits how much of the page can be used as that input.
  - **noindex** removes the page from Search entirely.
  - Robots meta tags placed in the `<body>` are honoured. (OD, 2026-03-24) [Robots meta tag](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)
  - **data-nosnippet** is documented only as a snippet control. The AI-features doc groups it with nosnippet and max-snippet as ways to limit what is shown.
- **New "Search generative AI" control in Search Console Settings (OD).** Options are Include (the default), Exclude and Inherit. [Help page](https://support.google.com/webmasters/answer/16908024)
  - It covers AI Overviews, AI Mode and the generative AI features in Discover.
  - Exclude removes your links and stops your content being used for grounding. Excluded sites get no impressions or traffic from these features.
  - Google says it "isn't used as a ranking or inclusion signal affecting other parts of Search."
  - Changes take effect in 1–2 days. It reached all sites on Aug 31, 2026.
  - It was announced June 3, 2026 by Mrinalini Loew, who cited publisher feedback and the UK competition regulator (CMA) (OB). [Google blog](https://blog.google/products-and-platforms/products/search/new-controls-website-owners/)
- **Google-Extended (OD, 2026-07-14)** is a robots.txt token only, not a separate crawler.
  - It controls whether your content trains future Gemini models and grounds answers in the Gemini apps and in Vertex AI's "Grounding with Google Search."
  - It "does not impact a site's inclusion in Google Search" and is not a ranking signal.
  - **It does not keep you out of AI Overviews or AI Mode.** [Google crawlers](https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers)
- **Search Console reporting timeline (OD):**
  - AI Mode data was folded into Performance totals on 2025-06-16, and AI Overviews on 2025-08-15. [Changelog](https://developers.google.com/search/updates)
  - The **Generative AI performance report** launched in June 2026 and reached all sites on Aug 31, 2026.
  - It shows **impressions only**; I found no documented clicks, CTR, position or queries. Its dimensions are page, country, date and device. Search Labs experiments are excluded.
  - Its data comes from the "Web" search type, and AI Overviews and AI Mode are **combined**. [Report help](https://support.google.com/webmasters/answer/16984139)
  - **Answer to the question:** clicks are still folded into the Web search type. AI impressions now have their own report.
- **Usage figures (OB, 2026-06-03):** Google says AI Overviews has more than 2.5B monthly active users and AI Mode has passed 1B monthly users.
- **Gap:** I found no way to separate AI Overviews from AI Mode, and no AI-specific click data. The 2025-12-10 AI-features doc predates the new control.

## 2. Google on llms.txt, chunking, GEO/AEO, structured data and query fan-out

**Takeaway:** All five topics are now covered in Google's official docs, not just in staff remarks. Bing differs in emphasis (see Q7).

- **llms.txt:**
  - Google's changelog (2026-06-15) says Search "doesn't need llms.txt files and they don't affect rankings" (OD).
  - Mueller (Reddit, June 2026, reported by SEJ) called it "purely speculative for now." He had earlier compared it to the keywords meta tag (NS, secondhand). [SEJ](https://www.searchenginejournal.com/googles-mueller-says-llms-txt-cant-help-llms-differentiate-sites/579304/)
  - Gary Illyes reportedly told Search Central Live in 2025 that Google doesn't support it (secondhand only).
  - Two further reports are unverified: an Ahrefs log study (137k domains, nearly no requests for the file) and a Lighthouse "agent readiness" audit that checks for llms.txt.
- **Chunking — your recollection is correct.**
  - On the Search Off the Record podcast in early January 2026, Danny Sullivan, with Mueller, said "we don't want you to do that." He added that Google doesn't want a separate LLM version of pages and that any gain would be short-lived (NS via TP). [Ars Technica (syndicated)](https://tagteam.harvard.edu/hub_feeds/3382/feed_items/17175713/content); [SEL](https://searchengineland.com/google-doesnt-want-you-to-create-bite-sized-chunks-of-your-content-467269)
  - The 2026 guide now states the same in writing.
  - Counter-view: Mike King of iPullRank argues chunking improves retrieval (AN). [iPullRank](https://ipullrank.com/misinformation-about-chunking)
- **GEO/AEO is just SEO:** Google's 2026 guide says so (quoted above). Google's third-party SEO page lists "AEO"/"GEO" tools as something to "think critically" about and says Google "doesn't evaluate third-party services" (OD, 2026-06-05). [Third-party SEO](https://developers.google.com/search/docs/fundamentals/third-party-seo)
- **Structured data for AI features:** not required, and there's no special markup. It's still recommended for rich results, and it must match visible content (OD).
- **Query fan-out:** AI Overviews and AI Mode issue "multiple related searches across subtopics and data sources" (OD, 2025-12-10). The guide warns against writing content for fan-out queries primarily to manipulate rankings.

## 3. Structured data in 2025–2026

**Takeaway:** Google keeps cutting rich-result types. FAQ rich results were removed **May 7, 2026**. HowTo results have been gone since 2023 (stale, but still absent).

- **Search Gallery (OD, 2026-06-15):** 25 supported features, including Article, Breadcrumb, Organization, Review snippet, Software app, Q&A, Discussion forum and Profile page. FAQ and HowTo are absent. [Gallery](https://developers.google.com/search/docs/appearance/structured-data/search-gallery)
- **Deprecation timeline from the changelog (OD):**
  - 2025-06-12: deprecation banners for book actions, course info, estimated salary, ClaimReview, learning video, special announcement and vehicle listing.
  - 2025-09-09: docs for most of these removed.
  - 2025-11-05: practice problem deprecated (docs removed 2026-01-06); the book-actions deprecation reversed.
  - 2026-05-07: FAQ rich results deprecated; docs removed 2026-06-15.
  - 2025-01-22: breadcrumbs documented as **desktop-only**.
- **SoftwareApplication (OD, 2026-09-08):** requires `name`, `offers.price` (0 if free) and **either `aggregateRating` or `review`**. [Software app](https://developers.google.com/search/docs/appearance/structured-data/software-app)
- **Review snippets (OD, 2026-09-08):**
  - "Ratings must be sourced directly from users" and must be visible on the page.
  - "Don't include fake or undisclosed incentivized reviews" (added 2026-07-24).
  - Self-serving reviews are ineligible for the LocalBusiness and Organization types.
  - Violations can bring a manual action, after which the markup is ignored.
  - **So a fabricated `aggregateRating` breaks the policy.** [Review snippet](https://developers.google.com/search/docs/appearance/structured-data/review-snippet)
- **Organization (OD, 2026-09-08):** no required properties. `name`, `url`, `logo` and `sameAs` are recommended, placed on the home or about page. [Organization](https://developers.google.com/search/docs/appearance/structured-data/organization)
- **Site names (OD, 2025-12-10):** put WebSite `name` and `url` on the **home page**, with `alternateName` as a fallback. Google also reads `og:site_name` and `<title>`. Changes take days to weeks. Make sure redirects resolve and Googlebot can reach the target. [Site names](https://developers.google.com/search/docs/appearance/site-names)
- **Inference for Ada:** with no reviews yet, add WebSite, Organization (logo, sameAs), Breadcrumb and Article markup. SoftwareApplication markup may help Google understand the product, but it can't earn a rich result until real ratings exist.

## 4. Ranking systems and spam policies, 2025–2026

- **Updates on the Search Status Dashboard (OD)** [history](https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history):

| Update | Dates |
|---|---|
| March 2025 core | Mar 13–27, 2025 |
| June 2025 core | Jun 30–Jul 17, 2025 |
| August 2025 spam | Aug 26–Sep 22, 2025 |
| December 2025 core | Dec 11–29, 2025 |
| February 2026 Discover | Feb 5–27, 2026 |
| March 2026 spam | Mar 24–25, 2026 |
| March 2026 core | Mar 27–Apr 8, 2026 |
| May 2026 core | May 21–Jun 2, 2026 |
| June 2026 spam | Jun 24–26, 2026 |
| August 2026 spam | Aug 18–21, 2026 |
| September 2026 spam | Sep 24–~Oct 8, 2026 |

- **What core updates target:** Google doesn't itemize. It called May 2026 "a regular update designed to better surface relevant, satisfying content…from all types of sites" (TP). [TechWyse](https://www.techwyse.com/news/ai-search/google-may-2026-core-update) Docs added Dec 2025 say smaller core updates happen continuously (OD). Analysts (Aleyda Solis, Frase) say content that mainly rehashes other sources lost visibility (AN).
- **Spam policies (OD, 2026-08-28)** [policies](https://developers.google.com/search/docs/essentials/spam-policies):
  - **Scaled content abuse:** many pages generated "for the primary purpose of manipulating search rankings," however they were made.
  - **Site reputation abuse:** third-party content published to exploit the host site's ranking signals. Enforcement in the EEA was adjusted in Aug 2026.
  - **Expired domain abuse:** buying an expired domain and repurposing it mainly to manipulate rankings.
  - **Recent additions:** "attempting to manipulate generative AI responses" (2026-05-15) and back-button hijacking (2026-04-13).
- **AI-generated content (OD, 2026-10-01):** not penalized as such. Generating many pages "without adding value" can violate the scaled content abuse policy. The doc cites quality-rater guideline sections 4.6.5/4.6.6 and notes that raters "don't directly influence ranking." [Gen-AI content](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content)
- **"Best X tools" listicles that rank your own product first:** **Google has made no confirmation and has no policy on this.**
  - Lily Ray (Amsive) reported SaaS/B2B sites losing 30–50% of visibility starting around Jan 20–21, 2026, concentrated in blog folders full of self-ranked listicles (AN, "dozens of sites"). [SEL, "may be cracking down"](https://searchengineland.com/google-cracking-down-self-promotional-best-of-listicles-468227)
  - A separate analysis of 100 B2B queries (Apr–Jun 2026) found AI Overviews cited these listicles but recommended a competitor 69% of the time (AN). [SEL](https://searchengineland.com/google-ai-overviews-cite-self-serving-listicles-recommend-competitors-480573)
- **May 2024 Content Warehouse leak (stale, but not superseded):**
  - Google's only response was a spokesperson warning (May 29, 2024) against "out-of-context, outdated, or incomplete information." [Overview](https://en.wikipedia.org/wiki/2024_Google_Search_documentation_leak)
  - The leaked docs include siteAuthority, NavBoost (click signals) and hostAge, reportedly used to "sandbox fresh spam." Whether these are used in live ranking is unknown. [Ahrefs](https://ahrefs.com/blog/google-documents-leaked-seos-are-making-some-wild-assumptions)
  - NavBoost's use of click data was confirmed under oath by Google VP Pandu Nayak in the Oct 2023 US antitrust trial (NS via TP). [Hobo](https://www.hobo-web.co.uk/navboost-how-google-uses-large-scale-user-interaction-data-to-rank-websites/)

## 5. Core Web Vitals

- **"Good" thresholds:** LCP ≤2.5 s, INP <200 ms, CLS <0.1 (OD, 2025-12-10). [CWV](https://developers.google.com/search/docs/appearance/core-web-vitals)
- **How much they matter (OD, 2026-09-22)** [Page experience](https://developers.google.com/search/docs/appearance/page-experience):
  - Relevance wins "even if the page experience is sub-par."
  - A great page experience "can contribute to success" when relevance is comparable.
  - There's "no single signal," and chasing a perfect score "may not be the best use of your time."
  - Assessment is mostly per page, with "some site-wide assessments."
- **Sites with too little traffic for CrUX field data:**
  - CrUX comes from opted-in Chrome users (75th percentile over 28 days). Search Console omits URLs that lack enough data. [CWV report](https://support.google.com/webmasters/answer/9205520)
  - A 2021 FAQ (stale, secondhand) said such pages may be grouped with similar pages or the whole origin. [SEL 2021](https://searchengineland.com/google-expands-its-core-web-vitals-and-page-experience-update-faqs-347361)
  - **Gap:** no current Google doc says how ranking treats sites with no field data.

## 6. Technical SEO

- **How Googlebot renders JavaScript (OD, 2026-03-04)** [JS SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics):
  - Pages wait in the render queue "a few seconds, but it can take longer."
  - Pages that don't return 200 may not be rendered (added Dec 2025).
  - A `noindex` in the initial HTML may stop rendering, so JavaScript can't reliably remove it.
  - JavaScript shouldn't change the canonical. Server-side rendering or pre-rendering is recommended.
- **Vercel/MERJ study (VS — Vercel sells Next.js hosting; 2024-07-31; possibly stale):**
  - Sample: more than 100k Googlebot fetches and 37k matched renders, mostly on nextjs.org.
  - 100% of HTML pages were fully rendered.
  - Render delay: median 10 s, 75th percentile 26 s, 90th ~3 h, 95th ~6 h, 99th ~18 h. [Vercel](https://vercel.com/blog/how-google-handles-javascript-throughout-the-indexing-process)
- **Redirects (OD, 2026-04-14)** [Redirects](https://developers.google.com/search/docs/crawling-indexing/301-redirects):
  - 301 and 308 are treated as permanent.
  - A JavaScript `location` redirect is also classed as permanent, but "Only use JavaScript redirects if you can't do server-side or meta refresh redirects," because "rendering may fail."
  - **Inference for Ada:** a `location.replace` on the homepage is followed only after rendering. The homepage is also where Google reads the WebSite site-name markup. Use a server 308 instead, via Next.js `redirects()` or middleware.
- **robots.txt disallow vs noindex (OD, 2025-12-10):** if robots.txt blocks a page, the crawler "will never see the `noindex` rule." The page "can still appear in search results" if other pages link to it. [Block indexing](https://developers.google.com/search/docs/crawling-indexing/block-indexing)
- **Sitemaps (OD, 2026-07-08):**
  - `lastmod` is used only if "consistently and verifiably…accurate."
  - "Google ignores `<priority>` and `<changefreq>`."
  - Submitting a sitemap "is merely a hint." [Sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- **Canonicals (OD, 2026-07-10):** redirects and rel=canonical are "strong" signals; sitemap inclusion is "weak." For duplicate hostnames, pick one and redirect the rest. [Canonicals](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- **Vercel hostnames (vendor KB, 2026-08-03):**
  - Preview deployments automatically get `X-Robots-Tag: noindex`.
  - **The production `*.vercel.app` alias is not noindexed automatically.**
  - Vercel recommends a canonical pointing to the custom domain plus a noindex header or a redirect. [Vercel guide](https://vercel.com/guides/avoiding-duplicate-content-with-vercel-app-urls)

## 7. Bing in 2026

- **Webmaster Guidelines rewritten in Feb 2026 (TP: SER 2026-02-26, SEJ 2026-02-27).** The live guidelines page wouldn't render for me, so this comes from trade-press coverage. [SEJ](https://www.searchenginejournal.com/bing-adds-geo-to-official-guidelines-expands-ai-abuse-definitions/568442/); [SER](https://www.seroundtable.com/bing-webmaster-guidelines-updated-41002.html)
  - Scope now covers "Bing search experiences, Copilot, and grounding API results."
  - GEO is named for the first time.
  - **NOARCHIVE** blocks use of a page in Copilot answers and grounding. **NOCACHE** limits Copilot to the URL, title and snippet.
  - AI-content rule: "Large-scale content generated without oversight, quality control, or editorial review" may be excluded from the index.
  - New "Prompt Injection and AI Manipulation" section.
  - Advice: state facts directly, use consistent entity names, keep one topic per URL with key information near the top.
- **AI Performance report in Bing Webmaster Tools (OB, 2026-02-10):** public preview, posted by Krishna Madhavan, Fabrice Canel and others. [Bing blog](https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview)
  - Shows citations, cited pages and a sample of "grounding queries."
  - Covers Copilot, Bing's AI summaries and some partners.
  - No click data.
  - Recommends IndexNow and freshness.
- **IndexNow:** used by Bing, Yandex, Naver, Seznam and Yep. **Google doesn't participate**; it said it would test the protocol in 2021 and never adopted it (TP). [SEL 2021](https://searchengineland.com/google-is-testing-the-indexnow-protocol-for-sustainability-375932)
- **Bing and ChatGPT:** OpenAI's help docs say ChatGPT search uses "third-party search providers." Semrush reads the docs as naming Bing. OpenAI also runs its own crawler, OAI-SearchBot. So Bing matters, but it isn't the only source (TP). [Semrush](https://www.semrush.com/blog/chatgpt-definitely-uses-google)
- **Microsoft on schema:**
  - Fabrice Canel said at SMX Munich (March 2025) that schema helps Microsoft's LLMs understand content (NS via TP). [SEL](https://searchengineland.com/microsoft-bing-copilot-use-schema-for-its-llms-453455)
  - Madhavan (2025-10-08) says schema helps AI interpret pages and recommends headings, lists and Q&A blocks. He adds that nothing "guarantees selection." [Microsoft Ads blog](https://about.ads.microsoft.com/en/blog/post/october-2025/optimizing-your-content-for-inclusion-in-ai-search-answers)
  - I found no evidence that schema increases how often a page is cited.

## 8. Traffic impact of AI features

- **Pew Research (IS; 900 US adults, 68,879 searches, March 2025; published 2025-07-22):**
  - 18% of searches showed an AI summary.
  - Users clicked a traditional result on 8% of visits with a summary vs 15% without.
  - They clicked a link inside the summary on 1% of visits.
  - A summary appeared for 53% of queries of 10+ words and 60% of who/what/when/why queries. [Pew](https://www.pewresearch.org/short-reads/2025/07/22/google-users-are-less-likely-to-click-on-links-when-an-ai-summary-appears-in-the-results/)
- **Seer Interactive, v3 (agency; 2026-04-24; 53 brands, 5.47M queries, 2.43B impressions):** [Seer](https://seerinteractive.com/insights/aio-impact-on-google-ctr-2026-update)
  - Organic CTR in Feb 2026 was 2.36% with an AI Overview vs 3.82% without; the with-AIO figure had partially recovered from 1.31% in Dec 2025.
  - Being cited gives about +120% clicks vs not being cited, but still about −38% vs no AI Overview.
  - The authors make no causal claims.
- **Ahrefs (VS; 2026-02-04; 300k keywords, desktop only):** position-1 CTR is 58% below forecast when an AI Overview appears (0.016 actual vs 0.037 forecast); position 10 is −19%. The figure is a correlation measured against a modelled forecast. [Ahrefs](https://ahrefs.com/blog/ai-overviews-reduce-clicks-update/)
- **Amsive (agency; 2025-04-16; 700k keywords across 10 sites):** average CTR −15.49%; non-branded −19.98%; branded +18.68%. [Amsive](https://www.amsive.com/insights/research/google-ai-overviews-study/)
- **How often AI Overviews appear:**
  - Semrush (VS, 10M+ keywords): 6.49% (Jan 2025), 24.61% (Jul 2025), 15.69% (Nov 2025). [Semrush](https://www.semrush.com/blog/semrush-ai-overviews-study/)
  - BrightEdge (VS) reports about 48%. The large spread comes from different keyword sets.
- **AI Mode adoption — the numbers conflict:**
  - SparkToro/Similarweb clickstream: 68.01% of US Google searches ended without a click (Jan–Apr 2026), and only 0.34% of searches moved into AI Mode. [SparkToro](https://sparktoro.com/blog/in-2026-le)
  - Google claims more than 1B monthly AI Mode users.
- **Inference for Ada:** the long "how do I…" questions clerks ask are the queries most likely to trigger an AI Overview. Branded and tool-intent queries (e.g., "PDF/UA export") are less exposed. Being cited still roughly doubles CTR compared with not being cited.

## 9. New-site realities

- **Discovery time:** "It can take a few weeks for Google to notice a new site." Submitting is not required, and a lack of links is a common reason a site isn't found (OD, 2025-12-10). [Get on Google](https://developers.google.com/search/docs/fundamentals/get-on-google)
- **Seeing results of changes:** they can take "a few hours to several months." Most pages are found through links, and a sitemap is optional (OD, 2025-12-10). [Starter guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- **"Sandbox":**
  - Google denies one; Mueller said "There is no sandbox" in 2019 (stale, secondhand).
  - Mueller has described early ranking swings as Google lacking signals for new content, not a deliberate holding period (NS via TP). [Loganix](https://loganix.com/what-is-google-sandbox/)
  - The leaked hostAge attribute is ambiguous.
  - **Inference:** NavBoost needs accumulated clicks, so a brand-new site starts with little of that signal.
- **Links:**
  - Illyes: "We need very few links to rank pages" (April 2024, later regretted) and "links are not a top-3 factor" (2023). Both are stale.
  - Google's 2026 guide says inauthentic mentions aren't helpful.
- **Inference — minimum actions:**
  - Verify a Search Console domain property and submit the sitemap.
  - Use URL Inspection on the homepage and key pages.
  - Use server 308 redirects and canonicals for host variants.
  - Add WebSite and Organization markup.
  - Set up Bing Webmaster Tools with a sitemap and IndexNow.
  - Earn genuine links, for example from clerk associations and accessibility communities.

## 10. Myths

- **Starter guide (OD, 2025-12-10), "things you shouldn't focus on":**
  - Google "doesn't use the keywords meta tag."
  - Keyword stuffing is spam.
  - Keywords in the domain or URL have "hardly any effect."
  - "The length of the content alone doesn't matter."
  - There's no duplicate-content "penalty" ("inefficient," but no manual action).
  - Is E-E-A-T a ranking factor? "No, it's not."
- **Helpful-content doc (OD, 2026-10-05):** "While E-E-A-T itself isn't a specific ranking factor…" It also flags "changing the date of pages to make them seem fresh when the content has not substantially changed" as a warning sign. [Doc](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- **LSI keywords:** Mueller, 2019: "There's no such thing as LSI keywords" (stale, unrefuted). [SER](https://seroundtable.com/google-lsi-keywords-27970.html)
- **Moz DA / Ahrefs DR:** Mueller, 2019: "We don't use domain authority, that's a metric from an SEO company" (TP). [SEJ](https://www.searchenginejournal.com/domain-authority/)
- **Dwell time / CTR:** Illyes called them "made up crap" in 2019 (stale). This conflicts with NavBoost click data confirmed at trial, so treat the question as nuanced (see Q4).
- **Social signals:** Mueller has said "we don't use likes as a ranking factor" (old, secondhand). [Ahrefs](https://ahrefs.com/blog/social-signals/)

## Verdict table

| Practice or claim | Verdict | Evidence | Reason (source) |
|---|---|---|---|
| Special GEO/AEO work for Google AI features | nonsense | strong | "Still SEO" ([AI guide 2026](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)) |
| llms.txt for Google | nonsense | strong | Ignored, no ranking effect ([changelog 2026-06-15](https://developers.google.com/search/updates)) |
| llms.txt for other AI systems | unproven | weak | Mueller: "purely speculative" (TP, Jun 2026) |
| Chunking content into tiny pieces for LLMs | unproven | moderate | Google: "we don't want you to do that" (Sullivan, Jan 2026; AI guide) |
| Clear headings, direct facts, one topic per URL | works conditionally | moderate | Explicit Bing grounding advice (SEJ, Feb 2026); good practice for Google too |
| Schema to get into AI Overviews | nonsense | strong | "Structured data isn't required" (AI guide) |
| WebSite + Organization markup | works | strong | Site name and logo selection ([site names](https://developers.google.com/search/docs/appearance/site-names)) |
| SoftwareApplication markup with no reviews | works conditionally | strong | No rich result without a genuine rating or review ([doc](https://developers.google.com/search/docs/appearance/structured-data/software-app)) |
| Fabricated aggregateRating | harmful | strong | Manual action ([review guidelines](https://developers.google.com/search/docs/appearance/structured-data/review-snippet)) |
| FAQPage markup for rich results | nonsense | strong | Removed May 7, 2026 (changelog) |
| HowTo markup for rich results | nonsense | strong | Gone since 2023; absent from gallery |
| BreadcrumbList | works conditionally | strong | Shown on desktop only (changelog, Jan 2025) |
| Google-Extended to stay out of AI Overviews | nonsense | strong | Doesn't affect Search ([crawlers doc](https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers)) |
| "Search generative AI" Exclude setting | works conditionally | strong | Removes you from AI Overviews/AI Mode with no ranking effect; costs visibility ([help](https://support.google.com/webmasters/answer/16908024)) |
| nosnippet to keep content out of AI | works conditionally | strong | Also removes normal snippets ([robots meta](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)) |
| JavaScript homepage redirect instead of 301/308 | works conditionally | strong | Followed only if rendered; Google says use server-side ([redirects](https://developers.google.com/search/docs/crawling-indexing/301-redirects)) |
| robots.txt Disallow to remove pages from the index | harmful | strong | Google never sees the noindex ([doc](https://developers.google.com/search/docs/crawling-indexing/block-indexing)) |
| Sitemap priority/changefreq | nonsense | strong | "Google ignores" them ([sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)) |
| Accurate sitemap lastmod | works conditionally | strong | Used only if verifiably accurate (same doc) |
| Indexable production *.vercel.app alias | harmful | moderate | Duplicate host splits canonical signals ([Vercel guide](https://vercel.com/guides/avoiding-duplicate-content-with-vercel-app-urls)) |
| IndexNow | works conditionally | moderate | Bing and others only; not Google (TP) |
| Bing Webmaster Tools AI Performance report | works | strong | Copilot citation data, no clicks ([Bing blog](https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview)) |
| Meta keywords | nonsense | strong | Not used ([starter guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)) |
| Keyword density targets | nonsense | strong | Stuffing is spam (starter guide) |
| Minimum word counts | nonsense | strong | "Length…doesn't matter" (starter guide) |
| "LSI keywords" | nonsense | moderate | Mueller, 2019 |
| Moz DA / Ahrefs DR as Google metrics | nonsense | moderate | Third-party scores (Mueller); Google's internal siteAuthority is a different thing |
| "Duplicate content penalty" | nonsense | strong | No manual action for duplicates (starter guide) |
| "Google penalizes AI content" | nonsense | strong | Only scaled, low-value content is targeted ([gen-AI doc](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content)) |
| Bumping dates for freshness | harmful | moderate | Listed as a warning sign ([helpful content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)) |
| E-E-A-T as a direct ranking score | nonsense | strong | "No, it's not" (starter guide) |
| Bounce rate / dwell time as direct factors | unproven | moderate | Denied (2019), but click data is real (NavBoost, trial testimony) |
| Social signals | nonsense | moderate | Mueller (old statements) |
| Exact-match domains | nonsense | strong | "Hardly any effect" (starter guide) |
| Lighthouse score of 100 needed | nonsense | strong | Perfect score "may not be the best use of your time" ([page experience](https://developers.google.com/search/docs/appearance/page-experience)) |
| Good Core Web Vitals | works conditionally | strong | "Can contribute" when relevance is comparable (same doc) |
| Self-ranked "best X tools" listicles | harmful | weak | Agency data only; no Google confirmation (SEL, 2026) |
| Buying or seeding inauthentic mentions | harmful | moderate | Not helpful (AI guide); paid links are spam |
| AEO/GEO vendors claiming Google access | nonsense | strong | "No third-party tool has access" ([third-party doc](https://developers.google.com/search/docs/fundamentals/third-party-seo)) |
| New-site "sandbox" as a fixed penalty | unproven | weak | Google denies it; leaked hostAge is ambiguous |
| Search Console + sitemap + URL Inspection | works | strong | Faster discovery and diagnostics, not a ranking boost (Google docs) |
| Earning genuine links and mentions | works | moderate | Lack of links is a common reason sites aren't found ([Get on Google](https://developers.google.com/search/docs/fundamentals/get-on-google)) |

**Gaps:**
- No Google click data for AI features, and no split between AI Overviews and AI Mode.
- No current Google statement on Core Web Vitals for sites without field data.
- I couldn't fetch the live text of Bing's guidelines.
- How much ChatGPT relies on Bing is undocumented.
