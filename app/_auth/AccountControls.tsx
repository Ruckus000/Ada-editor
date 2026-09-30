'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../design-system/primitives';
import { getClient, isCloud } from '../_data/supabase';
import { deleteAccount } from '../_data/sync';

/** The privacy page's account action: account deletion. (Messages to us moved
 *  to /contact, which needs no account.) Accounts only exist in cloud mode;
 *  signed-out visitors are pointed to sign-in. */
export function AccountControls() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    void getClient()?.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
  }, []);

  if (!isCloud || signedIn === null) return null;
  if (!signedIn) {
    return <p><Link href="/sign-in">Sign in</Link> to delete your account.</p>;
  }

  const onDelete = async () => {
    if (busyRef.current) return;
    if (!window.confirm('Delete your account and every document in it? This can’t be undone.')) return;
    busyRef.current = true;
    setDeleteError(null);
    const done = await deleteAccount();
    busyRef.current = false;
    if (!done) { setDeleteError('Your account couldn’t be deleted. Check your connection and try again.'); return; }
    window.location.assign('/sign-in?deleted=1');
  };

  return (
    <>
      <h2>Delete your account</h2>
      <p>This deletes your account, every document in it and any messages you sent us while signed in, straight away. It can’t be undone, so export anything you want to keep first.</p>
      {deleteError ? <p className="privacy__error" role="alert">{deleteError}</p> : null}
      <div><Button variant="secondary" onClick={() => void onDelete()}>Delete my account</Button></div>
    </>
  );
}
