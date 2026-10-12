# Error reporting, October 2026

**The question:** when Ada Editor breaks for a clerk in the pilot, how do we find out without the clerk having to tell us, and without breaking the privacy page's promise that what people write is never counted?

**What I looked at:**
- Every place the app catches an error or swallows one:
  - the error boundary, which only logged to the visitor's console;
  - the PDF export, whose `catch {}` dropped the error;
  - sync, where a document the server refuses goes quietly unsynced;
  - Word import, and account deletion.
- The privacy page as of 12 October 2026: what it keeps, what it counts and who handles data.
- Sentry's Next.js SDK (10.75.3): what it sends by default, and how it reads options at build time and in the browser.
- A production-mode build with a dummy project, where I threw errors on an open document and read every envelope before it left.

## The one-line verdict

**Crashes and the failures that matter go to Sentry from production only. Each report is scrubbed in the browser so it can't carry what a document says or who wrote it, and the SDK loads after the page so visitors don't pay for it.**

## Decisions

### Sentry, not a reporter of our own

I proposed a small reporter of our own: an endpoint, a Supabase table and an email from Resend on each new kind of error, so no fourth company would handle data. The owner chose Sentry. It brings grouping, readable stack traces and alerts out of the box, and a later session can investigate issues through the Sentry connection. The cost is one more company on the privacy page, now listed there.

**What would change it:** Sentry's terms or pricing changing for the worse, or a customer (a town's IT or legal team) requiring that no error data leave the companies they've already approved.

### Three ways a document could leak into a report, all closed in `app/_site/reports.ts`

1. **Error messages quote content.** ProseMirror's schema errors print the text they choke on (`Invalid content for node paragraph: <"…">`), and so does `JSON.parse`. Everything in double quotes, curly quotes or backticks is replaced. Single quotes stay, because engines use them for names (`reading 'title'`).
2. **Supabase errors are plain objects.** Sentry files a captured plain object under `extra`, and a Postgres error's `details` is "Failing row contains (…)": the document itself. `extra` is dropped from every report. Where we report a Supabase failure on purpose, it goes as a sentence and its SQLSTATE code only.
3. **Breadcrumbs, the trail before an error:**
   - Clicks describe elements by their labels, and a document card's label is its title.
   - Console lines carry document ids and error objects.
   - Supabase URLs carry the account id, in storage paths and in `owner_id=eq.` queries.

   Clicks and console lines are dropped. Page changes and network requests stay, with queries and fragments removed, ids replaced by `[id]`, and editor addresses sent as `/editor/[docId]`.

Reports carry no user, no Referer header, no timezone or locale, and no session pings. Session pings count visits per release, which is counting the privacy page doesn't list. The analytics gate (`scripts/verify-analytics.mjs`) checks each rule with crafted reports, and fails if anything tells Sentry who the visitor is.

**What would change it:** a report in Sentry that shows document text. That means a new way in, which then gets a rule here and a check in the gate.

### The SDK loads after the page

Imported the usual way, Sentry added 35 kB to the JavaScript every page loads first, the landing page included: shared JavaScript went from 102 kB to 137 kB. Loaded with a dynamic import instead, it adds 2 kB. An error thrown in the first moments of a page, before the SDK arrives, is missed unless a boundary or `report()` catches it; those wait for the SDK.

**What would change it:** reports, or clerks, showing crashes on load that never reach Sentry.

### Production only, through our own domain

Reports are sent only on the production deployment, the same rule as the visit counting: local runs, CI and preview deployments send nothing. They go to `/monitoring` on adaedit.com, which forwards them to Sentry. Ad blockers and town firewalls don't drop them, and the visitor's browser never talks to a fourth company.

### What is reported, and what isn't

**Reported:**
- crashes the error boundaries catch;
- any uncaught error or unhandled promise rejection;
- a PDF that couldn't be built;
- a Word import that failed for a reason that isn't the file's (not "this isn't a Word file");
- a document the server refuses for good;
- an account deletion that failed.

**Not reported:**
- sync retries (network, an expired session), which are expected and would spend the quota;
- a document that couldn't be deleted, a refresh that failed, and display or tour settings that couldn't be saved to the account. These are network noise, and visible to the person where it matters.

**What would change it:** a pilot clerk hitting one of these and our not knowing.

### No Global Privacy Control opt-out

Global Privacy Control turns off the visit counting, because counting is optional. Error reports keep the service working for the person sending them, carry nothing that identifies them, and are deleted within 90 days. So they are not switched off by it.

**What would change it:** a law, or a customer, that treats error reports as data sharing.

### Browser only

The app does almost nothing on the server: it serves pages and stores documents in Supabase. Vercel keeps the server's logs. There's no server-side Sentry, and the build's warning about the missing server file is switched off on purpose.

**What would change it:** server routes that do real work.

### Location, from the connection

The first live test showed that Sentry works out a city from the connection, even though it doesn't keep the IP address and the SDK attaches no user. Reports still reach Sentry with the visitor's address, forwarded by `/monitoring`. Sentry's settings don't promise to stop this, so the privacy page says it, in the same words as the visit counting: country, region and city, from your connection.

**What would change it:** a Sentry setting that verifiably stops location lookups, or a forwarder of our own that strips the address. At that point the sentence comes off the privacy page.

### Source maps for every chunk

By default the plugin uploads source maps only for the page-level chunks. The first live test's stack trace stayed minified, because the code it ran through sits in a shared chunk, and so does most of the editor. `widenClientFileUpload` uploads them all, at the cost of a slightly longer build.

## Setup that lives outside the code

- **Production environment variables:** `NEXT_PUBLIC_SENTRY_DSN`, plus `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` for uploading source maps. They come from the Sentry integration in the Vercel Marketplace, or are added by hand. Without the DSN nothing is sent; without the token, stack traces stay minified.
- **In Sentry's project settings:** "Prevent storing of IP addresses" on, the server-side data scrubber on, data stored in the USA (as the privacy page says), and an email alert for new issues.
