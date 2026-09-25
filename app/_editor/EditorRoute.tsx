'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { DocSummary } from '../_data/seed';
import { loadDoc, seedIfEmpty } from '../_data/store';
import type { StoredDoc } from '../_data/store';
import { StatusScreen } from '../_status/StatusScreen';
import { EditorScreen } from './EditorScreen';

/**
 * Client-side data loading for the editor route (§7 step 8). Documents live in
 * localStorage, which the server cannot read — so generateStaticParams and the
 * server-side findDoc are gone. The page shell stays a server component (for
 * metadata); this component loads the stored doc after hydration and hands it
 * to the editor, or renders a not-found panel with a way back.
 */
export function EditorRoute() {
  const { docId } = useParams<{ docId: string }>();
  const [stored, setStored] = useState<StoredDoc | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    seedIfEmpty();
    setStored(loadDoc(docId));
    setReady(true);
  }, [docId]);

  if (!ready) return <title>Document · Ada Editor</title>;
  if (!stored) {
    return (
      <StatusScreen title="Document not found" actions={<Link href="/">Back to all documents</Link>}>
        No document with that id is stored in this browser.
      </StatusScreen>
    );
  }
  const doc: DocSummary = {
    id: stored.id,
    title: stored.title,
    owner: stored.owner,
    targets: stored.targets,
    counts: {},
    lastChecked: '',
    order: 0,
  };
  return (
    <>
      <title>{`${stored.title} · Ada Editor`}</title>
      <EditorScreen key={docId} doc={doc} stored={stored} />
    </>
  );
}
