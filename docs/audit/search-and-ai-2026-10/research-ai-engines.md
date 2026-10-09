# Research notes: how AI assistants and answer engines find and cite sites, and which GEO tactics have evidence

Written on 2026-10-09 by a research agent working from public sources, and kept as it was delivered (minus 1 line(s) about this session's tooling). Claims carry their own sources and dates. The decisions drawn from it are in [the decision record](../search-and-ai-2026-10.md).

---

# AI answer engines outside classic Google: how they find, choose and cite sites, which GEO tactics have evidence, and how to measure visibility (as of 2026-10-09)

Source labels: [OD] official doc · [SS] statement by a named staff member · [PR] peer-reviewed · [PP] preprint · [IS] independent study · [VS] vendor study whose authors sell AI-visibility or SEO tools · [AN] anecdote or single site · [SEC] secondary coverage (primary not fetched). "Stale" means published before 2025.

---

## 1. Where answers come from, and which bots matter

**Takeaway:** Every major engine now runs three separate kinds of agent:
- a search or index bot that obeys robots.txt
- a training bot that obeys robots.txt
- a fetcher triggered by a user's question, which mostly ignores robots.txt

Blocking a training bot does not remove a site from AI search, with one exception: **Google-Extended also controls whether Google may use your content to ground answers in the Gemini app.**

| Engine | Where web results come from | Search/index bot | Training control | User-triggered fetcher |
|---|---|---|---|---|
| ChatGPT | A mix: third-party search providers, partner content, and OpenAI's own index | OAI-SearchBot | GPTBot | ChatGPT-User |
| Perplexity | Its own index | PerplexityBot | Says it doesn't train foundation models | Perplexity-User |
| Copilot | Bing index | Bingbot, plus NOARCHIVE/NOCACHE meta tags | NOARCHIVE | — |
| Claude | Brave Search, plus its own crawl | Claude-SearchBot | ClaudeBot | Claude-User |
| Gemini app | Google Search index ("grounding") | Googlebot | Google-Extended (also controls grounding) | Google-Agent, Google-GeminiNotebook |
| Apple | Applebot index; Siri AI's web source not disclosed | Applebot | Applebot-Extended | — |
| Meta AI | Meta-WebIndexer | Meta-WebIndexer | Meta-ExternalAgent | Meta-ExternalFetcher |

**ChatGPT**
- [OD, undated] OpenAI's bots page:
  - Sites that opt out of OAI-SearchBot "will not be shown in ChatGPT search answers"; a plain navigational link can still appear.
  - GPTBot is the training opt-out.
  - For ChatGPT-User, "robots.txt rules may not apply", and it is "not used to determine whether content may appear in Search".
  - robots.txt changes take about 24 hours. IP lists are published at openai.com/searchbot.json, chatgpt-user.json and gptbot.json.
  - https://developers.openai.com/api/docs/bots
- [OD, read via search snippets because help.openai.com returned 403 to my fetcher] OpenAI's help pages:
  - ChatGPT search uses "third-party search providers" plus partner content. It rewrites prompts into narrower queries and runs follow-up searches, which is query fan-out. https://help.openai.com/en/articles/9237897-chatgpt-search
  - The Enterprise/Edu page names Bing. https://help.openai.com/en/articles/10093903-chatgpt-search-for-enterprise-and-edu
  - HIPAA workspaces use "OpenAI's own search index" and send nothing to Bing. https://help.openai.com/en/articles/20001069-hipaa-eligible-products-and-functionality
  - The Publishers FAQ says summaries require OAI-SearchBot access and that referral links carry `utm_source=chatgpt.com`. https://help.openai.com/en/articles/12627856-publishers-and-developers-faq
- [VS, Peec AI, byline 2026-09-04] Between May 21 and July 21, 2026, a field in ChatGPT's response stream labelled each result source as Labrador (OpenAI's index), Bright, Oxylabs or SERP. Bing showed up mainly in Deep Research, and a Search Console test suggests ChatGPT still queries Google. The post gives no sample sizes. https://peec.ai/blog/chatgpt-built-its-own-search-index
- Microsoft's Web IQ (launched June 2026) is a grounding API built on the Bing index.
  - Trade coverage says Microsoft claimed ChatGPT uses it. [SEC] https://www.techwyse.com/news/platform-updates/microsoft-web-iq-grounding-api-ai-agents
  - InfoWorld (2026-08-06) does not confirm that. https://www.infoworld.com/article/4205733/microsoft-web-iq-ground-your-ai-agents-with-up-to-date-web-data.html
  - This is unresolved.
- **What changed:** the 2024 assumption that ChatGPT search simply equals Bing is outdated. The 2026 evidence points to a hybrid that includes OpenAI's own index.

**Perplexity**
- [OD, undated] PerplexityBot is used to surface and link sites and is "not used to crawl content for AI foundation models". Perplexity-User "generally ignores robots.txt rules". https://docs.perplexity.ai/guides/bots
- [OD-company, 2025-09-25] Perplexity runs its own index, tracking 200 billion+ URLs. https://research.perplexity.ai/articles/architecting-and-evaluating-an-ai-first-search-api
- **The stealth-crawling dispute:**
  - [IS by Cloudflare, 2025-08-04] On new test domains that blocked all bots, Cloudflare reports traffic using a generic Chrome user agent, rotating IP addresses outside Perplexity's published lists, and ignoring robots.txt. Cloudflare removed Perplexity from its verified-bot list. In the same test, OpenAI's bot stopped at the disallow rule. Perplexity disputed the findings, saying user-triggered fetches were being confused with crawling. https://blog.cloudflare.com/perplexity-is-using-stealth-undeclared-crawlers-to-evade-website-no-crawl-directives/
  - Since then: in October 2025 Reddit sued Perplexity, SerpApi, Oxylabs and AWMProxy for scraping Google results. A test post visible only to Google surfaced in Perplexity within hours. https://www.cnbc.com/2025/10/23/reddit-user-data-battle-ai-industry-sues-perplexity-scraping-posts-openai-chatgpt-google-gemini-lawsuit.html
  - A ruling on 2026-07-31 let the DMCA §1201 claims proceed at the pleading stage. https://www.loeb.com/en/insights/publications/2026/08/reddit-v-serpapi-llc
  - I found no new Cloudflare enforcement in 2026.

**Copilot**
- [SEC summarising OD, 2026-02-27] Bing rewrote its Webmaster Guidelines to cover Copilot grounding. https://www.searchenginejournal.com/bing-adds-geo-to-official-guidelines-expands-ai-abuse-definitions/568442/
  - A page must be crawled and indexed by Bing to be eligible.
  - NOARCHIVE removes a page from Copilot answers and grounding.
  - NOCACHE limits Copilot to the URL, title and snippet.
  - These controls first appeared in 2023 and were restated in 2026, so they are current: https://blogs.bing.com/webmaster/september-2023/Announcing-new-options-for-webmasters-to-control-usage-of-their-content-in-Bing-Chat
- Inference: municipal staff often use Microsoft Copilot, so Bing indexing is a top priority for this audience.

**Claude**
- [OD, dated 2026-04-07] Anthropic's support article. https://support.claude.com/en/articles/8896518
  - ClaudeBot is for training.
  - Blocking Claude-User "may reduce your site's visibility for user-directed web search".
  - Claude-SearchBot indexes pages for search.
  - All three honor robots.txt and Crawl-delay. IP blocking may not reliably enforce an opt-out. IP list: claude.com/crawling/bots.json.
- Search backend is Brave:
  - [AN/IS, Simon Willison, 2025-03-21] https://simonwillison.net/2025/Mar/21/anthropic-used-brave
  - [VS, xponent21] still Brave as of a check on 2026-07-02. https://xponent21.com/insights/claude-web-search-brave-turbopuffer/
- [OD] Claude's API web fetch tool "does not support websites dynamically rendered with JavaScript". It caches results, and robots.txt can block a fetch. https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-fetch-tool

**Gemini app**
- [OD, updated 2026-07-14] Google-Extended controls both Gemini training and grounding in Gemini Apps. It "does not impact a site's inclusion in Google Search". https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers
- [OD, updated 2026-08-19] User-triggered fetchers, including Google-Agent and Google-GeminiNotebook, "generally ignore robots.txt rules". https://developers.google.com/search/docs/crawling-indexing/google-user-triggered-fetchers

**Apple**
- [OD, published 2026-09-04] Applebot powers Spotlight, Siri and Safari. https://support.apple.com/en-us/119829
  - Applebot-Extended "does not crawl"; it only controls whether crawled data trains Apple's models.
  - If robots.txt has no Applebot rules, Applebot follows the Googlebot rules.
  - Applebot may render JavaScript.
- [OD, 2026-09-14] Siri AI shipped with iOS 27. It "will leverage information from across the web", using Apple Foundation Models built "in collaboration with Google and its Gemini models". Apple says nothing about sources or citations. https://www.apple.com/newsroom/2026/09/siri-ai-a-profoundly-more-capable-and-personal-assistant-is-here/
- **Gap:** whether Siri AI's web answers come from Applebot's index or Google's.

**Meta**
- [OD, undated] Meta-WebIndexer handles Meta AI citations; Meta-ExternalAgent is for training; Meta-ExternalFetcher "may bypass robots.txt". https://developers.facebook.com/docs/sharing/webmasters/web-crawlers
- I did not re-verify CCBot this session.

**Infrastructure traps**
- Vercel Bot Protection is off by default. If you switch the "AI Bots" managed ruleset to Deny, it blocks search and user-triggered bots too. Its challenge mode requires JavaScript, which most AI bots can't run. [OD] https://vercel.com/docs/vercel-firewall/vercel-waf/managed-rulesets
- Cloudflare announced new defaults from 2026-09-15 that block AI training and agent use on ad-bearing pages for new and free zones. I could not confirm they took effect. [SEC] https://searchenginejournal.com/cloudflares-ai-crawler-rules-can-block-googlebot/581385

---

## 2. JavaScript

**Takeaway:** assume only Google (and so Gemini) and Applebot render JavaScript.

- [IS by a host plus an SEO consultancy: Vercel and MERJ, 2024-12-17; data from the Vercel network, including 569M GPTBot and 370M Claude fetches per month] "none of the major AI crawlers currently render JavaScript". https://vercel.com/blog/the-rise-of-the-ai-crawler
  - Covers GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot, Meta-ExternalAgent and CCBot.
  - These bots download JS files (11.5% of ChatGPT's requests, 23.8% of Claude's) but don't execute them.
  - 34.8% of ChatGPT's fetches hit 404s.
  - **Stale, but no study of comparable scale has replaced it.**
- [AN, late September 2026] One developer's IP-verified logs suggest OAI-SearchBot and GPTBot started executing JavaScript on 2026-09-25. There is no OpenAI confirmation and no replication. https://www.indiehackers.com/post/traffic-from-chatgpt-jumped-is-it-because-its-crawlers-now-run-javascript-5dea2e48d0
- [IS, small] Two smaller tests:
  - A Search Engine Land experiment found GPTBot reached none of the pages linked only through JavaScript. https://searchengineland.com/javascript-links-pages-invisible-ai-search-485228
  - A RESONEO test (January 2026) found Grok and DeepSeek ran scripts; the OpenAI result wasn't visible to me. https://think.resoneo.com/sentinel/geo-llm-crawler-report.html
- [OD, Next.js docs v16.4, updated 2026-07-28] `redirect()` in a streaming context "will insert a meta tag to emit the redirect on the client side"; otherwise it sends a 307. For redirects before rendering, the docs point to `next.config` redirects or Proxy (called middleware in Next.js 15). https://nextjs.org/docs/app/api-reference/functions/redirect
- **Implications (inference) for a non-rendering bot:**
  - Content rendered only on the client is an empty page.
  - JavaScript redirects (`router.push`, `useEffect`, `window.location`) are never followed.
  - It's unknown whether these bots follow meta refresh.
  - So: statically generate or server-render the marketing pages, use real 308 redirects, use `<a href>` links, and check with `curl -A "OAI-SearchBot"` plus view-source.

---

## 3. What drives citations and mentions

**Takeaway:** The best-supported levers are:
1. Being retrievable: indexed in each engine's backend for the narrower sub-queries it fans out to.
2. Being mentioned on third-party pages those engines already retrieve.

Content-level GEO tweaks have weak evidence in real products.

**Organic rankings**
- [VS, Ahrefs, 2025-08-11, 15k prompts] Only about 12% of AI-cited URLs rank in Google's top 10 for the original prompt: ChatGPT about 8%, Perplexity 28.6%. Ahrefs attributes the gap to query fan-out. https://ahrefs.com/blog/ai-search-overlap/
- [PP, Tannenbaum, 2026-09-19; 34,960 observations on vendor (Aiso) data; observational] https://arxiv.org/abs/2609.23162
  - When neither the brand nor its own domain appeared in the retrieved sources, the brand was mentioned only 2.8% of the time (GPT) and 3.8% (Gemini).
  - When the brand's own domain was cited, mention rates were 49% and 58%.
  - When the engine also ran a search containing the brand name, they were 91% and 100%.
  - Whether a brand was mentioned in the previous run predicted the next run well on its own (AUC 0.94 for GPT, 0.92 for Gemini).

**Brand mentions versus backlinks**
- [VS, Ahrefs, 2025-05-26, 75k brands, AI Overviews only] Branded web mentions had the strongest correlation (ρ=0.664), ahead of branded anchors (0.527). This is correlational, and big brands may drive both. https://ahrefs.com/blog/ai-overview-brand-correlation/
- [VS, SE Ranking, late 2025, about 129k domains] The number of referring domains was the strongest predictor of ChatGPT citations. https://www.searchenginejournal.com/new-data-top-factors-influencing-chatgpt-citations/561954/
- [PP, Chen et al., 2025-09-10] AI search shows a "systematic and overwhelming bias towards Earned media" over brand-owned and social content, plus a big-brand bias. https://arxiv.org/abs/2509.08919

**"Best X" lists and Reddit**
- [VS, Ahrefs, 750 queries] Blog listicles made up about 44% of ChatGPT's citations for "best X" queries. https://ahrefs.com/blog/best-lists-research/
- [VS, Peec, 232k citations] Self-promotional listicles were about 11% of citations overall and about 4% in ChatGPT. https://peec.ai/blog/self-promotional-listicles-analysis-from-232k-citations
- [IS, Lily Ray, 100 queries, April–June 2026] Google's AI Overviews cited a brand's own listicle but did not recommend that brand in about 69% of cases. https://searchengineland.com/google-ai-overviews-cite-self-serving-listicles-recommend-competitors-480573
- [VS via SEC] Semrush counts Reddit as the most-cited domain, in about 1 of every 9 answers. https://www.emarketer.com/content/reddit-geo-crackdown-could-raise-stakes-ai-visibility-strategies
- Platform shares (Reddit, Wikipedia, YouTube) vary widely between vendors because they use different denominators.

**Freshness**
- [VS, Ahrefs, 2025-07-28, about 17M citations] AI-cited pages were 25.7% fresher than organic results. Ahrefs warns that trivial updates don't help. https://ahrefs.com/blog/do-ai-assistants-prefer-to-cite-fresh-content/

**Content tactics (statistics, quotations, citations)**
- [PR, Aggarwal et al., KDD 2024, stale] The original GEO paper reported visibility gains "up to 40%" in a simulated engine, with effects varying by domain. https://arxiv.org/abs/2311.09735
- [PR, NeurIPS Datasets & Benchmarks 2025] C-SEO Bench found most such methods "largely ineffective" and often harmful; traditional SEO did better, and gains shrink as more sites adopt them. https://arxiv.org/abs/2506.11097 **This partly supersedes the 2024 paper.**
- [PP survey of 45 studies, 2026-07-15] No reviewed tactic shows a stable effect across platforms on organic discoverability, and citation-oriented rewrites can hurt retrieval. https://arxiv.org/abs/2607.14035
- **Gap:** I found no causal study of original research or data as a citation driver.

---

## 4. llms.txt

- The spec is Jeremy Howard's, from 2024-09-03 (stale but still the current spec). https://llmstxt.org/
- **Google** [OD, updated 2026-07-10]: "You don't need to create new machine readable files, AI text files, markup, or Markdown"; "Google Search itself doesn't use them." https://developers.google.com/search/docs/fundamentals/ai-optimization-guide
  - [SS, John Mueller] llms.txt can't help an LLM choose between sites. https://www.searchenginejournal.com/googles-mueller-says-llms-txt-cant-help-llms-differentiate-sites/579304/
  - Mixed messaging: Chrome Lighthouse added an experimental llms.txt check as part of agent-readiness tests. https://searchengineland.com/google-llms-txt-chrome-lighthouse-478246
- **OpenAI, Anthropic, Perplexity, Microsoft:** I found no official statement that any of them uses llms.txt for retrieval or ranking. They do publish llms.txt files for their own developer docs.
- **Server logs**
  - [VS, Ahrefs, 2026-06-15; 137,210 domains, May 2026] https://ahrefs.com/blog/llmstxt-study/
    - 28% of domains publish the file; 97% of those files got zero requests.
    - Named AI bots made 19.5% of requests: GPTBot about 4.5%, Claude-Code second among AI bots, OAI-SearchBot 0.74%.
    - SEO audit tools made 21.7%.
    - Ahrefs concludes coding agents are the realistic audience.
  - [VS, SE Ranking, about 300k domains] No link between having the file and being cited. https://www.searchenginejournal.com/llms-txt-shows-no-clear-effect-on-ai-citations-based-on-300k-domains/561542/
  - [AN, Prosopo] IP-verified AI crawlers fetched robots.txt 120 times and llms.txt zero times. https://prosopo.io/blog/llms-txt/
- **Verdict for a small SaaS marketing site:** no measurable effect on AI search. It's harmless if accurate, and only worth doing if Ada Editor publishes developer docs or an API.

---

## 5. Structured data

- [SS, Fabrice Canel, Bing, March 2025] Schema helps Microsoft's LLMs understand content. https://searchengineland.com/microsoft-bing-copilot-use-schema-for-its-llms-453455
- [OD, Google, 2026] "Structured data isn't required for generative AI search."
- [VS, Ahrefs, 2026-05-11] https://ahrefs.com/blog/schema-ai-citations/
  - Method: 1,885 pages that added JSON-LD, compared against about 4,000 matched control pages over 30 days.
  - Results: ChatGPT +2.2% and AI Mode +2.4% (both not significant); AI Overviews −4.6% (significant).
  - Only pages already cited were in the sample. Cited work from searchVIU found AI fetchers ignoring JSON-LD.
- **Verdict:** keep Organization and SoftwareApplication markup for rich results and entity understanding, but don't treat it as an AI-citation lever. Make the key facts visible text on the page.

---

## 6. Formatting for AI

- [OD, Google] "no requirement to break your content into tiny pieces"; there's no need to write in a special way for AI. Making a page for each query variation to manipulate AI answers counts as scaled content abuse.
- [SS, Danny Sullivan, January 2026] On bite-sized chunking: "we don't want you to do that." https://tagteam.harvard.edu/hub_feeds/3382/feed_items/17175713/content
- [OD via SEC, Bing, February 2026] Bing's advice for grounding: state facts directly, keep entity names consistent, one topic per URL, essential information near the top.
- [IS, Kevin Indig, February 2026, 18,012 verified citations] 44% of ChatGPT's citations came from the first 30% of the page. https://searchengineland.com/chatgpt-citations-content-study-469483
- [VS, SE Ranking] Question-style headings averaged 3.4 citations versus 4.3 for plain headings. Raw averages slightly favored pages without FAQ sections (3.8 with versus 4.1 without).
- [Practitioner counterpoint, iPullRank] Splitting a two-topic paragraph gave about a 19% relevance gain, but measured in a scoring model, not a live engine. https://ipullrank.com/misinformation-about-chunking

---

## 7. Agent-facing standards

**Serving Markdown to agents**
- [OD, Cloudflare, 2026-02-12] Cloudflare's edge converts HTML to Markdown when a request's `Accept` header includes `text/markdown`. https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents
- [OD, Vercel] Vercel's guides cover content negotiation with `Vary: Accept` for docs: https://vercel.com/kb/guide/how-to-serve-documentation-for-agents
- Claude Code's fetcher reportedly asks for Markdown first [AN]: https://tashian.com/tech-notes/serving-markdown-to-ai-agents/
- I found no evidence that any search or index bot requests Markdown.
- Risk: if the Markdown version diverges from the HTML, it looks like cloaking.

**WebMCP**
- [OD, Chromium, 2026-05-18] A Chrome origin trial for versions 149–156 was approved; the spec is still a W3C community-group draft. https://groups.google.com/a/chromium.org/g/blink-dev/c/gmYffo5WOE8/m/OJxuQRP3AAAJ
- Real but experimental. It could matter later for agents operating the editor itself; it does nothing for citations.

**NLWeb**
- [OD, Microsoft, May 2025] Open project offering an `/ask` endpoint. https://news.microsoft.com/source/features/company-news/introducing-nlweb-bringing-conversational-interfaces-directly-to-the-web/
- [SEC] Adoption is still early pilots. https://agentic-readiness.lumar.io/docs/capabilities/nl-web
- No answer engine is documented as querying it.

**MCP servers and app directories**
- [OD] OpenAI accepts app submissions (since December 2025): https://developers.openai.com/apps-sdk/deploy/submission
- [OD/SEC] Claude's Connectors Directory portal opened 2026-09-25: https://claude.com/docs/connectors/building/submission
- This is a distribution channel, not a ranking signal.

**IETF AI-preferences (AIPREF)**
- [OD] The vocabulary is at draft -08 (September 2026) and the robots.txt/header attachment at draft -05 (August 2026). Neither is an RFC, and I found no implementations.
- https://datatracker.ietf.org/doc/html/draft-ietf-aipref-vocab-08
- https://datatracker.ietf.org/doc/draft-ietf-aipref-attach/

**Cloudflare Content Signals**
- [OD, Cloudflare, September 2025] https://blog.cloudflare.com/content-signals-policy/
- [SS, Mueller, 2026-07-06] No effect on any crawler he knows of. https://www.seroundtable.com/google-cloudflare-content-signals-41631.html

**ai.txt and TDMRep**
- ai.txt exists only as an individual Internet-Draft (June 2026), with no engine adoption found. https://www.ietf.org/ietf-ftp/internet-drafts/draft-car-ai-txt-wellknown-00.html
- TDMRep is a rights-reservation signal, not a visibility tool (not researched in depth).

**Pay-per-crawl**
- Pay-per-crawl started as a private beta in July 2025. Cloudflare's follow-on Monetization Gateway entered beta in July 2026. https://blog.cloudflare.com/monetization-gateway/
- For a SaaS that wants to be visible, charging or blocking bots works against you.

---

## 8. Manipulative tactics and documented consequences

- **Hidden text / prompt injection**
  - [IS, The Guardian, 2024-12-24, stale] Hidden text flipped ChatGPT search summaries. https://www.theguardian.com/technology/2024/dec/24/chatgpt-search-tool-vulnerable-to-manipulation-and-deception-tests-show
  - [February 2026] Bing's guidelines now include a "Prompt Injection and AI Manipulation" abuse section and "Artificially Engineered Language".
  - [OD, Microsoft Security, February 2026] Microsoft's "AI Recommendation Poisoning" research covers 31 companies that hid "remember us" prompts in "Summarize with AI" links, and treats it as an attack. https://the-decoder.com/some-summarize-with-ai-buttons-are-secretly-injecting-ads-into-your-chatbots-memory/
- **AI-only cloaking:** [security vendor, SPLX, October 2025] Cloaking based on user agent fooled ChatGPT Atlas and Perplexity, so it is now a recognized attack class. https://splx.ai/blog/ai-targeted-cloaking-openai-atlas
- **Mass-produced AI content**
  - Google: making a page per query variation is scaled content abuse.
  - Bing: targets content "generated without oversight, quality control, or editorial review".
- **Reddit seeding** [2026-07-06] Reddit now uses LLMs to detect "fake behavior and artificial hype". https://thenextweb.com/news/reddit-ai-marketing-slop-geo-crackdown
  - About 25k spammy posts and comments flagged daily.
  - Accounts tied to ReplyGuy were removed.
  - Whole domains can be blacklisted.
- **Fake reviews:** the FTC's final rule banning fake reviews and testimonials (2024-08-14) carries civil penalties. I did not re-verify it this session. https://www.ftc.gov/news-events/news/press-releases/2024/08/federal-trade-commission-announces-final-rule-banning-fake-reviews-testimonials
- **Gap:** I found no published AI-engine penalty against a named site. The documented consequences are platform bans and spam classification.

---

## 9. Measuring AI visibility

**Identifying AI referrals**
- ChatGPT adds `utm_source=chatgpt.com` to referral links [OD].
- [OD] GA4's default channel grouping now has an "AI Assistant" channel, launched around 2026-05-13 per SEJ. https://support.google.com/analytics/answer/9756891
  - Examples listed: ChatGPT, Gemini, DeepSeek, Copilot, Grok.
  - Claude and Perplexity are not listed, so add a custom regex for `chatgpt.com`, `perplexity.ai`, `claude.ai`, `copilot.microsoft.com` and `gemini.google.com`.
  - Clicks from mobile apps often lose the referrer and show up as Direct.
- [OD, 2026-02-10] Bing Webmaster Tools "AI Performance" shows Copilot citations and the grounding queries behind them, but no clicks. It is the only free first-party citation data I found outside Google. https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview

**Benchmarks**
- [VS, Conductor; 13,770 domains, 3.3B sessions; data from mid-2025] AI referrals were 1.08% of traffic, with ChatGPT supplying 87.4% of them. https://www.conductor.com/academy/aeo-geo-benchmarks-report/
- **What changed in May 2026:** ChatGPT started linking brand names inline on 2026-05-07.
  - [VS, Similarweb] ChatGPT referrals rose 157.7% week over week, and the share landing on homepages went to about 60%. https://aisearch.similarweb.com/blog/chatgpt-referral-traffic-triples/
  - [VS, SE Ranking, 101,574 sites] ChatGPT's share of referral traffic went from 0.23% to 0.32% in May 2026. https://seranking.com/blog/chatgpt-referral-traffic-may-2026/

**Conversion claims**
- [PR, Kaiser & Schulze, Marketing Science; 973 e-commerce sites, data to July 2025] ChatGPT referrals converted about 13% below organic search. The figure is model-based and lost significance in some specifications. https://pubsonline.informs.org/doi/10.1287/mksc.2025.0489
- Contrary data:
  - [platform data, Shopify, May 2026] AI sessions converted about 50% above organic on product pages. https://searchengineland.com/shopify-ai-referrals-up-organic-search-leads-traffic-484962
  - [agency study, 94 stores] ChatGPT 1.81% versus 1.39% for non-branded organic. https://visibilitylabs.com/blog/chatgpt-vs-organic-search-conversion-rates/
- The widely quoted "4.4x" (Semrush, a modelled value) and "23x" (Ahrefs, its own site) figures are not controlled comparisons; treat them as anecdotes.
- **Conclusion:** unresolved; selection effects dominate.

**Crawler logs**
- Verify user agent plus IP against the published lists (OpenAI's JSON files, Anthropic's bots.json, Perplexity's docs).
- Inference from the docs:
  - Hits from search bots mean you are eligible to be found.
  - Hits from ChatGPT-User, Claude-User or Perplexity-User mean a page was pulled into a live answer.

**How reliable is prompt tracking?**
- The SparkToro/Gumshoe study you recalled is real. [Gumshoe sells AI tracking; not peer-reviewed; 2026-01-28] https://sparktoro.com/blog/new-research-ais-are-highly-inconsistent-when-recommending-brands-or-products-marketers-should-take-care-when-tracking-ai-visibility/
  - Method: about 600 volunteers ran 12 prompts 2,961 times in November–December 2025.
  - Two runs gave the same brand list less than 1 time in 100, and the same order about 1 time in 1,000.
  - Human prompts written for the same intent had a mean semantic similarity of just 0.081.
  - The authors call visibility % across many runs "a reasonable metric", call tools that report rank position "full of baloney", and recommend 60–100 runs per prompt.
- API results differ from what users see in the app:
  - [VS, Brandlight, June 2026] ChatGPT API and UI agreed on which brands to name only 11% of the time. https://research.brandlight.ai/ui-vs-api.html
  - [PP, September 2026] Only 12% domain overlap between ChatGPT's app and its API. https://arxiv.org/abs/2609.18729
  - [PP, Schulte et al., 2026-04-08] Model visibility as a distribution, not a single measurement. https://arxiv.org/abs/2604.07585
- All tracking tools (Profound, Peec AI, Otterly, Semrush AI Toolkit, Ahrefs Brand Radar, Gumshoe) are vendors. Ask each one: UI or API? Logged in? Web search on? How many runs per number?

**Sampling for a homemade prompt panel (my calculation)**
- 95% margin of error ≈ 1.96·√(p(1−p)/n):
  - p=0.5 needs n≈96 runs for ±10 points, n≈385 for ±5.
  - p=0.05 with n=100 gives ±4.3 points.
- Detecting a rise in mention rate from 5% to 15% (α=0.05, 80% power) needs about 140 observations per period.
- Runs of the same prompt are correlated, so favor many prompts over many repeats.
- Suggested design:
  - About 40 real clerk-phrased prompts × 3–4 runs per engine per month.
  - Logged-in UI with web search on, memory off, US location.
  - Record the model and date for every run.
  - Track three things: mention rate, own-domain citation rate, and which third-party domains get cited. Those domains are your earned-media targets.
- Expect a near-zero baseline for a site that went public in late September 2026.

---

## Verdict table

| Tactic or claim | Verdict | Evidence | Reason (source) |
|---|---|---|---|
| Allow OAI-SearchBot, Claude-SearchBot/User, PerplexityBot, Bingbot, Applebot (robots.txt and firewall) | Works (required) | Strong | Opting out removes you from answers (OpenAI, Anthropic, Perplexity bot docs) |
| Blocking training bots costs AI-search visibility | Nonsense, except Google-Extended | Strong | Separate controls in the docs; Google-Extended also controls Gemini-app grounding (Google crawler doc) |
| Bing indexing / IndexNow for Copilot (and possibly ChatGPT) | Works | Strong for Copilot, moderate for ChatGPT | Bing Guidelines Feb 2026; OpenAI names Bing for Enterprise/Edu |
| Server-render main content; real 3xx redirects, not JS redirects | Works | Moderate to strong | Vercel/MERJ 2024; Claude web fetch docs; Next.js redirect docs |
| llms.txt for AI-search visibility | Nonsense / unproven | Moderate | 97% of files never requested (Ahrefs 2026); Google doesn't use it |
| llms.txt for developer docs read by coding agents | Works conditionally | Weak | Claude-Code is among the few real fetchers (Ahrefs 2026) |
| JSON-LD to win AI citations | Unproven (no lift) | Moderate | Matched-control test found no ChatGPT effect (Ahrefs 2026); Google says not required |
| Genuine third-party mentions and reviews (earned media) | Works conditionally | Moderate (correlational) | Chen et al. 2025; Ahrefs brand study; Tannenbaum 2026 |
| Ranking for fan-out sub-queries, not just the literal prompt | Works conditionally | Moderate | Only 12% top-10 overlap explained by fan-out (Ahrefs 2025); OpenAI help on query rewriting |
| Adding statistics, quotes and citations (2024 GEO paper) | Unproven in live engines | Moderate | C-SEO Bench 2025; 2026 survey |
| Key facts first, one topic per URL, clear headings | Works conditionally | Weak to moderate | Bing guidance; Indig's 44%-in-first-30% finding |
| FAQ blocks / question-style headings as AI levers | Unproven | Weak | No citation advantage (SE Ranking) |
| Bite-sized "chunking" or AI-only page versions | Nonsense (for Google); unproven elsewhere | Moderate | Google guide; Sullivan Jan 2026 |
| Real content updates (freshness) | Works conditionally | Weak to moderate | AI-cited pages 25.7% fresher (Ahrefs 2025); date bumps alone don't help |
| Self-promotional "best X" listicles | Works conditionally, risky | Weak, conflicting | Ahrefs pro; AI Overviews cite but don't recommend you ~69% of the time (Ray) |
| Reddit seeding / buying mentions | Harmful | Moderate | Reddit LLM detection, account and domain bans (2026) |
| Hidden prompt injection; "Summarize with AI" memory prompts | Harmful | Strong | Bing abuse policy; Microsoft classes it as an attack |
| Pages or content shown only to AI bots (cloaking) | Harmful | Moderate | SPLX attack class; equivalence risk with Markdown variants |
| Mass AI pages per query variant | Harmful | Strong | Google scaled content abuse; Bing guidelines |
| Fake reviews (G2, Capterra) | Harmful / illegal | Strong | FTC rule 2024 |
| Markdown via content negotiation | Unproven for answer engines | Weak | No index bot documented requesting it (Cloudflare/Vercel docs) |
| WebMCP / NLWeb | Too early / hype for discovery | Weak | Origin trial; NLWeb still in pilots |
| ChatGPT app / Claude connector listing | Works conditionally (distribution channel) | Moderate | Official directories exist; not a ranking signal |
| Content Signals / AIPREF / ai.txt for visibility | Nonsense (preference signals only) | Moderate | Drafts not implemented; Mueller: no effect |
| Pay-per-crawl for a visibility-seeking SaaS | Harmful | Moderate (inference) | It blocks or charges the bots you need |
| Tracking "rank position" in AI answers | Nonsense | Moderate | SparkToro 2026 |
| Mention/citation rate over many runs, UI-based | Works | Moderate | SparkToro; Schulte et al. 2026 |
| "AI traffic converts X× better" | Unproven / context-dependent | Moderate (conflicting) | Kaiser & Schulze (−13%) versus Shopify (+50%) |
