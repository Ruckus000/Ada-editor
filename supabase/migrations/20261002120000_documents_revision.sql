-- A revision per document, so a save can say which version it was edited
-- from: the app updates a row only while its revision is still the one the
-- edit started at, and otherwise asks the person what to keep (edits made on
-- two devices). The server stamps both the revision and updated_at, so no
-- client's clock or claim decides either.
--
-- Safe before the app that uses it: an older client's upsert still works,
-- and is stamped like any other write.

alter table public.documents add column revision bigint not null default 1;

create function public.documents_stamp() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.revision := 1;
  else
    new.revision := old.revision + 1;
  end if;
  return new;
end;
$$;

create trigger documents_stamp
  before insert or update on public.documents
  for each row execute function public.documents_stamp();
