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
};

export const PAGES = [
  {
    path: '/',
    title: 'Ada Editor · The accessible document editor (WCAG 2.1 AA)',
    description: 'Check documents against WCAG 2.1 AA as you write, import Word files without uploading them, and export tagged PDF/UA-1 or HTML. Free during early access.',
    published: '2026-10-06',
    updated: '2026-10-09',
  },
  {
    path: '/help',
    title: 'Help · Ada Editor',
    description: 'How Ada Editor checks a document: every rule and the WCAG criterion it cites, what each severity means, shortcuts, exports and posting to agenda systems.',
    published: '2026-10-06',
    updated: '2026-10-08',
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
    description: 'What Ada Editor keeps about you and why, who helps run it, how long it’s kept, and how to delete your account and everything in it.',
    published: '2026-09-28',
    updated: '2026-10-06',
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

/** The app's private screens, kept out of search. */
export const NOINDEX: Metadata['robots'] = { index: false, follow: true };
