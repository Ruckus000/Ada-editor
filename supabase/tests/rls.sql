-- RLS and privilege check for public.documents, public.contact_messages and
-- delete_my_account(). Runs in one transaction and rolls back, so
-- it is safe against a live project: execute it with psql or MCP execute_sql.
-- Any failed expectation raises and aborts; success returns 'rls ok'.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'rls-a@test.invalid'),
  ('00000000-0000-0000-0000-00000000000b', 'rls-b@test.invalid');

set local role authenticated;

-- A creates a document (owner_id comes from the default, auth.uid()).
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';
insert into public.documents (id, title, owner, content, last_checked)
  values ('doc-a', 'A', 'You', '{"type": "doc"}', 0);

do $$ begin
  -- A cannot hand the row to B.
  begin
    update public.documents set owner_id = '00000000-0000-0000-0000-00000000000b' where id = 'doc-a';
    raise exception 'A reassigned a document to B';
  exception when insufficient_privilege then null; end;
  -- Nobody can delete (not granted).
  begin
    delete from public.documents where id = 'doc-a';
    raise exception 'delete is allowed';
  exception when insufficient_privilege then null; end;
  -- The table rejects malformed rows.
  begin
    insert into public.documents (id, title, owner, content, last_checked) values ('Bad Id!', 'x', 'x', '{}', 0);
    raise exception 'a malformed id was accepted';
  exception when check_violation then null; end;
end $$;

-- B sees and changes nothing of A's, and cannot write as A.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}';
do $$ begin
  if (select count(*) from public.documents) <> 0 then raise exception 'B can read A''s documents'; end if;
  update public.documents set title = 'taken' where id = 'doc-a';
  if found then raise exception 'B updated A''s document'; end if;
  begin
    insert into public.documents (owner_id, id, title, owner, content, last_checked)
      values ('00000000-0000-0000-0000-00000000000a', 'doc-b', 'B', 'You', '{"type": "doc"}', 0);
    raise exception 'B inserted a document as A';
  exception when insufficient_privilege then null; end;
end $$;

-- Signed-out requests reach nothing.
set local role anon;
do $$ begin
  begin
    perform 1 from public.documents;
    raise exception 'anon can read documents';
  exception when insufficient_privilege then null; end;
end $$;

-- Privacy: messages are insert-only and always from the signed-in sender.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated", "email": "rls-b@test.invalid"}';
insert into public.documents (id, title, owner, content, last_checked)
  values ('doc-b', 'B', 'You', '{"type": "doc"}', 0);
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated", "email": "rls-a@test.invalid"}';
insert into public.contact_messages (message) values ('A asks a question');
do $$ begin
  begin
    insert into public.contact_messages (message, email) values ('forged', 'someone@else.invalid');
    raise exception 'a message was sent with a forged email';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.contact_messages (message, user_id) values ('forged', '00000000-0000-0000-0000-00000000000b');
    raise exception 'a message was sent as another account';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.contact_messages;
    raise exception 'messages can be read back through the API';
  exception when insufficient_privilege then null; end;
end $$;

set local role anon;
do $$ begin
  begin
    insert into public.contact_messages (message) values ('anon');
    raise exception 'anon can send a message';
  exception when insufficient_privilege then null; end;
  begin
    perform public.delete_my_account();
    raise exception 'anon can call delete_my_account';
  exception when insufficient_privilege then null; end;
end $$;

-- A deletes their account: A, A's documents and A's messages go; B is untouched.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated", "email": "rls-a@test.invalid"}';
select public.delete_my_account();
reset role;
do $$ begin
  if exists (select 1 from auth.users where id = '00000000-0000-0000-0000-00000000000a') then raise exception 'A still exists'; end if;
  if exists (select 1 from public.documents where owner_id = '00000000-0000-0000-0000-00000000000a') then raise exception 'A''s documents survived'; end if;
  if not exists (select 1 from public.documents where owner_id = '00000000-0000-0000-0000-00000000000b') then raise exception 'B''s documents were deleted'; end if;
  if exists (select 1 from public.contact_messages where message = 'A asks a question') then raise exception 'A''s message survived'; end if;
end $$;

select 'rls ok' as result;
rollback;
