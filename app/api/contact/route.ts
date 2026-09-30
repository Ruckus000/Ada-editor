import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { TRAP, checkEmail, checkMessage } from '../../_contact/rules';
import { holdReason } from '../../_contact/score';
import { adminClient, checkChallenge, clientIp, contactReady, hashIp, hashNet } from '../../_contact/server';

export const dynamic = 'force-dynamic';

type Body = { email?: unknown; message?: unknown; challenge?: unknown; nonce?: unknown; [TRAP]?: unknown };

const reply = (status: number, body: Record<string, unknown>) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const refuse = (status: number, error: string, field?: 'email' | 'message') => reply(status, { error, field });

const RELOAD = 'Your message couldn’t be checked. Reload the page and send it again.';
const EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
const OVERLOADED = `We can’t take more messages from here right now. Try again in an hour${EMAIL ? `, or email ${EMAIL}` : ''}.`;

/** Per hour. Past a soft limit a message is held for review, never refused;
 *  only the hard per-address limit (far past what a person sends) and a full
 *  day's held list refuse. */
const LIMITS = { p_ip_soft: 3, p_ip_hard: 20, p_net_soft: 10, p_total_soft: 30, p_held_per_day: 500 };

/**
 * The contact form's only way in, and the only writer of contact_messages.
 * Layers, cheapest first: the trap field; what a person can fix (empty, too
 * long, not an email address); the signed challenge (too fast, too old,
 * forged, or the proof of work unsolved at the difficulty it was issued at);
 * then contact_gate()'s per-address, per-network and overall hourly counts.
 *
 * A flood must not lock real people out, so being over a soft limit, or
 * looking like spam (app/_contact/score.ts), holds a message for review
 * instead of refusing it; the sender sees the same "sent". A signed-in
 * sender is verified by their token and never held. An exact repeat within a
 * day is accepted without storing it twice.
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
  // Signed in: the account and its email come from the verified token, never
  // from the request body.
  let sender = { user_id: null as string | null, email };
  if (jwt) {
    const { data, error } = await admin.auth.getUser(jwt);
    if (error || !data.user?.email) return refuse(401, 'Your sign-in has expired. Sign in again, or sign out and send the message with your email address.');
    sender = { user_id: data.user.id, email: data.user.email };
  }

  const ip = clientIp(req.headers);
  const { data: verdict, error: gateError } = await admin.rpc('contact_gate', {
    p_ip_hash: hashIp(ip), p_net_hash: hashNet(ip), p_challenge: challenge, ...LIMITS,
  });
  if (gateError || typeof verdict !== 'string') { console.error('contact_gate failed', gateError); return refuse(500, 'Your message couldn’t be sent. Try again in a few minutes.'); }
  if (verdict === 'replay') return refuse(400, RELOAD);
  if (verdict === 'refuse') return refuse(429, OVERLOADED);
  const held = sender.user_id ? null : verdict.startsWith('held:') ? verdict.slice(5) : holdReason(message, email);

  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { data: repeat } = await admin.from('contact_messages').select('id').eq('message', message).gt('created_at', since).limit(1);
  if (repeat?.length) return reply(200, { ok: true });

  const { error } = await admin.from('contact_messages').insert({ message, ...sender, status: held ? 'held' : 'open', held_reason: held });
  if (error) { console.error('contact insert failed', error); return refuse(500, 'Your message couldn’t be sent. Try again in a few minutes.'); }
  return reply(200, { ok: true });
}
