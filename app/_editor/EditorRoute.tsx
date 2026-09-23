'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { DocSummary } from '../_data/seed';
import { loadDoc, seedIfEmpty } from '../_data/store';
import type { StoredDoc } from '../_data/store';
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

  useEffect(() => {
    if (stored) document.title = `${stored.title} · Ada Editor`;
  }, [stored]);

  if (!ready) return null;
  if (!stored) {
    return (
      <main style={{ padding: 48, textAlign: 'center' }}>
        <h1>Document not found</h1>
        <p>No document with that id is stored in this browser.</p>
        <Link href="/">Back to all documents</Link>
      </main>
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
  return <EditorScreen key={docId} doc={doc} stored={stored} />;
}
