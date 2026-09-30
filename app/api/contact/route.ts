import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { PER_IP_PER_HOUR, TOTAL_PER_HOUR, TRAP, checkEmail, checkMessage } from '../../_contact/rules';
import { adminClient, checkChallenge, contactReady, hashIp, senderClient } from '../../_contact/server';

export const dynamic = 'force-dynamic';

type Body = { email?: unknown; message?: unknown; challenge?: unknown; nonce?: unknown; [TRAP]?: unknown };

const reply = (status: number, body: Record<string, unknown>) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const refuse = (status: number, error: string, field?: 'email' | 'message') => reply(status, { error, field });

const RELOAD = 'Your message couldn’t be checked. Reload the page and send it again.';

/**
 * The contact form's only way in. Spam layers, cheapest first: the trap
 * field, content rules, the signed challenge (too fast, too old, forged, or
 * unsolved proof of work), then the database's per-sender and overall hourly
 * limits, and an exact repeat within a day is accepted without storing it
 * twice. A signed-in sender is inserted as themselves (their account and
 * email come from their token); anyone else by the server, with the reply-to
 * address they typed.
 */
export async function POST(req: NextRequest) {
  if (!contactReady) return refuse(503, 'Messages aren’t set up on this copy of Ada Editor.');

  let body: Body;
  try { body = (await req.json()) as Body; } catch { return refuse(400, RELOAD); }
  const str = (v: unknown) => (typeof v === 'string' ? v : '');

  // Bots fill in every field. Look sent, store nothing.
  if (str(body[TRAP])) return reply(200, { ok: true });

  const message = str(body.message).trim();
  const messageProblem = checkMessage(message);
  if (messageProblem) return refuse(400, messageProblem, 'message');

  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || null;
  const email = str(body.email).trim();
  if (!jwt) {
    const emailProblem = checkEmail(email);
    if (emailProblem) return refuse(400, emailProblem, 'email');
  }

  const challenge = str(body.challenge);
  switch (checkChallenge(challenge, str(body.nonce))) {
    case null: break;
    case 'too-fast': return refuse(400, 'That was quicker than a person can type. Wait a moment, then send it again.');
    case 'expired': return refuse(400, 'This page has been open a long time. Reload it, then send your message again.');
    default: return refuse(400, RELOAD);
  }

  const admin = adminClient();
  if (jwt) {
    const { data, error } = await admin.auth.getUser(jwt);
    if (error || !data.user) return refuse(401, 'Your sign-in has expired. Sign in again, or sign out and send the message with your email address.');
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  const { data: verdict, error: limitError } = await admin.rpc('contact_allow', {
    p_ip_hash: hashIp(ip), p_challenge: challenge, p_per_ip: PER_IP_PER_HOUR, p_total: TOTAL_PER_HOUR,
  });
  if (limitError) { console.error('contact_allow failed', limitError); return refuse(500, 'Your message couldn’t be sent. Try again in a few minutes.'); }
  if (verdict === 'replay') return refuse(400, RELOAD);
  if (verdict === 'ip') return refuse(429, 'You’ve sent several messages in the last hour. Try again later.');
  if (verdict === 'busy') return refuse(429, 'We’re receiving a lot of messages right now. Try again in an hour.');

  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { data: repeat } = await admin.from('contact_messages').select('id').eq('message', message).gt('created_at', since).limit(1);
  if (repeat?.length) return reply(200, { ok: true });

  const { error } = jwt
    ? await senderClient(jwt).from('contact_messages').insert({ message })
    : await admin.from('contact_messages').insert({ message, email, user_id: null });
  if (error) { console.error('contact insert failed', error); return refuse(500, 'Your message couldn’t be sent. Try again in a few minutes.'); }
  return reply(200, { ok: true });
}
