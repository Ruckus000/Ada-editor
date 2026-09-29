-- Images: the pictures in people's documents, kept privately per account.
--
-- A figure stores only a key, the SHA-256 of its bytes; the bytes live in the
-- private `images` bucket at `<user id>/<key>`. Nothing in the bucket is
-- public and nothing is served by URL: the app downloads with the signed-in
-- session, and these policies let an account reach its own folder only.
-- Content-addressed objects never change, so there is no update policy.
--
-- Storage doesn't cascade from auth.users: the app empties an account's
-- folder before calling delete_my_account(), and stops if it can't.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('images', 'images', false, 10485760, array['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
on conflict (id) do nothing;

create policy "Read own images" on storage.objects
  for select to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Only `<own id>/<64 hex characters>`: a key, never a path someone made up.
create policy "Upload own images" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f]{64}$'
  );

create policy "Delete own images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Which images each document uses, written by the app with the row. Only for
-- deciding what a deletion may remove: an image another document still uses
-- stays. A wrong list can only cost the account its own pictures.
alter table public.documents
  add column image_keys text[] not null default '{}'
  constraint documents_image_keys_size check (cardinality(image_keys) <= 2000);

create index documents_image_keys_idx on public.documents using gin (image_keys);
