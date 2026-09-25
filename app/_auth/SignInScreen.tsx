'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Button, useAnnounce } from '../../design-system/primitives';
import { getClient } from '../_data/supabase';
import './signin.css';

type Problem = { text: string; invalid: boolean };

/** What went wrong, in words a person can act on (Supabase error codes).
 *  `invalid` marks the field only when the input itself is the problem. */
function problemFor(code: string | undefined, step: 'email' | 'code'): Problem {
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return { text: 'Too many codes were requested. Wait a minute, then try again.', invalid: false };
  if (code === 'email_address_invalid' || code === 'validation_failed') return { text: 'Enter an email address like name@example.org.', invalid: true };
  if (step === 'code') return { text: 'That code didn’t work. It may have expired: send a new code and use the newest email.', invalid: true };
  return { text: 'The code couldn’t be sent. Check your connection and try again.', invalid: false };
}

/**
 * Email → one-time code → signed in. A code rather than a magic link: it can
 * be read on a phone and typed on the computer doing the work, and there is no
 * redirect URL to configure for every preview deployment.
 */
export function SignInScreen() {
  const router = useRouter();
  const announce = useAnnounce();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const sendCode = async (address: string) => {
    const client = getClient();
    if (!client) { setError({ text: 'Sign-in isn’t set up on this copy of Ada Editor.', invalid: false }); return; }
    if (busy) return;
    setBusy(true);
    setError(null);
    const { error: failed } = await client.auth.signInWithOtp({ email: address, options: { shouldCreateUser: true } });
    setBusy(false);
    if (failed) { setError(problemFor(failed.code, 'email')); return; }
    setSentTo(address);
    setCode('');
    announce(`We sent a sign-in code to ${address}.`);
    requestAnimationFrame(() => codeRef.current?.focus());
  };

  const onEmail = (e: FormEvent) => { e.preventDefault(); void sendCode(email.trim()); };

  const onCode = async (e: FormEvent) => {
    e.preventDefault();
    const client = getClient();
    if (!client || !sentTo || busy) return;
    setBusy(true);
    setError(null);
    const { error: failed } = await client.auth.verifyOtp({ email: sentTo, token: code.trim(), type: 'email' });
    setBusy(false);
    if (failed) { setError(problemFor(failed.code, 'code')); return; }
    announce('Signed in.');
    router.replace('/');
  };

  const changeEmail = () => {
    setSentTo(null);
    setError(null);
    requestAnimationFrame(() => emailRef.current?.focus());
  };

  return (
    <main className="signin">
      <h1 className="signin__title">Sign in to Ada Editor</h1>
      {sentTo === null ? (
        <form className="signin__form" onSubmit={onEmail} noValidate>
          <p className="signin__lede">We’ll email you a code. No password needed; your documents are saved to your account.</p>
          <label className="signin__field">
            <span>Email address</span>
            <input
              ref={emailRef}
              type="email"
              autoComplete="email"
              required
              value={email}
              aria-invalid={error?.invalid ?? false}
              {...(error ? { 'aria-describedby': 'signin-error' } : {})}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {error ? <p id="signin-error" className="signin__error" role="alert">{error.text}</p> : null}
          <Button type="submit" variant="primary">{busy ? 'Sending…' : 'Email me a code'}</Button>
        </form>
      ) : (
        <form className="signin__form" onSubmit={onCode} noValidate>
          <p className="signin__lede">Enter the code we sent to <strong>{sentTo}</strong>.</p>
          <label className="signin__field">
            <span>Code from the email</span>
            <input
              ref={codeRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              maxLength={10}
              value={code}
              aria-invalid={error?.invalid ?? false}
              {...(error ? { 'aria-describedby': 'signin-error' } : {})}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          {error ? <p id="signin-error" className="signin__error" role="alert">{error.text}</p> : null}
          <Button type="submit" variant="primary">{busy ? 'Signing in…' : 'Sign in'}</Button>
          <div className="signin__secondary">
            <Button variant="ghost" onClick={() => void sendCode(sentTo)}>Send a new code</Button>
            <Button variant="ghost" onClick={changeEmail}>Use a different email</Button>
          </div>
        </form>
      )}
    </main>
  );
}
