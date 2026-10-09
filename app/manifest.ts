import type { MetadataRoute } from 'next';

/**
 * Names the app and gives home screens the Caret mark. `display: 'browser'`
 * keeps it an ordinary web page when someone adds it to a home screen; this
 * file is not a step towards an installable app. Icons: `npm run icons:build`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Ada Editor',
    short_name: 'Ada Editor',
    description: 'Write documents that meet WCAG 2.1 AA and Section 508.',
    start_url: '/',
    display: 'browser',
    background_color: '#FFFFFF',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
