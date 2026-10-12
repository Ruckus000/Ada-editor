-- RLS and privilege check for public.documents (including delete), public.contact_messages,
-- the private images bucket and delete_my_account(). Runs in one transaction and rolls back, so
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
  -- The table rejects malformed rows.
  begin
    insert into public.documents (id, title, owner, content, last_checked) values ('Bad Id!', 'x', 'x', '{}', 0);
    raise exception 'a malformed id was accepted';
  exception when check_violation then null; end;
end $$;

-- The server stamps each write: revision 1 on insert, one more per update
-- whatever the client sends, and updated_at from its own clock.
do $$ begin
  if (select revision from public.documents where id = 'doc-a') <> 1 then raise exception 'a new document is not revision 1'; end if;
  update public.documents set title = 'A2', revision = 99, updated_at = '2000-01-01' where id = 'doc-a';
  if (select revision from public.documents where id = 'doc-a') <> 2 then raise exception 'an update did not make revision 2 (or the client set it)'; end if;
  if (select updated_at from public.documents where id = 'doc-a') < now() - interval '1 minute' then raise exception 'the client set updated_at'; end if;
  -- A save made from revision 1 no longer matches: the app's conflict check.
  update public.documents set title = 'stale' where id = 'doc-a' and revision = 1;
  if found then raise exception 'a save from a stale revision matched'; end if;
end $$;

-- B sees and changes nothing of A's, and cannot write as A.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}';
do $$ begin
  if (select count(*) from public.documents) <> 0 then raise exception 'B can read A''s documents'; end if;
  -- (B's refused writes below must not bump A's revision either: checked as A later.)
  update public.documents set title = 'taken' where id = 'doc-a';
  if found then raise exception 'B updated A''s document'; end if;
  delete from public.documents where id = 'doc-a';
  if found then raise exception 'B deleted A''s document'; end if;
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
-- A deletes a document of their own; doc-a stays for the cascade check below.
insert into public.documents (id, title, owner, content, last_checked)
  values ('doc-a-2', 'A2', 'You', '{"type": "doc"}', 0);
do $$ begin
  delete from public.documents where id = 'doc-a-2';
  if not found then raise exception 'A could not delete their own document'; end if;
  if (select count(*) from public.documents) <> 1 then raise exception 'deleting doc-a-2 touched other rows'; end if;
  if (select revision from public.documents where id = 'doc-a') <> 2 then raise exception 'B''s refused writes changed A''s revision'; end if;
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

-- Images: a private bucket; each account reaches its own folder, by key only.
reset role;
do $$ begin
  if not exists (select 1 from storage.buckets where id = 'images' and not public and file_size_limit = 10485760
    and allowed_mime_types @> array['image/png', 'image/jpeg', 'image/gif', 'image/webp'] and cardinality(allowed_mime_types) = 4)
  then raise exception 'the images bucket is missing, public, or has the wrong limits'; end if;
end $$;
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';
insert into storage.objects (bucket_id, name) values ('images', '00000000-0000-0000-0000-00000000000a/' || repeat('a', 64));
do $$ begin
  if (select count(*) from storage.objects where bucket_id = 'images') <> 1 then raise exception 'A cannot see their own image'; end if;
  begin
    insert into storage.objects (bucket_id, name) values ('images', '00000000-0000-0000-0000-00000000000a/../notes.txt');
    raise exception 'A stored an image under a name that is not a key';
  exception when insufficient_privilege then null; end;
end $$;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}';
do $$ begin
  if (select count(*) from storage.objects where bucket_id = 'images') <> 0 then raise exception 'B can see A''s images'; end if;
  begin
    insert into storage.objects (bucket_id, name) values ('images', '00000000-0000-0000-0000-00000000000a/' || repeat('b', 64));
    raise exception 'B stored an image in A''s folder';
  exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
  if (select count(*) from storage.objects where bucket_id = 'images') <> 0 then raise exception 'anon can see images'; end if;
end $$;
-- (The staged row goes with the rollback: storage forbids deleting in SQL.)

-- A new message emails the owner once the Vault holds a key and an inbox, never
-- saying what the message is or who sent it, and at most 10 times a day.
reset role;
delete from vault.secrets where name in ('contact_alert_resend_key', 'contact_alert_to');
create temp table alerts_before on commit drop as
  select count(*) as n from net.http_request_queue where url = 'https://api.resend.com/emails';
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated", "email": "rls-a@test.invalid"}';
insert into public.contact_messages (message) values ('Sent before alerts are set up');
reset role;
do $$ begin
  if (select count(*) from net.http_request_queue where url = 'https://api.resend.com/emails') <> (select n from alerts_before)
  then raise exception 'a message queued an alert with no Vault secrets'; end if;
end $$;
select vault.create_secret('test-key', 'contact_alert_resend_key');
select vault.create_secret('alerts@test.invalid', 'contact_alert_to');
set local role authenticated;
insert into public.contact_messages (message) values ('Private words for the owner');
do $$ begin
  for i in 1..12 loop
    insert into public.contact_messages (message) values ('Message ' || i);
  end loop;
end $$;
reset role;
do $$
declare
  alert record;
begin
  -- Two earlier messages today, so 'Private words' and Messages 1–7 (the 3rd to
  -- 10th of the day) alert; Messages 8–12 don't.
  if (select count(*) from net.http_request_queue where url = 'https://api.resend.com/emails') - (select n from alerts_before) <> 8
  then raise exception 'expected 8 alerts (10 a day), got %',
    (select count(*) from net.http_request_queue where url = 'https://api.resend.com/emails') - (select n from alerts_before); end if;
  select * into alert from net.http_request_queue where url = 'https://api.resend.com/emails' order by id desc limit 1;
  if alert.headers ->> 'Authorization' <> 'Bearer test-key' or convert_from(alert.body, 'UTF8')::jsonb ->> 'to' <> 'alerts@test.invalid'
  then raise exception 'the alert is not sent with the Vault key to the Vault inbox'; end if;
  if exists (select 1 from net.http_request_queue where url = 'https://api.resend.com/emails'
    and convert_from(body, 'UTF8') ~ '(Private words|Message [0-9]|rls-a@)')
  then raise exception 'an alert carries the message or its sender'; end if;
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
