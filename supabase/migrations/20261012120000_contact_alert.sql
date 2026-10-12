-- Email the owner when a message arrives (the gap 20260928160000_privacy.sql
-- left open). The email only says a message is waiting: no text, no sender.
-- A copy in an inbox would outlive account deletion, which the privacy page
-- promises removes messages straight away, and pg_net keeps what it sends in
-- net.http_request_queue and net._http_response.
--
-- Off until both Vault secrets exist (none locally or in CI). In the SQL editor:
--   select vault.create_secret('<send-only Resend key>', 'contact_alert_resend_key');
--   select vault.create_secret('<owner inbox>', 'contact_alert_to');
create extension if not exists pg_net with schema extensions;

-- SECURITY DEFINER to read the Vault; it runs only as the trigger below.
create function public.alert_new_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  api_key text := (select decrypted_secret from vault.decrypted_secrets where name = 'contact_alert_resend_key');
  recipient text := (select decrypted_secret from vault.decrypted_secrets where name = 'contact_alert_to');
begin
  if api_key is null or recipient is null then return null; end if;
  -- At most 10 alerts a day: sign-in codes share the Resend quota, so a script
  -- sending messages mustn't be able to use it up.
  if (select count(*) from public.contact_messages
      where created_at > now() - interval '1 day' and id <> new.id) >= 10 then
    return null;
  end if;
  -- Queued now, sent after commit: a Resend failure never fails the message.
  perform net.http_post(
    url := 'https://api.resend.com/emails',
    body := jsonb_build_object(
      'from', 'Ada Editor <messages@adaedit.com>',
      'to', recipient,
      'subject', 'New message on Ada Editor',
      'text', 'Someone sent a message from the privacy page. Read it, and the address to reply to, in the contact_messages table: https://supabase.com/dashboard/project/ntpdjeotlogjuphpcwyk/editor'
    ),
    headers := jsonb_build_object('Authorization', 'Bearer ' || api_key, 'Content-Type', 'application/json')
  );
  return null;
end;
$$;

revoke execute on function public.alert_new_message() from public, anon, authenticated;

create trigger alert_new_message
  after insert on public.contact_messages
  for each row execute function public.alert_new_message();
