# Review of the route change (landing page to /, desk to /desk) before it was built

Written on 2026-10-09 by a research agent working from public sources, and kept as it was delivered (minus 0 line(s) about this session's tooling). Claims carry their own sources and dates. The decisions drawn from it are in [the decision record](../search-and-ai-2026-10.md).

---

I reviewed this read-only and changed nothing. The design is sound overall, but eight things need fixing before it ships:

1. `DESK` must not live in `Site.tsx`.
2. A per-page `openGraph` object removes the og:image from every nested page.
3. Node's `fetch` ignores a custom `Host` header, so the alias check can't use it.
4. Next treats `has.value` as a regex, so the dots in the hostname must be escaped.
5. Two a11y-gate assertions and the CI workflow are missing from the plan.
6. The PREPAINT bounce sends signed-in people on deep links like `/#engine` to the desk.
7. The editor's noindex can be streamed into `<body>`.
8. In cloud mode, signed-out visitors never see the not-found page.

## A. References the plan missed

**App code**
- `/Users/jphilistin/Documents/Coding/ADA Editor/Ada-editor/app/_auth/SignInScreen.tsx:198` — the brand link `href="/welcome"` should become `/`. The plan only covers lines 84 and 123.
- `/Users/jphilistin/Documents/Coding/ADA Editor/Ada-editor/app/_site/SiteAccount.tsx:37` — "Start writing" uses `isCloud ? '/sign-up' : '/'`, a copy of `START`. Use `START`, or in local mode it will point at the landing page instead of the desk.
- `/Users/jphilistin/Documents/Coding/ADA Editor/Ada-editor/app/_auth/AccountMenu.tsx:36` — this also renders the closed `DisplayDialog`. The desk's current HTML has h2 "Display" before h1 "Hello.". Put the mount-on-first-open logic inside `DisplayDialog.tsx` so both callers get it.
- `/Users/jphilistin/Documents/Coding/ADA Editor/Ada-editor/app/_auth/DisplayDialog.tsx:29-30` — `id="display-title"` duplicates `/Users/jphilistin/Documents/Coding/ADA Editor/Ada-editor/app/help/page.tsx:131-132`.
  - On /help, the "Display settings" section is labelled by the dialog's "Display" heading, because that comes first in the DOM.
  - axe's `duplicate-id-aria` rule is `reviewOnFail`, so the gate files it under "incomplete" and never sees it.
  - Use `useId()`. Lazy mounting only hides the clash until the dialog is opened.
- `/Users/jphilistin/Documents/Coding/ADA Editor/Ada-editor/app/manifest.ts:13` — change `start_url` to `/desk`, and add `id: '/'` so existing home-screen shortcuts keep their identity.
- `/Users/jphilistin/Documents/Coding/ADA Editor/Ada-editor/app/layout.tsx:14-18` — the shared Open Graph fields go here (see C). Never put `alternates` or `robots` here: not-found, the desk and the editor would inherit them.
- `/Users/jphilistin/Documents/Coding/ADA Editor/Ada-editor/app/editor/[docId]/page.tsx` — add `robots` only, never `title`. As the comment at layout.tsx:8-11 explains, a server title outranks the `<title>` that EditorRoute renders.
- Help, accessibility and privacy pages — `/Users/jphilistin/Documents/Coding/ADA Editor/Ada-editor/app/help/page.tsx:11`, `/Users/jphilistin/Documents/Coding/ADA Editor/Ada-editor/app/accessibility/page.tsx:7`, `/Users/jphilistin/Documents/Coding/ADA Editor/Ada-editor/app/privacy/page.tsx:6`. All three ship the root description today; I checked the current `.next` output. The registry must give each its own.
- `/Users/jphilistin/Documents/Coding/ADA Editor/Ada-editor/app/welcome/page.tsx:3-5` — after the move the imports become `../design-system/primitives/SeverityBadge` (keep the file import, not the barrel) plus the new routes module. Then delete `app/welcome/`.
- Comments that describe the old routing:
  - `/Users/jphilistin/Documents/Coding/ADA Editor/Ada-editor/app/_data/display.ts:64-71`
  - `/Users/jphilistin/Documents/Coding/ADA Editor/Ada-editor/app/_auth/AuthGate.tsx:13-19,56-59` — the note that crawlers see "Your desk" is resolved by this PR; delete it.
  - `/Users/jphilistin/Documents/Coding/ADA Editor/Ada-editor/app/_site/Site.tsx:8-13`
  - `/Users/jphilistin/Documents/Coding/ADA Editor/Ada-editor/app/_site/site.css:1`
  - `/Users/jphilistin/Documents/Coding/ADA Editor/Ada-editor/app/_data/supabase.ts:19-20`
  - `/Users/jphilistin/Documents/Coding/ADA Editor/Ada-editor/app/_home/Home.tsx:31`

**Gates, CI and docs**
- `/Users/jphilistin/Documents/Coding/ADA Editor/Ada-editor/scripts/verify-a11y-app.mjs`
  - `:507` — `upload()` navigates to `${origin}/`. Change it to `/desk`, or `fromPlus` fails with "no New document (+) button".
  - `:1299-1311` — `statusScreens()` expects a link named "Back to all documents" on `/no-such-page` too. With "Go to the home page" that fails. Make the expected link name per screen, and check its href.
  - `:243, 329, 348, 375, 411, 443, 1448, 1488, 1530` — the `page = '/ …'` labels should read `/desk …`, or failure messages will name the wrong route.
  - `:1361-1386` — `staticPage()` should exercise the header's Display button. Assert no `<dialog>` exists before opening, `dialog[open]` after Enter, run axe, then Escape returns focus to "Display". Nothing opens SiteAccount's dialog today.
- `/Users/jphilistin/Documents/Coding/ADA Editor/Ada-editor/scripts/verify-e2e.mjs`
  - Line-by-line: `:265-267` (signIn landing), `:337-340` (`goHome` should go to `/desk`), `:364`, `:377-383`, `:410-413`, and `:646-650` (also assert the "Your desk" href is `/desk`).
  - Add three checks: a signed-in full load of `/` ends on `/desk`; signed-out `/desk` ends on `/sign-in`; `/welcome` ends on `/`.
  - This is the only gate that exercises the PREPAINT bounce, because the a11y gate runs in local mode.
- `/Users/jphilistin/Documents/Coding/ADA Editor/Ada-editor/package.json:22` — append `&& node scripts/verify-seo.mjs --no-build` to `verify`, and add an `"seo"` script.
- `/Users/jphilistin/Documents/Coding/ADA Editor/Ada-editor/.github/workflows/design-system.yml:134-135` — CI never runs `npm run verify`. Add a step after the app a11y gate: `node scripts/verify-seo.mjs --verbose --no-build`.
- `/Users/jphilistin/Documents/Coding/ADA Editor/Ada-editor/README.md:6` — the live demo link points at the alias you're about to redirect; change it to https://www.adaedit.com. Also update `:189` (mention `/desk`) and `:190` (list the SEO gate).

**Nothing to change in:**
- `design-system/` — `harness.js` contains no route strings.
- `tests/` and `playwright.config.ts` — they only test the preview.
- `supabase/` — the email templates have no links, and `site_url` is the local stack.
- `docs/audit/ui-audit-2026-10.md:47,62` — historical record.

## B. Behaviour: loops, flashes, dead ends

After the change there are only three automatic hops:
- `/` to `/desk`: PREPAINT, when a session key is stored.
- `/desk` to `/sign-in`: AuthGate, when there's no session.
- `/sign-in` to `/desk`: SignInScreen, when there is a session.

A cycle would need AuthGate and SignInScreen to get different answers from `getSession()`. Only a flapping network does that, and fix 3 below removes it.

1. **Signed-in full load of `/`.** This works. The landing may paint briefly before `/desk` commits; the old `/` to `/welcome` bounce had the same trade-off.
   - **Problem:** deep links such as `/#engine` are bounced to the desk and the hash is lost.
   - **Fix:** bounce only `location.pathname === '/' && !location.hash`.
   - **Keep** the `${isCloud} &&` guard: the a11y gates run Chrome on its default profile, and a stray `sb-*` key there must never bounce them.
2. **Stale token on `/`.** It goes to `/desk`, the refresh fails for good, auth-js deletes the key, and the visitor lands on `/sign-in`. Today they would land on the landing page instead. It happens once; acceptable.
3. **Expired access token while offline or during an Auth outage.**
   - auth-js keeps the key and `getSession()` returns `{ session: null, error }` (GoTrueClient.js `__loadSession` / `_callRefreshToken`).
   - Every full load of `/` then goes to `/desk` and on to `/sign-in`, where no code can be sent.
   - **Fix in AuthGate:**
     ```ts
     if (!uid) {
       if (isAuthRetryableFetchError(error)) { if (live) setState('failed'); return; }
       router.replace('/sign-in'); return;
     }
     ```
   - `isAuthRetryableFetchError` is exported from `@supabase/supabase-js`.
4. **Signed out on `/desk` in cloud mode.**
   - The server HTML is the "Loading your documents" screen, which takes focus, and only then does AuthGate replace it with `/sign-in`.
   - **Optional fix:** in PREPAINT, when no key is stored, `location.replace('/sign-in')` on app paths. AuthGate still handles expired tokens.
5. **Client-side navigation to `/` while signed in.**
   - This is fine: the landing shows "Your desk" and the stored-session flag hides "Sign in".
   - The one gap is someone who signed in during this tab's life, because PREPAINT ran while they were signed out. "Sign in" flashes until `getSession` resolves.
   - **Fix:** set `document.documentElement.dataset.session = ''` after `verifyOtp`.
6. **Sign-out in another tab.**
   - On app paths it correctly goes to `/sign-in`.
   - But a public page reached from the desk still has the account attached, so the reader gets pulled to `/sign-in` mid-read.
   - **Optional fix:** reload in place when not on an app path.
7. **Local mode.** No key means no bounce; `START` is the desk and AuthGate is always open. Returning local users now land on the marketing page and need one more click.
8. **Unknown URL, signed out, cloud mode.**
   - AuthGate's allowlist treats the URL as private. The server HTML is the loading screen (still 404 + noindex, so search is fine) and the visitor is sent to `/sign-in`.
   - The new "Go to the home page" link is never seen by the people who need it.
   - **Fix:** list private paths instead (`p === DESK || p.startsWith('/editor/')`).
   - **Trade-off:** this fails open, so new private routes must be added to that list. The gate's coverage check (D) makes forgetting visible.

## C. Next.js 15.5 answers

- **`redirects()` and `has.host`**
  - Redirects run after `headers()` and before middleware and the app routes, so `/welcome` redirects even if the page still existed. Delete it anyway.
  - `has.host` compares `req.headers.host`, lower-cased with the port stripped, against `new RegExp('^' + value + '$')` (node_modules/next/dist/shared/lib/router/utils/prepare-destination.js:86,103).
  - Write the value as `'ada-editor-umber\\.vercel\\.app'`; Vercel's own KB example escapes the dots the same way.
  - Vercel compiles the rule into its edge routing, ahead of functions; preview hostnames don't match.
  - Put the host rule first, or `umber/welcome` takes two hops.
  - Query strings pass through. `next start` answers 308 with a `Refresh` header, and the `headers()` security headers apply to the redirect.
- **OG images when a page sets `openGraph`**
  - The `app/` static files attach only to the root layout node and the root page node (next-app-loader index.js:184-186).
  - A nested page's `openGraph` replaces the accumulated object (resolve-metadata.js:149). Static images are then re-merged only from that page's own folder (:94-125).
  - So /help, /privacy and /accessibility would lose og:image; twitter:image survives.
  - **Fix:**
    - Put `openGraph: { siteName, type: 'website', locale }` in the root layout and set no `openGraph` per page. og:title and og:description fill in from each page's `title` and `description` (postProcessMetadata).
    - og:url is optional because the canonical covers it. If you want it, the per-page object must restate `images` (`/opengraph-image.png`, 1200×630, plus alt).
- **Canonical format.** `alternates.canonical: '/'` renders `https://www.adaedit.com` with no trailing slash (resolve-url.js:109). Compare canonical and sitemap URLs with `new URL(x).href` on both sides.
- **`robots: { index: false }`**
  - With no `robots` in the layout, the page's value renders on its own as `<meta name="robots" content="noindex, follow">`. 404s also get Next's automatic noindex.
  - **Caveat:** `/editor/[docId]` renders on demand, not at build time. For those renders, 15.5 streams metadata into `<div hidden>` in the body (lib/metadata/metadata.js:155-165) for any user agent not in `HTML_LIMITED_BOT_UA_RE`, and plain Googlebot isn't in it.
  - Add an `X-Robots-Tag: noindex` header for `/editor/:path*` in `headers()`. It costs nothing to do the same for `/desk`, `/sign-in` and `/sign-up`.
- **JSON-LD**
  - Render a plain `<script>` (not `next/script`) from the page:
    ```tsx
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />
    ```
  - It doesn't interact with your CSP: there's no `script-src`, and data blocks don't execute.
  - Keep it truthful: WebSite plus Organization on `/`, which is Google's site-name signal. Add no offers or ratings unless they're real.
- **not-found and `error.tsx` under AuthGate**
  - Both render inside the root layout, so inside AuthGate.
  - In cloud mode, not-found only shows to signed-in visitors (B8); the status stays 404 either way.
  - `error.tsx` only shows where AuthGate renders its children. Errors in Providers or AuthGate themselves fall to Next's default page, because there is no `global-error.tsx`.
  - On public pages, `error.tsx`'s "Back to all documents" sends anonymous visitors through `/desk` to `/sign-in`.

## D. `verify-seo.mjs`

**How `verify-a11y-app.mjs` serves the app:**
- `:39-45` runs `next build` unless `--no-build`.
- `:47-54` picks a free port and runs `track(spawn(next start -p port -H 127.0.0.1))`.
- `:60` starts the watchdog after the build.
- `:62-67` polls until the server answers.
- `:1561-1563` kills the server; `:1565-1573` prints the report.

**What to reuse:**
- `track`, `watchdog` and `sleep` from `cdp.mjs`. Importing it runs `findChrome()` and a WebSocket check, which are harmless on Node 22, and you get the signal handling that kills `next start`.
- `parseHTML` from linkedom, already used by `verify-rules.mjs` and `measure-engine.mjs`.
- To read the registry, bundle `pages.ts` in memory with esbuild as `verify-e2e.mjs:321-324` does, but with `write: false` and a `data:` URL import. That only works if `pages.ts` has nothing but `import type` lines.

**Structure**, matching the other gates (fail/note accumulation, "Fix the pages. Do not weaken the check."):
- **Header and constants:** `SITE`, `ALIAS`, a Googlebot user agent, and `NOINDEX = ['/desk', '/editor/hearing-notice', '/sign-in', '/sign-up']`.
- **Serve:** build unless `--no-build`. With `--no-build`, require `.next/BUILD_ID` and say so if it's missing. Watchdog of 3 minutes.
- **`get()` via `node:http`.** Node's `fetch` silently replaces a custom `Host` header; I confirmed this in-process. It also doesn't follow redirects:
  ```js
  const get = (path, { host } = {}) => new Promise((done, reject) => {
    const req = request({ host: '127.0.0.1', port, path, headers: { 'user-agent': BOT, ...(host && { host }) } }, (res) => {
      let body = ''; res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => done({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject); req.end();
  });
  ```
- **`robotsAndSitemap()`:**
  - robots.txt returns 200 with no `Disallow` on app paths (a blocked URL never shows its noindex) and names the www sitemap.
  - The sitemap's `<loc>`s are all www, have no duplicates, and equal the registry's indexed paths.
- **`listed(loc)`:** each sitemap URL must
  - return 200 with no redirect and no noindex, in either `X-Robots-Tag` or meta;
  - have one `<title>` (ignore any inside `svg`), unique across pages;
  - have one description of 50–160 characters, unique across pages;
  - have one canonical whose normalized URL equals the loc;
  - carry `og:image` on www;
  - keep its metadata inside `<head>` (this catches a public page turning dynamic);
  - have exactly one h1, and the first heading in DOM order must be that h1;
  - have at least 150 words in `<main>` after removing script, style, template and noscript (otherwise the JSON-LD text counts as words);
  - have every JSON-LD block parse, with the expected `@type`s on `/`;
  - have `<html lang="en">`.
- **`unlisted()`:** each `NOINDEX` path carries noindex (require the header for `/editor/*`); `/no-such-page` returns 404 with noindex.
- **`redirects()`:**
  - `/welcome` and `/welcome?x=1` return 308 to `/` and `/?x=1`.
  - With the alias host, `/` returns 308 to `https://www.adaedit.com/`, and `/help?x=1` to `https://www.adaedit.com/help?x=1`.
  - Two hosts must still return 200: `ada-editor-git-x-team.vercel.app` (proves previews are untouched) and `ada-editor-umberXvercelXapp` (proves the dots are escaped).
- **`coverage()`:** walk `app/**/page.tsx`, skipping `_` folders and mapping `[x]` segments to a pattern. Every route must be either in the sitemap or in `NOINDEX`.

## E. Risks you haven't listed

- **`DESK` in `Site.tsx`.** `Site.tsx` imports `./site.css` and `SiteAccount`. If AuthGate (root layout), SignInScreen, EditorScreen, `error.tsx` and TourReplay import `DESK` from it, `site.css` loads on every route and SiteAccount and Site import each other. That cycle is probably why `SiteAccount.tsx:37` duplicates `START` today. Put `DESK`, `START` and `isAppPath` in a dependency-free `app/_site/routes.ts`, and have PREPAINT interpolate `DESK` from it.
- **The alias redirect strands per-origin storage.** Sessions, unsynced edits ("Not synced — kept in this browser") and IndexedDB images on ada-editor-umber.vercel.app become unreachable, and people must sign in again at www.
  - Check whether the alias has real traffic first. The README currently advertises it.
  - Ship that rule as its own commit, possibly as a 307 for a day: browsers cache 308s, so a mistake sticks.
- **Other production aliases.** `ada-editor-<team>.vercel.app` and the `git-main` alias also serve production, and Vercel only auto-noindexes previews.
  - List them under the project's Domains and add them to the regex, or rely on the canonicals.
  - The apex `adaedit.com` to www redirect is a Vercel domain setting the gate can't see; `curl -sI` it after deploy.
- **Registry dates drive the sitemap's `lastmod`.** Google ignores lastmod that is routinely wrong. Have the gate check each date is valid ISO, `updated >= published`, and not in the future.
- **Social-preview caches.** Slack, LinkedIn and X previews of `/` will keep showing "Your desk" for a while.

## Implementation order

1. Create `app/_site/routes.ts`.
2. Make DisplayDialog mount on first open and use `useId()`, and add the public-header Display check to the a11y gate. This can ship on its own.
3. Do the route swap in one commit:
   - Move the desk to `app/desk/page.tsx` and the landing to `app/page.tsx`, deleting `app/welcome/`.
   - Add the `/welcome` redirect.
   - Update PREPAINT (hash-aware) and AuthGate (retryable-error handling, optionally inverted to private paths).
   - Fix every link and redirect listed in A, plus the manifest.
   - Update `verify-a11y-app.mjs` and `verify-e2e.mjs` in the same commit, because they pin routes.
   - Run typecheck, `a11y:app` and `e2e`.
4. Add `verify-seo.mjs` with its `package.json` scripts and the CI step. Run it and confirm it fails as expected: no robots or sitemap, no canonicals, shared descriptions, no noindex.
5. Add the metadata until the gate passes:
   - `pages.ts` and `pageMetadata`.
   - Open Graph fields in the layout.
   - Noindex as both metadata and `X-Robots-Tag`.
   - `robots.ts`, `sitemap.ts` and the JSON-LD component.
6. Update the README and the comments listed in A.
7. Add the host redirect last, as its own commit, after checking alias traffic.
8. After deploy:
   - `curl -sI` www, the alias (with a nested path and a query string), the apex, and a preview.
   - Submit the sitemap in Search Console and inspect `/`.
   - Run the Rich Results Test.

Sources:
- [Avoiding duplicate-content SEO with vercel.app URLs and custom domains](https://vercel.com/kb/guide/avoiding-duplicate-content-with-vercel-app-urls)
- [Are Vercel Preview Deployments indexed by search engines?](https://vercel.com/kb/guide/are-vercel-preview-deployment-indexed-by-search-engines)
- [Next.js: How to implement JSON-LD](https://nextjs.org/docs/app/guides/json-ld)

### Critical Files for Implementation
- /Users/jphilistin/Documents/Coding/ADA Editor/Ada-editor/app/_auth/AuthGate.tsx
- /Users/jphilistin/Documents/Coding/ADA Editor/Ada-editor/app/_data/display.ts
- /Users/jphilistin/Documents/Coding/ADA Editor/Ada-editor/next.config.ts
- /Users/jphilistin/Documents/Coding/ADA Editor/Ada-editor/scripts/verify-a11y-app.mjs
- /Users/jphilistin/Documents/Coding/ADA Editor/Ada-editor/scripts/verify-e2e.mjs
