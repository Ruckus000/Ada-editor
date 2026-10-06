'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getClient, isCloud } from '../_data/supabase';

/**
 * The public header's account links. The session lives in this browser's
 * storage, so the server can't know who is signed in: this island asks after
 * mount. Signed out: Sign in and Start writing (to create an account).
 * Signed in: the way back to the desk.
 * ponytail: signed-out links show for a moment before a signed-in visitor's
 * swap in; a pre-paint hint from storage removes that flash when needed.
 */
export function SiteAccount() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    void getClient()?.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
  }, []);
  if (signedIn) return <Link href="/" className="ada-button ada-button--primary">Your desk</Link>;
  return (
    <>
      <Link href="/sign-in" className="site-header__signin">Sign in</Link>
      <Link href={isCloud ? '/sign-up' : '/'} className="ada-button ada-button--primary">Start writing</Link>
    </>
  );
}
