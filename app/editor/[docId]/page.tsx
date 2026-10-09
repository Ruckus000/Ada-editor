import type { Metadata } from 'next';
import { EditorRoute } from '../../_editor/EditorRoute';
import { NOINDEX } from '../../_site/pages';

/**
 * Documents are read in the browser (the local store, synced to the account),
 * so the server cannot enumerate or read them: no generateStaticParams, no
 * per-doc metadata. EditorRoute (client) loads the stored doc after hydration
 * and renders the title there.
 */

// Robots only, never a title: a server title would outrank the one EditorRoute
// renders once it has read the document (see app/layout.tsx). next.config.ts
// also sends the noindex as a header: this page renders on demand, and Next
// streams its metadata into <body>, where not every crawler looks.
export const metadata: Metadata = { robots: NOINDEX };

export default function Page() {
  return <EditorRoute />;
}
