'use client';

import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '../../design-system/primitives';
import { useOperator } from './PortalGate';
import { untagged } from './types';
import type { Message, Reply } from './types';

/** Mirrors the server: the adaedit.com address they wrote to, untagged. */
const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.toLowerCase();
const fromAddress = (m: Message) => {
  const domain = CONTACT?.split('@')[1];
  const to = domain ? m.to_address?.split(',').map(untagged).find((a) => a.endsWith(`@${domain}`)) : undefined;
  return to ?? CONTACT ?? 'the contact address';
};

/**
 * Write and send a reply by email, from the address they wrote to. Their
 * answer comes back into the portal as a follow-up. Plain text: what you
 * type is what they get, with their message quoted below it.
 */
export function ReplyBox({ message, onSent, onCancel }: { message: Message; onSent: (reply: Reply, handled: boolean) => void; onCancel: () => void }) {
  const { api } = useOperator();
  const id = useId();
  const [text, setText] = useState('');
  const [handled, setHandled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!text.trim()) { setError('Write a reply first.'); field.current?.focus(); return; }
    setBusy(true);
    setError(null);
    const r = await api<{ reply: Reply; error?: string }>(`/api/portal/messages/${message.id}/reply`, { method: 'POST', body: JSON.stringify({ body: text, keepOpen: !handled }) });
    setBusy(false);
    if (!r.ok || !r.data) {
      setError(r.status === 503 ? 'Replies aren’t set up yet: the portal needs RESEND_API_KEY and NEXT_PUBLIC_CONTACT_EMAIL.' : r.status === 502 ? 'The reply couldn’t be sent. Try again in a minute.' : 'The reply couldn’t be sent.');
      field.current?.focus();
      return;
    }
    onSent(r.data.reply, handled);
  };

  return (
    <form className="portal-reply" onSubmit={send} noValidate>
      <label htmlFor={`${id}-body`}>Reply to {message.email}</label>
      <p id={`${id}-hint`} className="portal-reply__hint">Sent from {fromAddress(message)}. Their message is quoted below your reply; their answer comes back here.</p>
      <textarea
        id={`${id}-body`}
        ref={field}
        rows={6}
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-invalid={error === 'Write a reply first.' || undefined}
        aria-describedby={[`${id}-hint`, error ? `${id}-error` : ''].filter(Boolean).join(' ')}
      />
      <label className="portal-reply__check">
        <input type="checkbox" checked={handled} onChange={(e) => setHandled(e.target.checked)} /> Mark handled after sending
      </label>
      {error ? <p id={`${id}-error`} role="alert" className="portal-error">{error}</p> : null}
      <div className="portal-actions">
        <Button type="submit" variant="primary" aria-disabled={busy || undefined}>{busy ? 'Sending…' : 'Send reply'}</Button>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
