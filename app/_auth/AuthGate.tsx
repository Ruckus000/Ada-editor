'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '../../design-system/primitives';
import { hasCachedDocs } from '../_data/store';
import { getClient, isCloud } from '../_data/supabase';
import { attachedAccount, detachAccount, loadAccount } from '../_data/sync';
import { StatusScreen } from '../_status/StatusScreen';
import { ConflictDialog } from './ConflictDialog';

/**
 * Cloud mode only: no session → /sign-in; a session → load the account's
 * documents into the store BEFORE rendering the app, so the dashboard and
 * editor keep reading the store synchronously and never race the pull.
 * Local mode (no Supabase env vars) renders straight through.
 */
/** Readable without an account: signing in, what signing up means, and the landing page. */
const PUBLIC_PATHS = new Set(['/sign-in', '/sign-up', '/privacy', '/accessibility', '/welcome']);

export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  const open = !isCloud || PUBLIC_PATHS.has(pathname);

  // The session can end or change under this tab: sign-out or sign-in in
  // another tab (auth-js relays those between tabs), or a revoked session.
  // Stop syncing first, so nothing of one account is written or pushed under
  // another, then reload so no screen keeps showing the old account's work.
  useEffect(() => {
    const client = getClient();
    if (!client) return;
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      const attached = attachedAccount();
      const uid = session?.user.id ?? null;
      if (!attached || uid === attached) return;
      detachAccount();
      window.location.assign(uid ? '/' : '/sign-in');
    });
    return () => { data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    const client = getClient();
    if (!client) return;
    // Leaving the app for sign-in ends the session's "ready": the next account
    // must load before anything reads the store.
    if (PUBLIC_PATHS.has(pathname)) { setState('loading'); return; }
    let live = true;
    void (async () => {
      const { data } = await client.auth.getSession();
      const uid = data.session?.user.id;
      // ponytail: client-side, so crawlers on / see the loading screen; move to a
      // server redirect if SEO on / matters.
      if (!uid) { router.replace(pathname === '/' ? '/welcome' : '/sign-in'); return; }
      try {
        await loadAccount(uid);
      } catch (error) {
        console.error('Could not load documents', error);
        // Offline with a cache: work from it; edits stay dirty and push later.
        if (!hasCachedDocs()) { if (live) setState('failed'); return; }
      }
      if (live) setState('ready');
    })();
    return () => { live = false; };
  }, [pathname, router, attempt]);

  if (open || state === 'ready') return <>{children}{isCloud && state === 'ready' ? <ConflictDialog /> : null}</>;
  if (state === 'failed') {
    return (
      <StatusScreen
        title="Your documents couldn’t load"
        actions={<Button variant="primary" onClick={() => { setState('loading'); setAttempt((n) => n + 1); }}>Try again</Button>}
      >
        Ada Editor couldn’t reach your account. Check your connection, then try again.
      </StatusScreen>
    );
  }
  return <StatusScreen title="Loading your documents">This takes a moment on the first visit.</StatusScreen>;
}
