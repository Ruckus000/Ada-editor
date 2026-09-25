'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '../../design-system/primitives';
import { hasCachedDocs } from '../_data/store';
import { getClient, isCloud } from '../_data/supabase';
import { loadAccount } from '../_data/sync';
import { StatusScreen } from '../_status/StatusScreen';

/**
 * Cloud mode only: no session → /sign-in; a session → load the account's
 * documents into the store BEFORE rendering the app, so the dashboard and
 * editor keep reading the store synchronously and never race the pull.
 * Local mode (no Supabase env vars) renders straight through.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  const open = !isCloud || pathname === '/sign-in';

  useEffect(() => {
    const client = getClient();
    if (!client) return;
    // Leaving the app for sign-in ends the session's "ready": the next account
    // must load before anything reads the store.
    if (pathname === '/sign-in') { setState('loading'); return; }
    let live = true;
    void (async () => {
      const { data } = await client.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid) { router.replace('/sign-in'); return; }
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

  if (open || state === 'ready') return <>{children}</>;
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
