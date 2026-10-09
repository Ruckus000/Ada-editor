# The live site as a crawler saw it, 2026-10-09

What www.adaedit.com served before this work, fetched with curl (no JavaScript, as the AI search crawlers fetch). The production build was main at #68. These are the observations behind the audit in [the decision record](../search-and-ai-2026-10.md).

## Hosts and redirects

| Request | Status | Goes to |
|---|---|---|
| `http://adaedit.com/` | 308 | `https://adaedit.com/` |
| `https://adaedit.com/` | 308 | `https://www.adaedit.com/` |
| `http://www.adaedit.com/` | 308 | `https://www.adaedit.com/` |
| `https://www.adaedit.com/` | 200 | (served, 16,996 bytes) |
| `https://ada-editor-umber.vercel.app/` | 200 | the same 16,996 bytes, no redirect, no `X-Robots-Tag` |
| `https://ada-editor-ruckus000s-projects.vercel.app/` and the `git-main` alias | 302 | Vercel's login wall, with `X-Robots-Tag: noindex` |
| `/robots.txt`, `/sitemap.xml`, `/llms.txt` | 404 | (none existed) |
| `/no-such-page` | 404 | with a noindex robots meta |
| `/editor/abc` | 200 | a "Loading your documents" shell, indexable |

The project's domains in Vercel: `adaedit.com` (redirects 308 to www), `www.adaedit.com`, `ada-editor-umber.vercel.app` (no redirect). The project had no firewall configuration at all (the API answered "Config not found"), so no bot rules and no AI-bot ruleset.

## Every crawler got in

`/welcome` and `/` with each user agent: Googlebot, Bingbot, OAI-SearchBot, ChatGPT-User, GPTBot, ClaudeBot, Claude-User, Claude-SearchBot, PerplexityBot, Perplexity-User, CCBot, Applebot. All answered 200.

## What each page said about itself, in the HTML the server sent

| Route | `<title>` | Description | Canonical | First heading | Words before JS | JSON-LD |
|---|---|---|---|---|---|---|
| `/` | **two**: "Loading your documents · Ada Editor", then "Your desk · Ada Editor" | the layout's default | none | h1 "Loading your documents" | 24, and no links | none |
| `/welcome` | Accessible document editor · Ada Editor | its own | none | **h2 "Display"** (a closed dialog), then the h1 | 552 | none |
| `/help` | Help · Ada Editor | the layout's default | none | h2 "Display", then the h1 | 1,886 | none |
| `/accessibility` | Accessibility · Ada Editor | the layout's default | none | h2 "Display", then the h1 | 600 | none |
| `/privacy` | Privacy · Ada Editor | the layout's default | none | h2 "Display", then the h1 | 508 | none |
| `/sign-in` | Sign in · Ada Editor | the layout's default | none | h1 | 37 | none |
| `/sign-up` | Create an account · Ada Editor | the layout's default | none | h1 | 102 | none |

Every page had Open Graph and Twitter cards with the generated image and its alt text, but no `og:url`, `og:type` or `og:site_name`.

The homepage was the app's desk. A signed-out visitor reached the landing page only through a script in `<head>` that ran `location.replace('/welcome')`. A crawler that runs no JavaScript (GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot) saw the desk's loading screen; Google saw it too until it rendered the page and followed the script. `app/_auth/AuthGate.tsx` noted the trade-off: "non-JS crawlers and link previews of / still see 'Your desk'".

## Weight

The landing page loaded about 280 KB of JavaScript (brotli), about 1 MB uncompressed. That included the Supabase client and ProseMirror, because the account gate wrapped the root layout. The page's largest element is server-rendered text, so this is an interaction-speed question to measure, not a known problem.

## Search engines and accounts

- No TXT record on `adaedit.com` and no verification meta, so neither Google Search Console nor Bing Webmaster Tools had been set up.
- Brave and the search tool used for research returned nothing for `site:adaedit.com`. Google and Bing couldn't be checked from here.
- The public GitHub repo, `Ruckus000/Ada-editor`, was the only thing that surfaced. Its description read "Write Ada compliant documents", and its homepage field and the README's "Live demo" link pointed at `ada-editor-umber.vercel.app`.
- The Vercel project had Web Analytics and Speed Insights switched on, but the app didn't include either package, so neither collected anything.
