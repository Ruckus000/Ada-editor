import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminClient } from '../../../../../_contact/server';
import { NO_STORE, requireOperator } from '../../../../../_portal/auth';
import { resendReady, sendEmail } from '../../../../../_portal/resend';
import { untagged } from '../../../../../_portal/types';

export const dynamic = 'force-dynamic';

/** The default sender: the public contact address (accessibility@adaedit.com). */
const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.toLowerCase();
const DOMAIN = CONTACT?.split('@')[1];
const NAME = 'Ada Editor';
const MAX = 20_000;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const quote = (s: string) => s.split('\n').map((l) => `> ${l}`).join('\n');

/**
 * Reply to a message from the portal, by email through Resend.
 * - From: the adaedit.com address they wrote to (an email to privacy@ is
 *   answered from privacy@); otherwise the public contact address.
 * - Reply-To: that address tagged with a one-off token (+r<token>), so their
 *   answer comes back into the portal filed under this conversation.
 * - In-Reply-To/References: their email's Message-ID, so mail apps thread it.
 * - Their message quoted below, plain text first; saved in contact_replies.
 * Marks the message handled unless asked not to.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const op = await requireOperator(req);
  if (op instanceof NextResponse) return op;
  if (!resendReady || !CONTACT || !DOMAIN) return NextResponse.json({ error: 'Replies aren’t set up: RESEND_API_KEY and NEXT_PUBLIC_CONTACT_EMAIL are needed.' }, { status: 503, headers: NO_STORE });

  const id = Number((await params).id);
  const { body, keepOpen } = (await req.json().catch(() => ({}))) as { body?: unknown; keepOpen?: unknown };
  const text = typeof body === 'string' ? body.trim() : '';
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'bad-request' }, { status: 400, headers: NO_STORE });
  if (!text) return NextResponse.json({ error: 'Write a reply first.' }, { status: 400, headers: NO_STORE });
  if (text.length > MAX) return NextResponse.json({ error: `Keep the reply under ${MAX.toLocaleString('en')} characters.` }, { status: 400, headers: NO_STORE });

  const db = adminClient();
  const { data: m } = await db.from('contact_messages')
    .select('id, email, to_address, subject, message, created_at, email_message_id, source').eq('id', id).maybeSingle();
  if (!m) return NextResponse.json({ error: 'not-found' }, { status: 404, headers: NO_STORE });

  const wroteTo = (m.to_address as string | null)?.split(',').map(untagged).find((a) => a.endsWith(`@${DOMAIN}`));
  const from = wroteTo ?? CONTACT;
  const token = randomBytes(15).toString('hex');
  const [local, host] = from.split('@');
  const replyTo = `${local}+r${token}@${host}`;
  const original = (m.subject as string | null) ?? 'Your message to Ada Editor';
  const subject = /^re:/i.test(original) ? original : `Re: ${original}`;
  const when = new Date(m.created_at as string).toUTCString();
  const plain = `${text}\n\n— ${NAME}\n\nOn ${when}, ${m.email} wrote:\n${quote(m.message as string)}`;
  const html = `<!doctype html><html lang="en"><body style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5">`
    + `<div style="white-space:pre-wrap">${esc(text)}</div><p>— ${NAME}</p>`
    + `<p style="color:#4E5B6E">On ${esc(when)}, ${esc(m.email as string)} wrote:</p>`
    + `<blockquote style="margin:0;padding-left:12px;border-left:3px solid #C2CCDA;color:#4E5B6E;white-space:pre-wrap">${esc(m.message as string)}</blockquote></body></html>`;
  const thread = m.email_message_id ? { 'In-Reply-To': m.email_message_id as string, References: m.email_message_id as string } : undefined;

  const sent = await sendEmail({ from: `${NAME} <${from}>`, to: m.email as string, subject, text: plain, html, replyTo, ...(thread ? { headers: thread } : {}) });
  if (!sent) return NextResponse.json({ error: 'The reply couldn’t be sent. Try again in a minute.' }, { status: 502, headers: NO_STORE });

  const { data: reply, error } = await db.from('contact_replies').insert({
    message_id: id, from_address: from, to_address: m.email, subject, body: text, reply_token: token, sent_by: op.email,
  }).select('id, from_address, to_address, subject, body, sent_by, sent_at').single();
  if (error) console.error('reply sent but not saved', error);
  if (keepOpen !== true) await db.from('contact_messages').update({ handled_at: new Date().toISOString() }).eq('id', id).is('handled_at', null);
  console.info(`portal: ${op.email} replied to message ${id}`);
  return NextResponse.json({ ok: true, reply }, { headers: NO_STORE });
}
