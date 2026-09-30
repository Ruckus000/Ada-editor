-- The contact page (/contact) takes messages from anyone, signed in or not,
-- through the app's server route (app/api/contact/route.ts), the only writer
-- (20261001140000 closes the old direct path):
--
--   * signed in: the account and its email come from the sender's verified
--     token, so the message still goes when the account is deleted;
--   * not signed in: the reply-to address the sender typed and no account.
--     Kept until we delete them by hand (the privacy notice says so).
--
-- A flood must never lock real people out, so suspicious messages are held,
-- not refused: stored with status 'held' and the reason, for review in the
-- Table Editor (filter status = held). Only past hard limits a person never
-- reaches is anything refused. Nothing here is reachable by anon or
-- authenticated: only the server (service_role).

alter table public.contact_messages
  add column status text not null default 'open' check (status in ('open', 'held')),
  add column held_reason text,
  -- An anonymous message's reply-to address is typed, so hold it to a shape.
  add constraint contact_messages_email_shape
    check (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') not valid;
create index contact_messages_held_idx on public.contact_messages (created_at) where status = 'held';

-- Recent sends, for limits and for the puzzle's difficulty. Addresses are
-- never stored: ip_hash and net_hash are HMACs, under a server secret, of the
-- address and of its network (IPv4 /24, IPv6 /56), so a rented block of
-- addresses shares one budget. Rows live for a day. Each challenge (the proof
-- of work the form solved) can be spent once.
create table public.contact_attempts (
  id         bigint      generated always as identity primary key,
  ip_hash    text        not null,
  net_hash   text        not null,
  challenge  text        not null unique,
  created_at timestamptz not null default now()
);
create index contact_attempts_ip_idx on public.contact_attempts (ip_hash, created_at);
create index contact_attempts_net_idx on public.contact_attempts (net_hash, created_at);
create index contact_attempts_created_idx on public.contact_attempts (created_at);

alter table public.contact_attempts enable row level security;
revoke all on public.contact_attempts from public, anon, authenticated;

-- How hard the next puzzle is: `base` bits normally, one more for each
-- doubling of the last ten minutes' traffic past `calm` sends, and two more
-- when the requester's own network is busy. Capped at `max`. At base a
-- browser solves it in well under a second; each bit doubles the work.
create function public.contact_bits(p_net_hash text, p_base int, p_max int, p_calm int, p_net_busy int)
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  recent int := (select count(*) from public.contact_attempts where created_at > now() - interval '10 minutes');
  mine   int := (select count(*) from public.contact_attempts where net_hash = p_net_hash and created_at > now() - interval '1 hour');
  bits   int := p_base;
begin
  if recent > p_calm then bits := bits + floor(log(2::numeric, recent::numeric / p_calm))::int + 1; end if;
  if mine >= p_net_busy then bits := bits + 2; end if;
  return least(bits, p_max);
end;
$$;

-- Records one attempt and decides it. In order:
--   'replay'  the challenge was already spent             -> refused
--   'refuse'  this address is far past anything a person
--             sends, or the held list is full for the day  -> refused
--   'held:ip' | 'held:net' | 'held:flood'                  -> stored, held
--   'open'                                                 -> stored
-- Serialised with an advisory lock so concurrent sends can't both slip under
-- a limit.
create function public.contact_gate(
  p_ip_hash text, p_net_hash text, p_challenge text,
  p_ip_soft int, p_ip_hard int, p_net_soft int, p_total_soft int, p_held_per_day int
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  ip_n int; net_n int; total_n int;
begin
  perform pg_advisory_xact_lock(hashtext('contact_gate'));
  delete from public.contact_attempts where created_at < now() - interval '1 day';
  if exists (select 1 from public.contact_attempts where challenge = p_challenge) then
    return 'replay';
  end if;
  insert into public.contact_attempts (ip_hash, net_hash, challenge) values (p_ip_hash, p_net_hash, p_challenge);
  select count(*) filter (where ip_hash = p_ip_hash),
         count(*) filter (where net_hash = p_net_hash),
         count(*)
    into ip_n, net_n, total_n
    from public.contact_attempts where created_at > now() - interval '1 hour';
  if ip_n > p_ip_hard then return 'refuse'; end if;
  if ip_n > p_ip_soft or net_n > p_net_soft or total_n > p_total_soft then
    if (select count(*) from public.contact_messages
        where status = 'held' and created_at > now() - interval '1 day') >= p_held_per_day then
      return 'refuse';
    end if;
    return case when ip_n > p_ip_soft then 'held:ip' when net_n > p_net_soft then 'held:net' else 'held:flood' end;
  end if;
  return 'open';
end;
$$;

revoke execute on function public.contact_bits(text, int, int, int, int) from public, anon, authenticated;
revoke execute on function public.contact_gate(text, text, text, int, int, int, int, int) from public, anon, authenticated;
grant execute on function public.contact_bits(text, int, int, int, int) to service_role;
grant execute on function public.contact_gate(text, text, text, int, int, int, int, int) to service_role;
