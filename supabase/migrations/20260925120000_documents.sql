-- Documents, one row per (account, slug). The client is untrusted: RLS decides
-- whose rows a request can touch, and the checks below bound what a row may
-- hold. Findings are never stored — the browser recomputes them on load.

create table public.documents (
  owner_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id           text        not null check (id ~ '^[a-z0-9-]{1,48}$'),  -- slugId: 40 chars + "-N"
  title        text        not null check (char_length(title) <= 500),
  owner        text        not null check (char_length(owner) <= 200),  -- display label, not identity
  targets      text[]      not null default '{}' check (cardinality(targets) <= 20),
  header       text        not null default '' check (char_length(header) <= 10000),
  footer       text        not null default '' check (char_length(footer) <= 10000),
  -- ProseMirror JSON. ponytail: 2 MB cap, well above the ~5 MB localStorage
  -- quota shared by every cached doc; raise it with the cache (IndexedDB).
  content      jsonb       not null check (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 2000000),
  last_checked bigint      not null,
  dismissed    text[]      not null default '{}' check (cardinality(dismissed) <= 10000),
  import_notes text[]      not null default '{}' check (cardinality(import_notes) <= 200),
  updated_at   timestamptz not null default now(),
  primary key (owner_id, id)
);

alter table public.documents enable row level security;

-- Explicit grants: new public tables are no longer exposed to the Data API by
-- default. No delete: there is no delete in the product yet.
revoke all on public.documents from anon, authenticated;
grant select, insert, update on public.documents to authenticated;

create policy "Read own documents" on public.documents
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Create own documents" on public.documents
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

-- WITH CHECK too, or an update could hand a row to another account.
create policy "Update own documents" on public.documents
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
