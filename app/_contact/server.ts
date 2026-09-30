import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MAX_MS, MIN_MS, POW_BITS, zeroBits } from './rules';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = process.env.CONTACT_SECRET;

/** The form needs the database, the server-only key and the signing secret.
 *  Local mode (none of them set) answers "not set up", like sign-in does. */
export const contactReady = Boolean(URL && KEY && SERVICE && SECRET && SECRET.length >= 32);

const sign = (data: string) => createHmac('sha256', SECRET!).update(data).digest('base64url');

/** `<issued ms>.<random>.<signature>`: the time check and the proof-of-work
 *  seed in one token nobody else can mint. */
export function issueChallenge(now = Date.now()): string {
  const body = `${now}.${randomBytes(12).toString('base64url')}`;
  return `${body}.${sign(body)}`;
}

export type ChallengeProblem = 'invalid' | 'too-fast' | 'expired' | 'work';

export function checkChallenge(challenge: string, nonce: string, now = Date.now()): ChallengeProblem | null {
  const parts = challenge.split('.');
  if (parts.length !== 3 || !/^\d{1,16}$/.test(nonce)) return 'invalid';
  const [issued = '', rand = '', sig = ''] = parts;
  const want = Buffer.from(sign(`${issued}.${rand}`));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return 'invalid';
  const age = now - Number(issued);
  if (age < MIN_MS) return 'too-fast';
  if (age > MAX_MS) return 'expired';
  const digest = createHash('sha256').update(`${challenge}:${nonce}`).digest();
  return zeroBits(digest) >= POW_BITS ? null : 'work';
}

/** Never the address itself: an HMAC under the server secret. */
export const hashIp = (ip: string) => createHmac('sha256', SECRET!).update(`ip:${ip}`).digest('base64url');

let admin: SupabaseClient | null = null;
/** Bypasses RLS: rate limiting, duplicate checks, and anonymous messages. */
export function adminClient(): SupabaseClient {
  admin ??= createClient(URL!, SERVICE!, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

/** Acts as the signed-in sender, so the existing policy fills in (and holds
 *  them to) their account and email. */
export function senderClient(jwt: string): SupabaseClient {
  return createClient(URL!, KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}
