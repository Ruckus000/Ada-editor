'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Button, useAnnounce } from '../../design-system/primitives';
import { getClient } from '../_data/supabase';
import './signin.css';

type Mode = 'sign-in' | 'sign-up';
type Problem = { text: string; invalid: boolean; noAccount?: boolean };

/** Carries the typed address from "no account" on sign-in to the sign-up form,
 *  never through the URL. */
const CARRY = 'ada.signup.email';

/** What went wrong, in words a person can act on (Supabase error codes).
 *  `invalid` marks the field only when the input itself is the problem. */
function problemFor(error: { code?: string | undefined; message?: string } | null, step: 'email' | 'code', mode: Mode): Problem {
  const code = error?.code;
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return { text: 'Too many codes were requested. Wait a minute, then try again.', invalid: false };
  if (code === 'email_address_invalid' || code === 'validation_failed') return { text: 'Enter an email address like name@example.org.', invalid: true };
  // Sign-in never creates an account, so an unknown address is refused.
  // ponytail: this tells anyone whether an address has an account; the owner chose separate doors knowing that.
  if (mode === 'sign-in' && step === 'email' && (code === 'otp_disabled' || code === 'signup_disabled' || code === 'user_not_found' || /signups? not allowed/i.test(error?.message ?? ''))) {
    return { text: 'There’s no account for that email address.', invalid: true, noAccount: true };
  }
  if (step === 'code') return { text: 'That code didn’t work. It may have expired: send a new code and use the newest email.', invalid: true };
  return { text: 'The code couldn’t be sent. Check your connection and try again.', invalid: false };
}

const COPY = {
  'sign-in': {
    title: 'Welcome back.',
    lede: 'Sign in with a code we email you. There’s no password to remember.',
    send: 'Email me a code',
    finish: 'Sign in',
    finishing: 'Signing in…',
  },
  'sign-up': {
    title: 'Create your account',
    lede: 'We’ll email you a code to confirm the address is yours. If it already has an account, the code signs you in.',
    send: 'Create account',
    finish: 'Finish creating account',
    finishing: 'Creating account…',
  },
} as const;

/**
 * Two doors to one engine: sign-in (existing accounts only) and create
 * account. Email → one-time code → signed in, either way. A code rather than a
 * magic link: it can be read on a phone and typed on the computer doing the
 * work, and there is no redirect URL to configure for every preview deployment.
 */
export function SignInScreen({ mode = 'sign-in' }: { mode?: Mode }) {
  const router = useRouter();
  const announce = useAnnounce();
  const copy = COPY[mode];
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  // A ref, not the state: two quick submits both see a stale `busy` of false
  // and would send two codes (the second then reports a rate limit).
  const busyRef = useRef(false);
  // Read after mount, not via useSearchParams: that would opt the whole page
  // out of static rendering for one flag.
  const [deleted, setDeleted] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setDeleted(new URLSearchParams(window.location.search).has('deleted'));
    if (mode === 'sign-up') {
      try {
        const carried = sessionStorage.getItem(CARRY);
        sessionStorage.removeItem(CARRY);
        if (carried && emailRef.current && !emailRef.current.value) emailRef.current.value = carried;
      } catch { /* storage blocked: the field just starts empty */ }
    }
    // Already signed in ("Start writing" from a public page): straight to the desk.
    void getClient()?.auth.getSession().then(({ data }) => { if (data.session) router.replace('/'); });
  }, [router, mode]);

  const sendCode = async (address: string) => {
    const client = getClient();
    if (!client) { setError({ text: 'Sign-in isn’t set up on this copy of Ada Editor.', invalid: false }); return; }
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const { error: failed } = await client.auth.signInWithOtp({ email: address, options: { shouldCreateUser: mode === 'sign-up' } });
    busyRef.current = false;
    setBusy(false);
    if (failed) { setError(problemFor(failed, 'email', mode)); return; }
    setSentTo(address);
    setCode('');
    announce(`We sent a code to ${address}.`);
    requestAnimationFrame(() => codeRef.current?.focus());
  };

  const onEmail = (e: FormEvent) => {
    e.preventDefault();
    const address = (emailRef.current?.value ?? '').trim();
    setEmail(address); // kept, so "Use a different email" comes back filled in
    void sendCode(address);
  };

  const onCode = async (e: FormEvent) => {
    e.preventDefault();
    const client = getClient();
    if (!client || !sentTo || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const { error: failed } = await client.auth.verifyOtp({ email: sentTo, token: code.trim(), type: 'email' });
    busyRef.current = false;
    setBusy(false);
    if (failed) { setError(problemFor(failed, 'code', mode)); return; }
    announce('Signed in.');
    router.replace('/');
  };

  const changeEmail = () => {
    setSentTo(null);
    setError(null);
    requestAnimationFrame(() => emailRef.current?.focus());
  };

  const carryToSignUp = () => {
    try { sessionStorage.setItem(CARRY, (emailRef.current?.value ?? '').trim()); } catch { /* the form will just start empty */ }
  };

  const errorText = error ? (
    <p id="signin-error" className="signin__error" role="alert">
      {error.text}
      {error.noAccount ? <> <Link href="/sign-up" onClick={carryToSignUp}>Create an account with this email</Link></> : null}
    </p>
  ) : null;

  const form = sentTo === null ? (
    <form className="signin__form" onSubmit={onEmail} noValidate>
      {deleted ? <p className="signin__notice" role="status">Your account and its documents were deleted.</p> : null}
      <label className="signin__field">
        <span>Email address</span>
        <input
          ref={emailRef}
          type="email"
          autoComplete="email"
          required
          // Uncontrolled: the field renders before React hydrates, and a
          // controlled value would wipe whatever was typed in the meantime
          // (found by the e2e test). Deliberately no `name`: an Enter before
          // hydration submits natively, and must not put the address in the URL.
          defaultValue={email}
          aria-invalid={error?.invalid ?? false}
          {...(error ? { 'aria-describedby': 'signin-error' } : {})}
        />
      </label>
      {errorText}
      {mode === 'sign-up' ? (
        <p className="signin__fine">Your account holds your email address and your documents. <Link href="/privacy">How we handle your data</Link></p>
      ) : null}
      <Button type="submit" variant="primary">{busy ? 'Sending…' : copy.send}</Button>
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
      {errorText}
      <Button type="submit" variant="primary">{busy ? copy.finishing : copy.finish}</Button>
      <div className="signin__secondary">
        <Button variant="ghost" onClick={() => void sendCode(sentTo)}>Send a new code</Button>
        <Button variant="ghost" onClick={changeEmail}>Use a different email</Button>
      </div>
    </form>
  );

  return (
    <div className="signin" data-mode={mode}>
      <header className="signin__top">
        <Link href="/welcome" className="ada-brand"><span className="ada-brand__mark" aria-hidden="true">A</span>Ada Editor</Link>
      </header>
      <main className="signin__main">
        <div className="signin__sheet">
          <h1 className="signin__title">{copy.title}</h1>
          {sentTo === null ? <p className="signin__lede">{copy.lede}</p> : null}
          {form}
          <p className="signin__switch">
            {mode === 'sign-in'
              ? <>New to Ada Editor? <Link href="/sign-up">Create an account</Link></>
              : <>Already have an account? <Link href="/sign-in">Sign in</Link></>}
          </p>
        </div>
        {/* After the form in reading order (the task comes first); CSS places it beside. */}
        {mode === 'sign-up' ? (
          <section className="signin__pitch" aria-labelledby="signin-pitch">
            <h2 id="signin-pitch">Write documents everyone can read.</h2>
            <ul role="list">
              <li>Your documents are saved to your account and follow you between devices.</li>
              <li>Every finding names the WCAG 2.1 AA or Section 508 criterion it comes from.</li>
              <li>No password. Each time you sign in, we email you a code.</li>
            </ul>
          </section>
        ) : null}
      </main>
      <footer className="signin__foot">
        <Link href="/privacy">Privacy</Link>
        <Link href="/accessibility">Accessibility</Link>
      </footer>
    </div>
  );
}
