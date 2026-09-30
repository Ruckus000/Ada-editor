'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { DocSummary } from '../_data/seed';
import { loadDoc, seedIfEmpty, subscribeDocs } from '../_data/store';
import type { StoredDoc } from '../_data/store';
import { isCloud } from '../_data/supabase';
import { StatusScreen } from '../_status/StatusScreen';
import { EditorScreen } from './EditorScreen';
import { useAnnounce } from '../../design-system/primitives';

/**
 * Client-side data loading for the editor route (§7 step 8). Documents live in
 * the browser's store (synced to the account in cloud mode), which the server cannot read — so generateStaticParams and the
 * server-side findDoc are gone. The page shell stays a server component (for
 * metadata); this component loads the stored doc after hydration and hands it
 * to the editor, or renders a not-found panel with a way back.
 */
export function EditorRoute() {
  const { docId } = useParams<{ docId: string }>();
  const [stored, setStored] = useState<StoredDoc | null>(null);
  const [ready, setReady] = useState(false);
  /** Replaced by another device's version (sync.ts): the editor starts over from it. */
  const [version, setVersion] = useState(0);
  const [goneElsewhere, setGoneElsewhere] = useState(false);
  const announce = useAnnounce();

  useEffect(() => {
    seedIfEmpty();
    setStored(loadDoc(docId));
    setGoneElsewhere(false);
    setReady(true);
    // Only a pull, a refresh or a conflict choice tells this; typing here doesn't.
    return subscribeDocs((ids) => {
      if (!ids.includes(docId)) return;
      const next = loadDoc(docId);
      setStored(next);
      if (!next) { setGoneElsewhere(true); return; }
      setVersion((v) => v + 1);
      announce('This document was updated with changes from another device.');
    });
  }, [docId, announce]);

  if (!ready) return <title>Document · Ada Editor</title>;
  if (!stored && goneElsewhere) {
    return (
      <StatusScreen title="Document deleted" actions={<Link href="/">Back to all documents</Link>}>
        This document was deleted on another device.
      </StatusScreen>
    );
  }
  if (!stored) {
    return (
      <StatusScreen title="Document not found" actions={<Link href="/">Back to all documents</Link>}>
        {isCloud ? 'There’s no document with that id in your account.' : 'No document with that id is stored in this browser.'}
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
      <EditorScreen key={`${docId}:${version}`} doc={doc} stored={stored} />
    </>
  );
}
