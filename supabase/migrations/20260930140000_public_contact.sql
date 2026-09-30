-- The contact page (/contact) takes messages from anyone, signed in or not,
-- through the app's server route (app/api/contact/route.ts):
--
--   * signed in: inserted as the sender, under the existing policy, so the
--     account and its email still come from the JWT and still go when the
--     account is deleted;
--   * not signed in: inserted by the server with the service role, carrying
--     the reply-to address the sender typed and no account. Kept until we
--     delete them by hand (the privacy notice says so).
--
-- Either way the route first calls contact_allow() below. Nothing here is
-- reachable by anon or authenticated: only the server (service_role) holds it.

-- An anonymous message's reply-to address is typed, so hold it to a shape.
alter table public.contact_messages
  add constraint contact_messages_email_shape
    check (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') not valid;

-- Rate limiting. The sender's IP is never stored: ip_hash is an HMAC of it
-- under a server-side secret. Rows live for a day, and each challenge (the
-- proof-of-work token the form solved) can be spent once.
create table public.contact_attempts (
  id         bigint      generated always as identity primary key,
  ip_hash    text        not null,
  challenge  text        not null unique,
  created_at timestamptz not null default now()
);
create index contact_attempts_ip_idx on public.contact_attempts (ip_hash, created_at);
create index contact_attempts_created_idx on public.contact_attempts (created_at);

alter table public.contact_attempts enable row level security;
revoke all on public.contact_attempts from public, anon, authenticated;

-- Records one attempt and says whether it may proceed:
--   'ok' | 'replay' (challenge already spent) | 'ip' (this sender, per hour)
--   | 'busy' (everyone, per hour: a flood can't fill the table)
-- Serialised with an advisory lock so concurrent sends can't both slip under
-- a limit.
create function public.contact_allow(p_ip_hash text, p_challenge text, p_per_ip int, p_total int)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('contact_allow'));
  delete from public.contact_attempts where created_at < now() - interval '1 day';
  if exists (select 1 from public.contact_attempts where challenge = p_challenge) then
    return 'replay';
  end if;
  if (select count(*) from public.contact_attempts where created_at > now() - interval '1 hour') >= p_total then
    return 'busy';
  end if;
  insert into public.contact_attempts (ip_hash, challenge) values (p_ip_hash, p_challenge);
  if (select count(*) from public.contact_attempts
      where ip_hash = p_ip_hash and created_at > now() - interval '1 hour') > p_per_ip then
    return 'ip';
  end if;
  return 'ok';
end;
$$;

revoke execute on function public.contact_allow(text, text, int, int) from public, anon, authenticated;
grant execute on function public.contact_allow(text, text, int, int) to service_role;
