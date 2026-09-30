'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '../../design-system/primitives';
import { SignInScreen } from '../_auth/SignInScreen';
import { getClient, isCloud } from '../_data/supabase';

type Api = <T>(path: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; data: T | null }>;
type Operator = { email: string; api: Api };

const OperatorContext = createContext<Operator | null>(null);
export const useOperator = () => {
  const op = useContext(OperatorContext);
  if (!op) throw new Error('useOperator outside PortalGate');
  return op;
};

type State = 'loading' | 'signed-out' | 'not-operator' | 'unavailable' | 'ready';

/**
 * The portal's front door. Signed out: the emailed-code sign-in (no new
 * accounts). Signed in: the server checks the operators allowlist
 * (/api/portal/me); only then does anything render. Every API call re-checks
 * on the server, so this gate is for the person, not for security.
 */
export function PortalGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>('loading');
  const [email, setEmail] = useState('');
  const [attempt, setAttempt] = useState(0);

  const api = useCallback<Api>(async (path, init) => {
    const client = getClient();
    const token = (await client?.auth.getSession())?.data.session?.access_token;
    const res = await fetch(path, { ...init, headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, cache: 'no-store' }).catch(() => null);
    if (!res) return { ok: false, status: 0, data: null };
    if (res.status === 401) setState('signed-out');
    if (res.status === 403) setState('not-operator');
    return { ok: res.ok, status: res.status, data: res.ok ? await res.json() : null };
  }, []);

  useEffect(() => {
    const client = getClient();
    if (!isCloud || !client) { setState('unavailable'); return; }
    let live = true;
    void (async () => {
      const { data } = await client.auth.getSession();
      if (!data.session) { if (live) setState('signed-out'); return; }
      const me = await api<{ email: string }>('/api/portal/me');
      if (!live) return;
      if (me.ok && me.data) { setEmail(me.data.email); setState('ready'); }
      else if (me.status === 503 || me.status === 0) setState('unavailable');
    })();
    return () => { live = false; };
  }, [api, attempt]);

  const signOut = async () => { await getClient()?.auth.signOut(); setState('signed-out'); };

  if (state === 'loading') return <main className="portal-center"><p>Checking access…</p></main>;
  if (state === 'unavailable') {
    return (
      <main className="portal-center">
        <h1>Operator portal</h1>
        <p>The portal isn’t set up on this copy of Ada Editor: it needs the Supabase settings and the contact secret. See the README.</p>
      </main>
    );
  }
  if (state === 'signed-out') {
    return (
      <SignInScreen
        title="Operator portal"
        lede="Sign in with the email address you were added with. We’ll email you a code."
        allowSignUp={false}
        onSignedIn={() => { setState('loading'); setAttempt((n) => n + 1); }}
      />
    );
  }
  if (state === 'not-operator') {
    return (
      <main className="portal-center">
        <h1>No access</h1>
        <p>This account isn’t on the operators list. Ask an operator to add it, or sign in with another address.</p>
        <Button variant="primary" onClick={() => void signOut()}>Sign out</Button>
      </main>
    );
  }
  return <OperatorContext.Provider value={{ email, api }}><Shell email={email} onSignOut={signOut}>{children}</Shell></OperatorContext.Provider>;
}

const NAV = [
  { href: '/portal', label: 'Overview' },
  { href: '/portal/messages', label: 'Messages' },
];

function Shell({ email, onSignOut, children }: { email: string; onSignOut: () => Promise<void>; children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="portal">
      <a href="#portal-main" className="portal-skip">Skip to content</a>
      <header className="portal-header">
        <p className="portal-brand"><span aria-hidden="true" className="portal-brand__mark">A</span>Operator portal</p>
        <nav aria-label="Portal">
          <ul>
            {NAV.map((n) => <li key={n.href}><Link href={n.href} aria-current={pathname === n.href ? 'page' : undefined}>{n.label}</Link></li>)}
          </ul>
        </nav>
        <div className="portal-user">
          <span>{email}</span>
          <Button variant="secondary" onClick={() => void onSignOut()}>Sign out</Button>
        </div>
      </header>
      <main id="portal-main" tabIndex={-1} className="portal-main">{children}</main>
    </div>
  );
}
