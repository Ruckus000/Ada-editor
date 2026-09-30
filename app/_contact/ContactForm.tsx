'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Button, useAnnounce } from '../../design-system/primitives';
import { getClient } from '../_data/supabase';
import { MAX_MESSAGE, TRAP, checkEmail, checkMessage } from './rules';
import { solve } from './solve';

type Proof = { challenge: string; nonce: string } | { unavailable: true };
type Problem = { text: string; field?: 'email' | 'message' | undefined };

/** Solves in a worker, so typing never lags; on the main thread if workers
 *  aren't available. Terminated if the page goes away first. */
function solveInBackground(challenge: string, bits: number, cancelled: () => boolean): Promise<string | null> {
  let worker: Worker;
  try { worker = new Worker(new URL('./pow.worker.ts', import.meta.url)); } catch { return solve(challenge, bits, cancelled); }
  return new Promise((resolve) => {
    const stop = setInterval(() => { if (cancelled()) { worker.terminate(); clearInterval(stop); resolve(null); } }, 500);
    worker.onmessage = (e: MessageEvent<string | null>) => { worker.terminate(); clearInterval(stop); resolve(e.data); };
    worker.onerror = () => { worker.terminate(); clearInterval(stop); resolve(solve(challenge, bits, cancelled)); };
    worker.postMessage({ challenge, bits });
  });
}

/** Fetches a challenge (its difficulty follows the traffic) and solves it in
 *  the background, while the sender types. */
function prepare(cancelled: () => boolean): Promise<Proof | null> {
  return (async () => {
    const res = await fetch('/api/contact/challenge', { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) return { unavailable: true } as const;
    const { challenge, bits } = (await res.json()) as { challenge: string; bits: number };
    const nonce = await solveInBackground(challenge, bits, cancelled);
    return nonce === null ? null : { challenge, nonce };
  })();
}

/**
 * The public contact form. Anyone can send; a signed-in sender's reply-to is
 * their account email (shown, not typed), and the message stays tied to the
 * account. Spam checks a person never sees: a trap field, a proof-of-work
 * puzzle solved while they type, and the server's time and rate limits.
 */
export function ContactForm() {
  const id = useId();
  const announce = useAnnounce();
  const [account, setAccount] = useState<{ email: string; token: string } | null>(null);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [trap, setTrap] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [slow, setSlow] = useState(false);
  const proof = useRef<Promise<Proof | null> | null>(null);
  const live = useRef(true);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    live.current = true;
    proof.current = prepare(() => !live.current);
    const client = getClient();
    if (client) {
      void client.auth.getSession().then(({ data }) => {
        const s = data.session;
        if (live.current && s?.user.email) setAccount({ email: s.user.email, token: s.access_token });
      });
    }
    return () => { live.current = false; };
  }, []);

  useEffect(() => { if (problem && !problem.field) errorRef.current?.focus(); }, [problem]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setSent(false);
    const local = checkMessage(message) ? { text: checkMessage(message)!, field: 'message' as const }
      : !account && checkEmail(email) ? { text: checkEmail(email)!, field: 'email' as const } : null;
    if (local) { setProblem(local); document.getElementById(`${id}-${local.field}`)?.focus(); return; }

    setBusy(true);
    setProblem(null);
    // On a busy day the spam puzzle is harder; say so if it's still running.
    const slowTimer = setTimeout(() => { setSlow(true); announce('Still checking your message. This can take a little while when we’re busy.'); }, 1500);
    try {
      const p = await proof.current;
      clearTimeout(slowTimer);
      setSlow(false);
      if (!p || 'unavailable' in p) { setProblem({ text: 'Messages aren’t set up on this copy of Ada Editor.' }); return; }
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(account ? { Authorization: `Bearer ${account.token}` } : {}) },
        body: JSON.stringify({ email: account ? undefined : email, message, challenge: p.challenge, nonce: p.nonce, [TRAP]: trap }),
      }).catch(() => null);
      // A challenge is spent once: solve a fresh one for any next message.
      proof.current = prepare(() => !live.current);
      const out = res ? ((await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; field?: 'email' | 'message' }) : {};
      if (!res || !out.ok) {
        const next = { text: out.error ?? 'Your message couldn’t be sent. Check your connection and try again.', field: out.field };
        setProblem(next);
        if (next.field) document.getElementById(`${id}-${next.field}`)?.focus();
        return;
      }
      setMessage('');
      setSent(true);
      announce('Message sent. Thank you.');
    } finally {
      clearTimeout(slowTimer);
      if (live.current) { setBusy(false); setSlow(false); }
    }
  };

  const invalid = (f: 'email' | 'message') => problem?.field === f;
  const describe = (f: 'email' | 'message', hint?: string) =>
    [hint, invalid(f) ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;

  return (
    <form className="contact-form" onSubmit={onSubmit} noValidate>
      {problem && !problem.field ? (
        <p id={`${id}-error`} ref={errorRef} tabIndex={-1} className="contact-error" role="alert">{problem.text}</p>
      ) : null}

      {account ? (
        <p className="contact-hint">We’ll reply to <strong>{account.email}</strong>, the address you signed in with.</p>
      ) : (
        <div className="contact-field">
          <label htmlFor={`${id}-email`}>Your email address</label>
          <p id={`${id}-email-hint`} className="contact-hint">So we can reply. We don’t use it for anything else.</p>
          <input
            id={`${id}-email`}
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            aria-invalid={invalid('email') || undefined}
            aria-describedby={describe('email', `${id}-email-hint`)}
            onChange={(e) => { setEmail(e.target.value); setSent(false); }}
          />
          {invalid('email') ? <p id={`${id}-error`} className="contact-error" role="alert">{problem!.text}</p> : null}
        </div>
      )}

      <div className="contact-field">
        <label htmlFor={`${id}-message`}>Your message</label>
        <p id={`${id}-message-hint`} className="contact-hint">Reporting a barrier? Say what you were trying to do and what you use to browse.</p>
        <textarea
          id={`${id}-message`}
          rows={6}
          maxLength={MAX_MESSAGE}
          value={message}
          aria-invalid={invalid('message') || undefined}
          aria-describedby={describe('message', `${id}-message-hint`)}
          onChange={(e) => { setMessage(e.target.value); setSent(false); }}
        />
        {invalid('message') ? <p id={`${id}-error`} className="contact-error" role="alert">{problem!.text}</p> : null}
      </div>

      {/* Hidden from people and assistive tech alike; only bots fill it in. */}
      <div className="contact-trap" aria-hidden="true">
        <label htmlFor={`${id}-${TRAP}`}>Leave this empty</label>
        <input id={`${id}-${TRAP}`} name={TRAP} type="text" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
      </div>

      <div className="contact-actions">
        <Button type="submit" variant="primary" aria-disabled={busy || undefined}>{busy ? 'Sending…' : 'Send message'}</Button>
        {sent ? <p className="contact-sent">Message sent. Thank you.</p> : null}
        {slow ? <p className="contact-hint">Still checking your message. This can take a little while when we’re busy.</p> : null}
      </div>
    </form>
  );
}
