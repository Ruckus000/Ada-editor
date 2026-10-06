'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { DisplayDialog } from '../_auth/DisplayDialog';
import { getClient, isCloud } from '../_data/supabase';

/**
 * The public header's controls. Display settings for everyone; then, as the
 * session lives in this browser's storage and the server can't see it, the
 * account links are settled after mount. Signed out: Sign in and Start
 * writing (to create an account). Signed in: the way back to the desk.
 * The pre-paint script marks <html data-session> when a session is stored,
 * and site.css hides the signed-out links until this island has checked, so
 * a signed-in visitor never sees "Sign in" flash past.
 */
export function SiteAccount() {
  const [signedIn, setSignedIn] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);
  useEffect(() => {
    const client = getClient();
    const settle = (yes: boolean) => {
      setSignedIn(yes);
      if (!yes) delete document.documentElement.dataset.session; // stored but expired
    };
    if (!client) { settle(false); return; }
    void client.auth.getSession().then(({ data }) => settle(Boolean(data.session)));
  }, []);
  return (
    <>
      <button type="button" className="site-header__display" onClick={() => setDisplayOpen(true)}>Display</button>
      {signedIn ? (
        <Link href="/" className="ada-button ada-button--primary">Your desk</Link>
      ) : (
        <span className="site-header__out">
          <Link href="/sign-in" className="site-header__signin">Sign in</Link>
          <Link href={isCloud ? '/sign-up' : '/'} className="ada-button ada-button--primary">Start writing</Link>
        </span>
      )}
      <DisplayDialog open={displayOpen} onClose={() => setDisplayOpen(false)} />
    </>
  );
}
