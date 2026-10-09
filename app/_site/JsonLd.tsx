import { PAGES, SITE_URL } from './pages';

/**
 * Structured data for search engines, as a plain <script> in the server's
 * HTML (crawlers that run no JavaScript still read it). `<` is escaped so no
 * value can close the script element. Say only what the page itself shows:
 * markup that claims more (ratings nobody gave, a price the page doesn't
 * state) breaks Google's structured-data policies.
 */
export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}

const MAKER = `${SITE_URL}/#maker`;

/**
 * The home page's: the site's name (Google takes it from WebSite on the home
 * page), who makes it, and what the product is. No ratings until there are
 * real ones, and no FAQ or HowTo markup: Google no longer shows either.
 * Why: docs/audit/search-and-ai-2026-10.md.
 */
export const HOME_DATA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: 'Ada Editor',
      alternateName: 'adaedit',
      url: `${SITE_URL}/`,
      inLanguage: 'en-US',
      publisher: { '@id': MAKER },
    },
    {
      '@type': 'Organization',
      '@id': MAKER,
      name: 'YourLaunchPad LLC',
      url: 'https://yourlaunchpad.org',
    },
    {
      '@type': 'WebApplication',
      '@id': `${SITE_URL}/#app`,
      name: 'Ada Editor',
      url: `${SITE_URL}/`,
      description: PAGES[0].description,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Any (runs in a web browser)',
      image: `${SITE_URL}/icons/icon-512.png`,
      featureList: [
        'Checks documents against WCAG 2.1 AA as you write, citing the success criterion for every finding',
        'Marks what a checker can’t decide for a person to review',
        'Imports Word (.docx) files in the browser, without uploading them',
        'Exports tagged PDF (PDF/UA-1) and accessible HTML',
      ],
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', description: 'Free during early access' },
      creator: { '@id': MAKER },
      publisher: { '@id': MAKER },
      sameAs: ['https://github.com/Ruckus000/Ada-editor'],
    },
  ],
};
