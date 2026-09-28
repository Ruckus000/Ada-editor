-- Evaluate the JWT once per statement, not per row (Supabase linter 0003).
alter policy "Send a message as yourself" on public.contact_messages
  with check (
    user_id = (select auth.uid())
    and email = ((select auth.jwt()) ->> 'email')
  );
