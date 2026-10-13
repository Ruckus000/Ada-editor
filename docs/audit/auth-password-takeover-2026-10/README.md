# Evidence: pre-registration account takeover

How the finding in [../auth-password-takeover-2026-10.md](../auth-password-takeover-2026-10.md) was reproduced, and how the fix was shown to close it.

## The throwaway stack

`up.sh` starts, on their own Docker network, isolated from the project's own stacks:
- Postgres (`supabase/postgres`),
- GoTrue `v2.197.0` — the version production's `/auth/v1/health` reports — with production's shape: email the only provider, email confirmation on (`GOTRUE_MAILER_AUTOCONFIRM=false`), 8-digit codes,
- Mailpit, to read the codes.

The repo's two email templates (`supabase/templates/*.html`) were mounted so the code appears in the mail body as it does in production. Nothing here touches the real Supabase project; the scripts talk only to the local auth API on `127.0.0.1:54890` and the local mail API on `127.0.0.1:54891`.

## The scripts

- `repro.mjs` — the four-step takeover (attacker registers the address with a password, owner signs up and confirms with a code, attacker signs in with the password), plus a control that skips the attacker. Run it with the fix absent, then present.
- `otp-ok.mjs` — a normal person signs in with a code after the fix, and a password grant for that same account is refused.

## The captured runs

- `output-before-fix.txt` — trigger absent: **takeover REPRODUCED**; the control cannot be signed into with a password.
- `output-after-fix.txt` — trigger present: **takeover blocked** (the attacker's password is refused before and after the owner confirms); the owner still signs in with the code.
- `output-otp-ok.txt` — OTP sign-in works after the fix; the password grant is refused.

User ids in the output are random per run, so they differ between captures.
