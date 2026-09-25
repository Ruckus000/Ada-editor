import { EditorRoute } from '../../_editor/EditorRoute';

/**
 * Documents are localStorage-backed, so the server cannot enumerate or read
 * them: no generateStaticParams, no per-doc metadata. EditorRoute (client)
 * loads the stored doc after hydration and renders the title there.
 */

export default function Page() {
  return <EditorRoute />;
}
