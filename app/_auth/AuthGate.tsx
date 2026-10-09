'use client';

import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '../../design-system/primitives';
import { hasCachedDocs } from '../_data/store';
import { getClient, isCloud } from '../_data/supabase';
import { attachedAccount, detachAccount, loadAccount } from '../_data/sync';
import { DESK, isAppPath } from '../_site/routes';
import { StatusScreen } from '../_status/StatusScreen';
import { ConflictDialog } from './ConflictDialog';

/**
 * Cloud mode only, and only on the app's own screens (isAppPath: the desk and
 * the editor): no session → /sign-in; a session → load the account's
 * documents into the store BEFORE rendering the app, so the desk and editor
 * keep reading the store synchronously and never race the pull. Everything
 * else renders for anyone: the public pages, sign-in, "Page not found".
 * Local mode (no Supabase env vars) renders straight through.
 */

export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // 'unreachable': the session needed refreshing and the auth server couldn't
  // be reached. 'failed': signed in, but the documents didn't load.
  const [state, setState] = useState<'loading' | 'ready' | 'failed' | 'unreachable'>('loading');
  const [attempt, setAttempt] = useState(0);
  const open = !isCloud || !isAppPath(pathname);

  // The session can end or change under this tab: sign-out or sign-in in
  // another tab (auth-js relays those between tabs), or a revoked session.
  // Stop syncing first, so nothing of one account is written or pushed under
  // another, then load afresh so no screen keeps showing the old account's
  // work: the desk or sign-in from the app, the same page from a public one.
  useEffect(() => {
    const client = getClient();
    if (!client) return;
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      const attached = attachedAccount();
      const uid = session?.user.id ?? null;
      if (!attached || uid === attached) return;
      detachAccount();
      if (isAppPath(window.location.pathname)) window.location.assign(uid ? DESK : '/sign-in');
      else window.location.reload();
    });
    return () => { data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    const client = getClient();
    if (!client) return;
    // Leaving the app's screens ends the session's "ready": the next account
    // must load before anything reads the store.
    if (!isAppPath(pathname)) { setState('loading'); return; }
    let live = true;
    void (async () => {
      const { data, error } = await client.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid) {
        // An expired token that couldn't be refreshed for want of a network is
        // still this browser's account: say the documents couldn't load (Try
        // again), not sign in, which couldn't send a code either.
        if (isAuthRetryableFetchError(error)) { if (live) setState('unreachable'); return; }
        router.replace('/sign-in');
        return;
      }
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
  if (state === 'failed' || state === 'unreachable') {
    // auth-js remembers a failed refresh for a minute, so retrying in this page
    // would get the same failure back; a fresh load starts a fresh client.
    // Nothing is lost: the app's screens never rendered.
    const retry = state === 'unreachable'
      ? () => window.location.reload()
      : () => { setState('loading'); setAttempt((n) => n + 1); };
    return (
      <StatusScreen
        title="Your documents couldn’t load"
        actions={<Button variant="primary" onClick={retry}>Try again</Button>}
      >
        Ada Editor couldn’t reach your account. Check your connection, then try again.
      </StatusScreen>
    );
  }
  return <StatusScreen title="Loading your documents">This takes a moment on the first visit.</StatusScreen>;
}
