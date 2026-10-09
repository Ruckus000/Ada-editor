# Search and AI visibility, October 2026

**The question:** how should Ada Editor get found, both in classic search and in the answers AI assistants give? The owner asked for the "SEO versus AI optimization" field to be sorted into what works today and what's nonsense. Then come metrics to steer by, an audit of the site, and a plan.

## The one-line verdict

**Being found by AI assistants is mostly being found at all.** That takes:
- a home page a crawler can read without JavaScript;
- one address for every page;
- the two search consoles;
- original research worth citing;
- mentions on the sites clerks already trust.

Most of the "AI optimization" sold in 2026 is folklore. The real differences are mechanical:
- AI crawlers don't run JavaScript.
- Each assistant reads a different index.
- Mentions elsewhere count for more than anything on the page.

## How we got here

All on October 9, 2026.

1. **Research.** Three research threads, each held to primary sources and dated claims. Their notes are kept as delivered:
   - [Google and Bing](search-and-ai-2026-10/research-google-bing.md): ranking, spam policy, structured data, and Google's AI Overviews and AI Mode;
   - [the AI engines](search-and-ai-2026-10/research-ai-engines.md): ChatGPT, Perplexity, Copilot, Claude, Gemini and Apple, what drives their citations, and how to measure them;
   - [the niche](search-and-ai-2026-10/research-niche.md): the Title II rule, what clerks search for, who ranks, where to be listed, and the name.
2. **Checked against the originals.** I checked the four claims everything else rests on against the original pages:
   - Google's [AI optimization guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide) (updated July 10, 2026);
   - Search Console's [generative AI report](https://support.google.com/webmasters/answer/16984139) (all sites since August 31, 2026);
   - Bing's [AI Performance report](https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview) (February 10, 2026);
   - the [Title II dates on ada.gov](https://www.ada.gov/resources/2024-03-08-web-rule/).
3. **The live site, as a crawler sees it.** I fetched it with curl and read the code and the Vercel settings: [the snapshot](search-and-ai-2026-10/live-audit-2026-10-09.md).
4. **A review before building.** The route change was reviewed against the code before it was built: [the review](search-and-ai-2026-10/route-change-review.md). It caught eight problems in the first design; the two that changed decisions are noted below.
5. **The owner's choices.** The owner chose:
   - cookieless counting, with a rewritten privacy page;
   - publishing the agenda-platform research with the vendors named;
   - YourLaunchPad LLC as the named maker;
   - "free during early access" as the price.

## What works, and what doesn't

Google settled the "GEO versus SEO" argument in writing this year. Its guide says optimizing for its AI features "is optimizing for the search experience, and thus still SEO." It also says:
- Search ignores llms.txt, "AI text files" and Markdown copies of pages.
- There's "no requirement to break your content into tiny pieces".
- Structured data "isn't required".
- Pages made to chase the follow-up queries an AI search runs behind the scenes ("fan-out" queries) break the scaled-content spam policy.
- "No third-party tool has access" to its ranking or AI systems.

Bing rewrote its guidelines in February 2026 to cover Copilot. It asks for facts stated plainly, the same name for the same thing everywhere, and one topic per page, and it bans prompt injection.

Outside Google, three things really are different. They are what the plan acts on:

1. **Most AI crawlers don't run JavaScript.** Only Google's renderer (and so Gemini) and Applebot do. GPTBot, OAI-SearchBot, ClaudeBot and PerplexityBot read the HTML the server sends. Content that only exists after a script runs, or behind a script redirect, isn't there for them.
2. **Each assistant reads a different index:**
   - **Copilot:** Bing's.
   - **ChatGPT:** its own, plus third-party providers including Bing.
   - **Perplexity:** its own.
   - **Claude:** Brave Search's plus its own crawl.
   - **Gemini:** Google's.

   Copilot is plausibly what municipal staff have at work.
3. **Citations follow retrievability and mentions, not on-page tricks.**
   - Only about 12% of the pages ChatGPT and Perplexity cite rank in Google's top ten for the question itself, because the engines search for narrower sub-questions behind the scenes.
   - A brand is mentioned 3 to 4% of the time when nothing about it is retrieved, and about half the time when its own site is cited.
   - The 2024 tactics of adding statistics and quotations were largely ineffective in a 2025 benchmark, and a 2026 survey of 45 studies found no stable effect.

| Verdict | Practices |
|---|---|
| **Works** | Server-rendered pages, one address per page, server redirects. Search Console and Bing Webmaster Tools, with a sitemap. Original, dated, plainly stated content with the key facts early (44% of ChatGPT's citations come from the first 30% of a page). WebSite and Organization structured data. Mentions and links from places the audience trusts. Letting the AI search crawlers in. |
| **Depends** | SoftwareApplication markup: it describes the product, but Google shows no rich result without real ratings. IndexNow: Bing and Copilot only, but cheap. Core Web Vitals: a tiebreaker when relevance is equal. Real content updates: cited pages run fresher, but changing a date doesn't count. |
| **Nonsense** | **llms.txt**: 97% of 137,000 published files were never requested, there's no citation effect across 300,000 domains, and Google ignores it; it helps only developer docs read by coding agents. **Also nonsense:** chunking pages for language models; a separate "GEO" rewrite; structured data as an AI-citation lever (a matched test found no lift); FAQ and HowTo markup for rich results (Google removed FAQ results on May 7, 2026); Google-Extended as a switch for AI Overviews; Markdown copies, NLWeb, AIPREF, Content Signals and ai.txt as visibility tools; tracking a "rank" in AI answers; keyword density, word counts, meta keywords, "LSI keywords", DA/DR, sitemap priority, E-E-A-T as a score, a Lighthouse 100; vendors claiming access to Google's AI systems. |
| **Harmful** | Fake ratings or reviews. Bumping dates. "Best X tools" lists that rank your own product first (visibility losses reported since January 2026, and AI Overviews cite them while recommending a competitor about 69% of the time). Mass pages per query. Pages shown only to bots. Hidden prompt injection (a Google spam policy since May 15, 2026). Seeding Reddit. Blocking or charging crawlers. Using robots.txt to de-index. |

## What the audit found

**Critical: the home page was empty to anything that doesn't run JavaScript.**
- `/` was the desk's loading screen: two `<title>`s, 24 words, no links.
- Signed-out visitors reached the landing page only through a script that sent them to `/welcome`.
- There was no robots.txt, no sitemap, and no Search Console or Bing setup.

**High:**
- The production `.vercel.app` address served the whole site a second time.
- No page had a canonical address.
- Six of seven public pages shared one description.
- There was no structured data, while the name collides with Ada-language editors, a product actually called "Ada Editor", and the dental and diabetes associations.
- The GitHub description said "Ada compliant".
- Only four pages had content, and the original research lived only on GitHub.

**Medium:**
- The app's private screens could be indexed.
- A closed Display dialog came before every public page's h1.
- Signed-out visitors on a broken link were sent to sign in instead of seeing "Page not found".
- Public pages loaded the Supabase client and ProseMirror (about 280 KB): something to measure, not yet a problem.

The details are in [the snapshot](search-and-ai-2026-10/live-audit-2026-10-09.md).

## Metrics

Targets are a first pass for a new domain. I'll recalibrate at day 60, once Search Console has data. Days count from Search Console verification.

| # | Metric | Where it comes from | Target |
|---|---|---|---|
| F1 | Public pages passing the search gate | `npm run seo`, every PR | all of them |
| F2 | Sitemap pages indexed | Search Console, Bing Webmaster Tools | all, by day 30 |
| V1 | Google impressions outside the brand, by topic (Title II, agendas and minutes, PDF and Word, agenda platforms) | Search Console | in 3 topics by day 90 |
| V2 | "ada editor" with an accessibility word leads to adaedit.com | Search Console, by hand | first place by day 60 |
| V3 | AI impressions and citations, from the engines themselves | Search Console's generative AI report, Bing's AI Performance | the first, by day 90 |
| V4 | Is Ada Editor ever mentioned in AI answers? Which sites get cited? | [the presence check](search-and-ai-2026-10/presence-check.md), monthly | a first mention by day 90 |
| V5 | AI search crawlers fetching the site | Vercel's traffic views | weekly by day 30 |
| O1 | Visits from search and from AI assistants, by referring site (a floor: app clicks often carry no referrer) | Vercel Web Analytics | rising after day 60 |
| O2 | Sign-ups, and those in visits from search or AI | Supabase (the count), Vercel events (the source) | a first from search or AI by day 90 |
| O3 | New accounts that export a document | Vercel events, Supabase | tracked |
| A1 | Relevant sites linking to adaedit.com | Search Console, Bing Webmaster Tools | 5 by day 90 |

**Not measured:** keyword density, DA/DR, a Lighthouse score beyond the gate, vendor "AI visibility scores", and AI "rankings".

## Decisions

### 1. The landing page is the home page; the desk moves to `/desk`

The landing page is served at `/`, and `/welcome` redirects there permanently. The desk moved to `/desk`. A signed-in visit to `/` goes on to the desk before the page paints, using the same pre-paint script that used to send signed-out visitors away. A link into the landing page (`/#engine`) stays where it is.

**Why:** `/` is the address everyone links to and the one Google reads the site's name from. It was the one page that showed crawlers nothing. The session lives in the browser, not a cookie, so the server can't tell a signed-in visitor from a crawler. That leaves two options: send everyone the landing page and move signed-in people on in the browser, or move the whole app to cookies. The first is what #60 already did, mirrored.

**In the same change:**
- The account gate now guards only the app's own screens (the desk and the editor), not everything except a list of public pages. So "Page not found" reaches signed-out people.
- When the auth server can't be reached to refresh an expired session, the desk says the documents couldn't load, with Try again. It no longer sends people to a sign-in page that couldn't send them a code either.

### 2. One address per page; the `.vercel.app` copy gets noindex, not a redirect

Every public page names its canonical address on www.adaedit.com. The production `.vercel.app` alias answers with `X-Robots-Tag: noindex`.

**Why not a redirect:** the review pointed out that sessions, unsynced edits and images live in each address's own browser storage. A redirect would strand them for anyone who used the alias, which the README advertised as the live demo. noindex keeps the copy out of search and leaves it working.

### 3. A search gate in CI

`scripts/verify-seo.mjs` serves the build and reads it the way an AI crawler does, with no JavaScript. Every page in the sitemap must have:
- one title and its own description;
- a canonical address and an og:image;
- one h1, coming first;
- at least 150 words in the server's HTML;
- structured data that parses.

The private screens must carry noindex, and `/welcome` must redirect. Every route must be either listed or private, so a new page can't slip through unclassified.

**Why:** every problem in the audit was invisible in a browser, and each would come back the first time someone added a page.

### 4. Structured data that says who and what, and nothing it can't back

The home page carries three types:
- **WebSite:** "Ada Editor". This is Google's site-name signal.
- **Organization:** YourLaunchPad LLC, linked to yourlaunchpad.org.
- **WebApplication:** free during early access, linked to the GitHub repo.

There are no ratings, and no FAQ or HowTo markup.

**Why:** the name is crowded, and this is the cheap, durable way to tie it to one product and one maker. Fabricated ratings would break Google's policy. FAQ markup no longer produces anything.

### 5. Every crawler is allowed, training ones included

robots.txt allows everything and names the sitemap. Vercel's "AI bots" rule set stays off.

**Why:**
- The goal is to be known.
- Blocking a training crawler doesn't help search visibility, and Google-Extended also controls whether Gemini can cite the site.
- The site holds only public pages.
- Vercel's AI-bot rule set would also block the search crawlers.

### 6. No llms.txt, and none of the rest of the "Nonsense" row

**Why:** the evidence in the table. Nobody's search engine reads these things.

### 7. Cookieless counting, and a privacy page that says so (next PR)

The owner chose to measure more than planned. The next step is Vercel Web Analytics and Speed Insights, both already enabled on the project, with:
- no cookies;
- no document addresses: editor URLs are recorded as `/editor/[id]`;
- events for sign-up, a document created, a Word import and each export;
- nothing sent when Global Privacy Control is on.

The privacy page will be rewritten to say exactly that and to name YourLaunchPad LLC. An About page will name the maker.

### 8. Publish the agenda-platform research, with names

The [agenda-platforms research](agenda-platforms-2026-10.md) becomes a public page: the method, its limits, the platform table, and an invitation to vendors to correct it.

**Why:** nobody else has documented what agenda systems do to tagged PDFs. Original research is what both people and AI answers cite, and it's the strongest reason for anyone to link to the site.

### 9. A monthly presence check, not a share-of-voice tool

Twelve questions, as a clerk would ask them, go to four engines each month ([the presence check](search-and-ai-2026-10/presence-check.md)).

**Why:**
- AI answers vary too much for a small panel to measure a share. Repeat runs give the same list less than once in a hundred, and a trustworthy rate takes about a hundred runs per question.
- Against a baseline of zero, the first mention is what matters.
- The domains the engines cite are the list of places worth being mentioned.

### 10. Bing first among the AI tasks

Bing Webmaster Tools, a sitemap there, and IndexNow come before anything else aimed at AI.

**Why:** Copilot answers come from Bing, and ChatGPT partly does too. Brave, which Claude searches, has no submission at all, so links from pages it already knows (GitHub, the W3C list, directories) are the only way in.

## The plan, and where it stands

1. **This PR: a home page search engines can read.** It covers:
   - the route change;
   - canonical addresses;
   - robots.txt and the sitemap;
   - noindex on private screens and on the `.vercel.app` alias;
   - structured data;
   - the Display dialog;
   - the search gate in CI.
2. **Next PR: counting visits without cookies.** Analytics, events, the privacy page and an About page (decision 7).
3. **Owner setup, week 1:**
   - Search Console (a DNS record on Vercel DNS) and Bing Webmaster Tools, with the sitemap;
   - GitHub's description ("A document editor that checks your writing against WCAG 2.1 AA as you type, and exports tagged PDF/UA-1 and HTML"), its homepage and its topics;
   - a link from yourlaunchpad.org;
   - the first presence check.
4. **Content, about a page a week:**
   1. the agenda-platform research;
   2. Title II for meeting documents, with the current dates (April 26, 2027 and April 26, 2028), the lawsuit's status and DOJ's own examples;
   3. what "ADA compliant PDF" can and can't mean;
   4. accessible agenda and minutes templates;
   5. Word to tagged PDF;
   6. agendas as HTML or PDF;
   7. the 28-document study of what a checker can catch;
   8. accessible minutes, and alt text for maps and site plans.
5. **Off-site:**
   - the W3C evaluation tools list;
   - AlternativeTo, the A11y Project and awesome-a11y;
   - the research pitched, not the product, to state leagues, clerk associations, GovLoop and accessibility lists and podcasts.
6. **Performance, only if measured:** if real-user data shows slow interaction on public pages, split them off from the app's code.

## What would change these decisions

- **Google or Bing say they use llms.txt or Markdown copies for retrieval.** Add them: they're cheap. Recheck this one each quarter.
- **The `.vercel.app` alias shows no real use after 30 days of analytics.** Replace its noindex with a redirect (decision 2).
- **Real-user data shows slow interaction on the public pages.** Split the public pages from the app's code.
- **Search Console shows impressions for single checks** (for example, "link text not descriptive WCAG"). Give each check its own page, built from the same rules registry as Help.
- **The presence check shows mentions.** Grow it to a proper panel of about 40 questions, run 3 or 4 times per engine, or a tool that runs real signed-in sessions.
- **The Title II rule changes again**, through the lawsuit or new rulemaking. The guide's dates and the copy that leans on them change the same week.
