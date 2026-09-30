-- Replies sent from the portal (app/api/portal/messages/[id]/reply), kept
-- with the message they answer and deleted with it. Each reply's Reply-To is
-- a tagged address (accessibility+r<token>@adaedit.com; all adaedit.com mail
-- reaches the inbound webhook), so the person's answer is filed as a
-- follow-up (follows_up) to that conversation, not a stranger's new message.
-- Matching on the address, not a Message-ID we'd have to trust the sender to
-- keep.
create table public.contact_replies (
  id           bigint      generated always as identity primary key,
  message_id   bigint      not null references public.contact_messages (id) on delete cascade,
  from_address text        not null,
  to_address   text        not null,
  subject      text        not null,
  body         text        not null check (char_length(body) between 1 and 20000),
  reply_token  text        not null unique,
  sent_by      text        not null,
  sent_at      timestamptz not null default now()
);
create index contact_replies_message_idx on public.contact_replies (message_id, sent_at);
alter table public.contact_replies enable row level security;
revoke all on public.contact_replies from public, anon, authenticated;

alter table public.contact_messages
  -- The email's own Message-ID, so a reply can thread under it.
  add column email_message_id text,
  -- An inbound email answering one of our replies: the message it continues.
  add column follows_up bigint references public.contact_messages (id) on delete set null;
