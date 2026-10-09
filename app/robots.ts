import type { MetadataRoute } from 'next';
import { SITE_URL } from './_site/pages';

/**
 * Every crawler may read everything: search engines and AI assistants alike,
 * training crawlers included. The site holds only public pages, and being
 * known is the point; Google-Extended also decides whether Gemini can cite it.
 * The private screens carry noindex instead of a Disallow, which would stop
 * crawlers from ever seeing it. Why: docs/audit/search-and-ai-2026-10.md.
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', allow: '/' }], sitemap: `${SITE_URL}/sitemap.xml` };
}
