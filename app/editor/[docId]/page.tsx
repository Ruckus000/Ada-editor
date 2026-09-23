import type { Metadata } from 'next';
import { EditorRoute } from '../../_editor/EditorRoute';

/**
 * Documents are localStorage-backed, so the server cannot enumerate or read
 * them: no generateStaticParams, no per-doc metadata. EditorRoute (client)
 * loads the stored doc after hydration and sets the title there.
 */
export const metadata: Metadata = { title: 'Document · Ada Editor' };

export default function Page() {
  return <EditorRoute />;
}
