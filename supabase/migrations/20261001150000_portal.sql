-- The operator portal (portal.adaedit.com): messages from the contact form
-- and from email to anything@adaedit.com (via Resend receiving), triaged in
-- one list; cookie-free visit counts for the public pages; and the daily
-- alert / weekly report bookkeeping. Every table here is server-only: the
-- portal's API routes check the operator allowlist, then use the service role.

-- Operators: the allowlist. Add yourself with
--   insert into public.operators (email) values ('you@example.org');
-- The address must be the one you sign in with.
create table public.operators (
  email    text primary key check (email = lower(email)),
  added_at timestamptz not null default now()
);
alter table public.operators enable row level security;
revoke all on public.operators from public, anon, authenticated;

-- Messages: where each came from, and what an operator did with it.
alter table public.contact_messages
  add column source text not null default 'form' check (source in ('form', 'email')),
  add column to_address text,
  add column subject text,
  add column resend_email_id text unique,
  add column handled_at timestamptz;
create index contact_messages_triage_idx on public.contact_messages (status, handled_at, created_at desc);

-- Visits to the public pages (/, /accessibility, /privacy, /contact), never
-- inside the app. No cookies and no addresses: `visitor` is an HMAC of the
-- address and browser under a key that changes every day, so one person is
-- one visitor for a day and can't be followed from one day to the next.
-- Country comes from the host's IP geolocation header. Kept 13 months.
create table public.page_views (
  id            bigint      generated always as identity primary key,
  at            timestamptz not null default now(),
  day           date        not null default (now() at time zone 'utc')::date,
  path          text        not null check (char_length(path) <= 200),
  referrer_host text        check (char_length(referrer_host) <= 253),
  device        text        not null check (device in ('desktop', 'mobile', 'tablet')),
  country       text        check (char_length(country) = 2),
  visitor       text        not null
);
create index page_views_day_idx on public.page_views (day);
alter table public.page_views enable row level security;
revoke all on public.page_views from public, anon, authenticated;

-- The key behind `visitor`: random, one per day, deleted after two days, so
-- once a day is over nobody (us included, secret or no secret) can recompute
-- or link its visitor hashes. visit_salt() hands out today's, creating it on
-- first use.
create table public.visit_salts (
  day  date primary key,
  salt text not null
);
alter table public.visit_salts enable row level security;
revoke all on public.visit_salts from public, anon, authenticated;

create function public.visit_salt()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'utc')::date;
  s text;
begin
  delete from public.visit_salts where day < today - 1;
  insert into public.visit_salts (day, salt) values (today, encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')), 'base64'))
    on conflict (day) do nothing;
  select salt into s from public.visit_salts where day = today;
  return s;
end;
$$;
revoke execute on function public.visit_salt() from public, anon, authenticated;
grant execute on function public.visit_salt() to service_role;

-- When the daily alert last covered messages up to.
create table public.portal_runs (
  kind    text primary key,
  last_at timestamptz not null
);
alter table public.portal_runs enable row level security;
revoke all on public.portal_runs from public, anon, authenticated;

-- Everything the overview and the weekly report show, for the last p_days.
create function public.portal_stats(p_days int)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with m as (
    select * from public.contact_messages where created_at > now() - make_interval(days => p_days)
  ), v as (
    select * from public.page_views where day > (now() at time zone 'utc')::date - p_days
  )
  select jsonb_build_object(
    'days', p_days,
    'messages', jsonb_build_object(
      'received', (select count(*) from m),
      'open', (select count(*) from m where status = 'open'),
      'held', (select count(*) from m where status = 'held'),
      'spam', (select count(*) from m where status = 'spam'),
      'by_source', (select coalesce(jsonb_object_agg(source, n), '{}') from (select source, count(*) n from m group by source) s),
      'held_reasons', (select coalesce(jsonb_object_agg(coalesce(held_reason, 'unknown'), n), '{}') from (select held_reason, count(*) n from m where status = 'held' group by held_reason) s),
      -- Whole backlog, not just this period: what still needs someone.
      'waiting', (select count(*) from public.contact_messages where status = 'open' and handled_at is null),
      'held_waiting', (select count(*) from public.contact_messages where status = 'held' and handled_at is null)
    ),
    'visits', jsonb_build_object(
      'views', (select count(*) from v),
      'visitors', (select count(*) from (select distinct day, visitor from v) s),
      'daily', (select coalesce(jsonb_agg(d order by d.day), '[]') from (
        select day, count(*) as views, count(distinct visitor) as visitors from v group by day
      ) d),
      'pages', (select coalesce(jsonb_agg(p), '[]') from (
        select path, count(*) as views from v group by path order by views desc limit 10
      ) p),
      'referrers', (select coalesce(jsonb_agg(r), '[]') from (
        select referrer_host as host, count(*) as views from v where referrer_host is not null group by referrer_host order by views desc limit 10
      ) r),
      'devices', (select coalesce(jsonb_object_agg(device, n), '{}') from (select device, count(*) n from v group by device) s),
      'countries', (select coalesce(jsonb_agg(c), '[]') from (
        select country, count(*) as views from v where country is not null group by country order by views desc limit 10
      ) c)
    ),
    'accounts', jsonb_build_object(
      'new', (select count(*) from auth.users where created_at > now() - make_interval(days => p_days)),
      'total', (select count(*) from auth.users)
    ),
    'documents', jsonb_build_object(
      'total', (select count(*) from public.documents)
    )
  );
$$;

revoke execute on function public.portal_stats(int) from public, anon, authenticated;
grant execute on function public.portal_stats(int) to service_role;
