-- Deleting an account now deletes its messages too. They used to survive
-- (ON DELETE SET NULL) with the sender's email still on them, but the privacy
-- notice promises that deleting your account removes your data — so it does.
alter table public.contact_messages
  drop constraint contact_messages_user_id_fkey,
  add constraint contact_messages_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade;
