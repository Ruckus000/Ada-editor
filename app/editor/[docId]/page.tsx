import { EditorRoute } from '../../_editor/EditorRoute';

/**
 * Documents are read in the browser (the local store, synced to the account),
 * so the server cannot enumerate or read them: no generateStaticParams, no
 * per-doc metadata. EditorRoute (client) loads the stored doc after hydration
 * and renders the title there.
 */

export default function Page() {
  return <EditorRoute />;
}
