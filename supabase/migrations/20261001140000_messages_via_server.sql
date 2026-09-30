-- Every message now arrives through the contact route (app/api/contact), which
-- runs the spam checks first. Signed-in senders used to be able to insert
-- directly with their own token, skipping those checks; that path is closed.
-- The route verifies the sender's token and writes user_id and email from the
-- verified account, so a signed-in message still can't claim someone else,
-- and still goes when the account is deleted (the cascade is unchanged).
drop policy "Send a message as yourself" on public.contact_messages;
revoke insert on public.contact_messages from authenticated;
