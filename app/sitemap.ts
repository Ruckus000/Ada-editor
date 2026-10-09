import type { MetadataRoute } from 'next';
import { PAGES, SITE_URL } from './_site/pages';

/** The public pages, each with the date what it says last changed (app/_site/pages.ts). */
export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((page) => ({ url: new URL(page.path, SITE_URL).href, lastModified: page.updated }));
}
