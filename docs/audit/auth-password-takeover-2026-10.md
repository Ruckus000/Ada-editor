# Account takeover through a pre-set password, October 2026

**The question:** the sign-in and welcome emails tell a recipient "Nobody can sign in to your account without it" / "Nobody can use this address without the code". Ada Editor only ever signs people in with an emailed code (`app/_auth/SignInScreen.tsx` uses `signInWithOtp` / `verifyOtp`; there is no password field). Is the promise true?

**What I looked at:**
- Every sign-in path in the app. There is one: request a code, then verify it. No password grant, no social provider.
- Supabase's auth server (GoTrue), the version production runs: `v2.197.0`, read from `/auth/v1/health` on the live project. Its `signup`, `magic_link` and `verify` source for how it treats a sign-up with a password, and what confirming a code does to an existing user.
- Production's public auth settings (`/auth/v1/settings`): email is the only provider, email confirmation is on, codes are 8 digits.
- A throwaway stack — its own Postgres, GoTrue `v2.197.0`, and a mail catcher, on their own Docker network, isolated from the project's stacks — configured to match production, driven only through the public auth API.

## The one-line verdict

**The promise was false: someone could register an address with a password of their choosing before its owner did, and once the owner confirmed with a code, that password opened the owner's account. The fix stores no password on any account, so the only way in stays the emailed code. Reproduced before the fix, and shown closed after it.**

## What happens

Supabase's email provider accepts a password at `/auth/v1/signup` and `/token?grant_type=password`. There is no setting that turns that off without also turning off the code sign-in the app relies on, so the app being "code only" is a UI fact, not a server one.

1. An attacker `POST /signup` with the victim's email and a password they pick. GoTrue makes an **unconfirmed** user holding that password, and the victim gets a welcome email they didn't ask for.
2. The victim later signs up for real and gets a code. GoTrue finds the unconfirmed user and keeps it — a comment in `signup.go` says it won't update a user whose claimed identity it can't be sure of — so the attacker's password survives.
3. The victim enters the code. Confirming doesn't clear a password: `signupVerify` sets one only for *invited* users that have none.
4. The attacker signs in with their password and lands in the victim's account. No code, no operator tools.

## The reproduction

`auth-password-takeover-2026-10/repro.mjs` runs the four steps against the throwaway stack, plus a control that skips step 1. `output-before-fix.txt` and `output-after-fix.txt` are the captured runs.

- **Before the fix:** step 4 returned a session as the victim's user; the control could not be signed into with a password.
- **After the fix:** step 4 returned `invalid_credentials`, before and after the victim confirmed; a normal code sign-in still worked (`otp-ok.mjs`, `output-otp-ok.txt`), and a password grant for that legitimate user was refused.

## The fix

`supabase/migrations/20261013120000_otp_only_no_password.sql`: a `before insert or update` trigger on `auth.users` that nulls `encrypted_password`, plus a one-time backfill. The app never uses a password, so a password that is never stored costs nothing and can't be used to sign in. The code flow is untouched, which the after-fix run confirms end to end.

The trigger function lives in `public`, not `auth`: on hosted Supabase `postgres` can create it there, and it is granted to `supabase_auth_admin` so GoTrue can run it when it writes a user.

## What it rests on, and what would change it

- The threat is the pre-registration window, not the operator. The operator can still mint a session for any account through Supabase's admin API — the same disclosed operator access the privacy page's "no other account" wording accounts for. The emails were reworded from "Nobody" to "Whoever asked for it / started it" to say what's true: the person who triggered the email can't get in without the code, which goes to the address's own inbox.
- If Supabase ever adds a per-method switch to disable password sign-in while keeping email codes, that switch would be the smaller fix and this trigger could go.
- If the app ever grows a real password feature, this trigger must go with it; the migration comment and this note are the trail.

## To apply it in production

- The migration isn't applied to the hosted project on merge (the Supabase preview check skips). The owner runs it against production through their Supabase connector or the dashboard.
- The two email templates are pasted into the Supabase dashboard by hand (Magic link and Confirm signup). The reworded files have to be pasted again for the new wording to reach a real email.
