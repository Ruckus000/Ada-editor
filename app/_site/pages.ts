import type { Metadata } from 'next';

/** Where every page lives for search engines, AI assistants and anyone sharing a link. */
export const SITE_URL = 'https://www.adaedit.com';

/**
 * Every public page, and what search engines and AI assistants are told it is.
 * Titles and descriptions are read by people on results pages, so they say
 * what the page is for in plain words; the search gate (scripts/verify-seo.mjs)
 * checks each page serves exactly these. Dates are real: `updated` is the last
 * change to what the page says, not to its code, and becomes the sitemap's
 * lastmod, which Google trusts only while it stays accurate.
 * Type-only imports here: the search gate bundles this file on its own.
 */
type SitePage = {
  path: string;
  title: string;
  description: string;
  /** YYYY-MM-DD, first public. */
  published: string;
  /** YYYY-MM-DD, the last change to what the page says. */
  updated: string;
  /** Research and guides: dated, bylined, with Article markup that the search
   *  gate holds to these dates (articleData in JsonLd.tsx). */
  kind?: 'article';
};

export const PAGES = [
  {
    path: '/',
    title: 'Ada Editor · The accessible document editor (WCAG 2.1 AA)',
    description: 'Check documents against WCAG 2.1 AA as you write, import Word files without uploading them, and export tagged PDF/UA-1 or HTML. Free during early access.',
    published: '2026-10-06',
    updated: '2026-10-12',
  },
  {
    path: '/help',
    title: 'Help · Ada Editor',
    description: 'How Ada Editor checks a document: every rule and the WCAG criterion it cites, what each severity means, shortcuts, exports and posting to agenda systems.',
    published: '2026-10-06',
    updated: '2026-10-12',
  },
  {
    path: '/accessibility',
    title: 'Accessibility · Ada Editor',
    description: 'Where the Ada Editor app and the documents it exports meet WCAG 2.1 AA, where they don’t yet, how we test them, and how to reach a person.',
    published: '2026-10-06',
    updated: '2026-10-09',
  },
  {
    path: '/privacy',
    title: 'Privacy · Ada Editor',
    description: 'What Ada Editor keeps about you and why, what it counts without cookies, who helps run it, and how to delete your account and everything in it.',
    published: '2026-09-28',
    updated: '2026-10-12',
  },
  {
    path: '/about',
    title: 'About · Ada Editor',
    description: 'Who makes Ada Editor (YourLaunchPad LLC), why it exists, what it promises about compliance claims and your documents, and how to reach a person.',
    published: '2026-10-12',
    updated: '2026-10-12',
  },
  {
    path: '/research/agenda-platforms',
    title: 'Do agenda platforms keep accessible PDFs accessible? · Ada Editor',
    description: 'What Legistar, CivicClerk, PrimeGov, Municode, Diligent, CivicPlus and OnBase do to tagged PDFs: attachment links, agenda packets and Word uploads.',
    published: '2026-10-12',
    updated: '2026-10-12',
    kind: 'article',
  },
  {
    path: '/guides/title-ii-meeting-documents',
    title: 'ADA Title II and meeting documents: the dates, the exceptions · Ada Editor',
    description: 'When ADA Title II requires accessible agendas, packets and minutes: the 2027 and 2028 dates, the archive and preexisting exceptions, and DOJ’s examples.',
    published: '2026-10-12',
    updated: '2026-10-12',
    kind: 'article',
  },
  {
    path: '/guides/ada-compliant-pdf',
    title: 'What “ADA compliant PDF” can and can’t mean · Ada Editor',
    description: 'What an “ADA compliant PDF” can mean (WCAG 2.1 AA, Section 508, PDF/UA), what checkers and PDF/UA labels can’t confirm, and how to make an accessible one.',
    published: '2026-10-12',
    updated: '2026-10-12',
    kind: 'article',
  },
  {
    path: '/guides/accessible-agenda-minutes-templates',
    title: 'Accessible agenda and minutes templates (free, Word) · Ada Editor',
    description: 'Free Word templates for an accessible meeting agenda and minutes: real headings, lists and vote tables, no account, and how to export a tagged PDF.',
    published: '2026-10-12',
    updated: '2026-10-12',
    kind: 'article',
  },
  {
    path: '/guides/word-to-tagged-pdf',
    title: 'How to turn a Word document into a tagged PDF · Ada Editor',
    description: 'Turn a Word document into a tagged PDF: what to fix first, then the export steps for Word on Windows, Mac and the web, Google Docs and LibreOffice.',
    published: '2026-10-12',
    updated: '2026-10-12',
    kind: 'article',
  },
  {
    path: '/guides/agendas-html-or-pdf',
    title: 'Should agendas be HTML or PDF? · Ada Editor',
    description: 'Should a town post its meeting agenda as a web page or a PDF? Both, written once: the page first, with a tagged PDF linked from it, and why.',
    published: '2026-10-12',
    updated: '2026-10-12',
    kind: 'article',
  },
] as const satisfies readonly SitePage[];

export type SitePath = (typeof PAGES)[number]['path'];

/** A public page's title, description and canonical address. Open Graph and
 *  Twitter cards take the title and description from these, and keep the
 *  root layout's image (a page-level openGraph object would drop it). */
export function pageMetadata(path: SitePath): Metadata {
  const page = PAGES.find((p) => p.path === path);
  if (!page) throw new Error(`No public page at ${path}`);
  return { title: page.title, description: page.description, alternates: { canonical: page.path } };
}

/** IndexNow's key. Public by design: engines fetch it from public/<key>.txt to
 *  check that a submission (scripts/indexnow.mjs) comes from this site. The
 *  search gate checks the file is served. */
export const INDEXNOW_KEY = '4a8d476393adbf2cef73876a3a858e07';

/** The app's private screens, kept out of search. */
export const NOINDEX: Metadata['robots'] = { index: false, follow: true };
