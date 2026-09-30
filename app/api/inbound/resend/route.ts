import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { EMAIL_SHAPE, MAX_MESSAGE } from '../../../_contact/rules';
import { holdReason } from '../../../_contact/score';
import { adminClient, contactReady } from '../../../_contact/server';
import { addressOf, getReceivedEmail, headerOf, htmlToText, inboundReady, verifyWebhook } from '../../../_portal/resend';

export const dynamic = 'force-dynamic';

/** Emails an hour past which new ones are held as a flood. */
const FLOOD_PER_HOUR = 60;

const ok = () => NextResponse.json({ ok: true });

/**
 * Resend's `email.received` webhook: mail to anything@adaedit.com lands here
 * and is stored next to contact-form messages (source 'email'), where the
 * portal lists it. The webhook carries no body, so the email is fetched by
 * id. Deliveries are verified (Svix signature, five-minute window) and
 * idempotent (resend_email_id is unique), so Resend's retries can't
 * duplicate a message. The same spam signals as the form decide whether it
 * is held. Anything unusable is acknowledged and dropped with a log line, so
 * Resend doesn't retry it forever; Resend keeps its own copy regardless.
 */
export async function POST(req: NextRequest) {
  if (!contactReady || !inboundReady) return NextResponse.json({ error: 'not-set-up' }, { status: 503 });
  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers)) return NextResponse.json({ error: 'bad-signature' }, { status: 401 });

  let event: { type?: string; data?: { email_id?: string } };
  try { event = JSON.parse(raw); } catch { return ok(); }
  if (event.type !== 'email.received' || !event.data?.email_id) return ok();

  const mail = await getReceivedEmail(event.data.email_id);
  if (!mail) return NextResponse.json({ error: 'fetch-failed' }, { status: 502 }); // let Resend retry

  const replyTo = addressOf(mail.reply_to?.[0] ?? mail.from);
  if (!EMAIL_SHAPE.test(replyTo) || replyTo.length > 254) { console.error('inbound: unusable sender', mail.id); return ok(); }
  const body = (mail.text?.trim() || (mail.html ? htmlToText(mail.html) : '') || mail.subject || '(no text)').slice(0, MAX_MESSAGE);

  const db = adminClient();
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const { count } = await db.from('contact_messages').select('id', { count: 'exact', head: true }).eq('source', 'email').gt('created_at', since);
  // An answer to one of our replies arrives at the tagged Reply-To we gave
  // it (accessibility+r<token>@…): a follow-up to that conversation, and never
  // held as spam, since we wrote to them first.
  const tokens = mail.to.map(addressOf).map((a) => a.match(/\+r([a-z0-9]{20,40})@/)?.[1]).filter((t): t is string => !!t);
  const { data: ours } = tokens.length
    ? await db.from('contact_replies').select('message_id').in('reply_token', tokens).limit(1)
    : { data: null };
  const followsUp = (ours?.[0]?.message_id as number | undefined) ?? null;
  const held = followsUp ? null : (count ?? 0) >= FLOOD_PER_HOUR ? 'flood' : holdReason(`${mail.subject ?? ''}\n${body}`, replyTo);

  const { error } = await db.from('contact_messages').upsert({
    source: 'email',
    resend_email_id: mail.id,
    email: replyTo,
    to_address: mail.to.map(addressOf).join(', ').slice(0, 1000),
    subject: (mail.subject ?? '').slice(0, 500) || null,
    message: body,
    status: held ? 'held' : 'open',
    held_reason: held,
    email_message_id: (mail.message_id ?? headerOf(mail.headers, 'message-id'))?.slice(0, 998) ?? null,
    follows_up: followsUp,
  }, { onConflict: 'resend_email_id', ignoreDuplicates: true });
  if (error) { console.error('inbound insert failed', error); return NextResponse.json({ error: 'store-failed' }, { status: 500 }); }
  return ok();
}
