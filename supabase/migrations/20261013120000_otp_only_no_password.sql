-- Ada Editor signs in only with an emailed one-time code (app/_auth/SignInScreen.tsx
-- uses signInWithOtp / verifyOtp; there is no password field anywhere). Supabase's
-- email provider still accepts a password at /auth/v1/signup and at
-- /token?grant_type=password, and that can't be turned off on its own without also
-- turning off the code sign-in we rely on.
--
-- That lets someone claim an address before its owner does. A POST /signup with the
-- owner's email and a password of the attacker's choosing makes an unconfirmed user
-- holding that password; when the real owner later signs up and confirms with a
-- code, GoTrue keeps the existing row and its password (signupVerify sets a password
-- only for invited users that have none), so the attacker's password now opens the
-- owner's account. Reproduced against GoTrue v2.197.0 with production's settings
-- (email the only provider, email confirmation on, 8-digit codes): the attacker got
-- a session as the owner. Evidence: docs/audit/auth-password-takeover-2026-10/.
--
-- Since the app never uses passwords, keep accounts from carrying one at all. A
-- password that is never stored can't be used to sign in, which closes the hole
-- without touching the code flow: verifyOtp doesn't look at a password, and a new
-- code user's signup doesn't need the random one GoTrue would otherwise store.
create function public.strip_password()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Fires for every insert and update of a user, so neither a /signup password nor
  -- a later admin password change is ever persisted.
  new.encrypted_password := null;
  return new;
end
$$;

-- GoTrue writes auth.users as supabase_auth_admin, so that role must be able to run
-- the trigger. The function lives in public (postgres can create it there on hosted
-- Supabase too, unlike the auth schema) and runs SECURITY DEFINER as its owner.
grant execute on function public.strip_password() to supabase_auth_admin;

create trigger strip_password
before insert or update on auth.users
for each row
execute function public.strip_password();

-- Clear any password stored before this trigger existed: a pre-registration attempt,
-- or the random one GoTrue writes for a code user.
update auth.users set encrypted_password = null where encrypted_password is not null;
