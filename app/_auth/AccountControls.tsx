'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Button, useAnnounce } from '../../design-system/primitives';
import { getClient, isCloud } from '../_data/supabase';
import { deleteAccount } from '../_data/sync';

/** The privacy page's account actions: a message to us, and account deletion.
 *  Accounts only exist in cloud mode; signed-out visitors are pointed to sign-in. */
export function AccountControls() {
  const announce = useAnnounce();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    void getClient()?.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
  }, []);

  if (!isCloud || signedIn === null) return null;
  if (!signedIn) {
    return <p><Link href="/sign-in">Sign in</Link> to send us a message or delete your account.</p>;
  }

  const onSend = async (e: FormEvent) => {
    e.preventDefault();
    const client = getClient();
    const text = message.trim();
    if (!client || busyRef.current) return;
    if (!text) { setSendError('Write a message first.'); return; }
    busyRef.current = true;
    setSendError(null);
    const { error } = await client.from('contact_messages').insert({ message: text });
    busyRef.current = false;
    if (error) { setSendError('Your message couldn’t be sent. Check your connection and try again.'); return; }
    setMessage('');
    setSent(true);
    announce('Message sent. We’ll reply to the email address you sign in with.');
  };

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
      <h2>Send us a message</h2>
      <form className="privacy__form" onSubmit={onSend} noValidate>
        <label className="privacy__field">
          <span>Your message</span>
          <textarea
            rows={5}
            maxLength={5000}
            value={message}
            aria-invalid={sendError === 'Write a message first.'}
            {...(sendError ? { 'aria-describedby': 'privacy-send-error' } : {})}
            onChange={(e) => { setMessage(e.target.value); setSent(false); }}
          />
        </label>
        <p className="privacy__hint">We reply to the email address you sign in with.</p>
        {sendError ? <p id="privacy-send-error" className="privacy__error" role="alert">{sendError}</p> : null}
        {sent ? <p className="privacy__ok">Message sent.</p> : null}
        <div><Button type="submit" variant="primary">Send message</Button></div>
      </form>

      <h2>Delete your account</h2>
      <p>This deletes your account and every document in it, straight away. It can’t be undone, so export anything you want to keep first.</p>
      {deleteError ? <p className="privacy__error" role="alert">{deleteError}</p> : null}
      <div><Button variant="secondary" onClick={() => void onDelete()}>Delete my account</Button></div>
    </>
  );
}
