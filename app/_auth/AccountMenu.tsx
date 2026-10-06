'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Popover } from '../../design-system/primitives';
import { isCloud } from '../_data/supabase';
import { signOut } from '../_data/sync';
import { DisplayDialog } from './DisplayDialog';

/** The account menu on the desk and in the editor: display settings, privacy, sign out. */
export function AccountMenu({ className, buttonClassName }: { className?: string | undefined; buttonClassName?: string | undefined }) {
  const router = useRouter();
  const [displayOpen, setDisplayOpen] = useState(false);
  // Edits that never reached the server would be lost with the cache, so ask.
  const onSignOut = async () => {
    const done = await signOut(() => window.confirm('Some changes haven’t reached your account yet. If you sign out now, they will be lost. Sign out anyway?'));
    if (done) router.replace('/sign-in');
  };
  return (
    <>
      <Popover
        label="Account"
        className={className}
        buttonClassName={buttonClassName}
        icon={<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="8.5" r="3.5" /><path d="M5 19.5c1.2-3.2 4-5 7-5s5.8 1.8 7 5" /></svg>}
      >
        <li><button type="button" className="ada-pop__item" onClick={() => setDisplayOpen(true)}>Display</button></li>
        <li><Link href="/privacy" className="ada-pop__item">Privacy</Link></li>
        {isCloud
          ? <li><button type="button" className="ada-pop__item" onClick={() => void onSignOut()}>Sign out</button></li>
          // Local mode has no account to leave: say so, rather than leave people hunting for Sign out.
          : <li className="ada-pop__note">No account on this copy of Ada Editor. Documents are kept in this browser only.</li>}
      </Popover>
      <DisplayDialog open={displayOpen} onClose={() => setDisplayOpen(false)} />
    </>
  );
}
