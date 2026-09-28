-- People can delete their own documents (the homepage's "Remove the sample",
-- the editor's "Delete document"). Same shape as the other policies: RLS
-- decides whose rows a request can touch, so a delete of someone else's row
-- matches nothing.
grant delete on public.documents to authenticated;

create policy "Delete own documents" on public.documents
  for delete to authenticated
  using ((select auth.uid()) = owner_id);
