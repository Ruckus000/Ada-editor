-- Privacy controls: people delete their own account, and send us a message.

-- Delete the calling account. Documents go with it (documents.owner_id is
-- ON DELETE CASCADE); messages stay but lose their link (SET NULL below).
-- SECURITY DEFINER because only the owner of auth.users may delete from it:
-- the body only ever touches the caller's own row, search_path is pinned, and
-- anon (and PUBLIC) cannot execute it.
create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Messages from the privacy page. Insert-only: nobody can read them back
-- through the API; the owner reads them in the Supabase Table Editor.
-- ponytail: no notification on new messages. Upgrade: a database webhook to
-- Resend once messages actually arrive.
create table public.contact_messages (
  id         bigint      generated always as identity primary key,
  user_id    uuid        default auth.uid() references auth.users (id) on delete set null,
  email      text        not null default (auth.jwt() ->> 'email'),
  message    text        not null check (char_length(message) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index contact_messages_user_id_idx on public.contact_messages (user_id);

alter table public.contact_messages enable row level security;

revoke all on public.contact_messages from anon, authenticated;
grant insert (message) on public.contact_messages to authenticated;

-- The sender is whoever is signed in: user_id and email come from the JWT via
-- the column defaults (only `message` is insertable), and this check holds
-- them to it regardless.
create policy "Send a message as yourself" on public.contact_messages
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and email = (select auth.jwt() ->> 'email')
  );
