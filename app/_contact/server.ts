import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MAX_MS, MIN_MS, POW_BASE_BITS, POW_MAX_BITS, zeroBits } from './rules';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = process.env.CONTACT_SECRET;

/** The form needs the database, the server-only key and the signing secret.
 *  Local mode (none of them set) answers "not set up", like sign-in does. */
export const contactReady = Boolean(URL && KEY && SERVICE && SECRET && SECRET.length >= 32);

const sign = (data: string) => createHmac('sha256', SECRET!).update(data).digest('base64url');

/** `<issued ms>.<bits>.<random>.<signature>`: the time check, the difficulty
 *  and the proof-of-work seed in one token nobody else can mint or soften. */
export function issueChallenge(bits: number, now = Date.now()): string {
  const body = `${now}.${bits}.${randomBytes(12).toString('base64url')}`;
  return `${body}.${sign(body)}`;
}

export type ChallengeProblem = 'invalid' | 'too-fast' | 'expired' | 'work';

export function checkChallenge(challenge: string, nonce: string, now = Date.now()): ChallengeProblem | null {
  const parts = challenge.split('.');
  if (parts.length !== 4 || !/^\d{1,16}$/.test(nonce)) return 'invalid';
  const [issued = '', bitsText = '', rand = '', sig = ''] = parts;
  const want = Buffer.from(sign(`${issued}.${bitsText}.${rand}`));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return 'invalid';
  const bits = Number(bitsText);
  if (!Number.isInteger(bits) || bits < POW_BASE_BITS || bits > POW_MAX_BITS) return 'invalid';
  const age = now - Number(issued);
  if (age < MIN_MS) return 'too-fast';
  if (age > MAX_MS) return 'expired';
  const digest = createHash('sha256').update(`${challenge}:${nonce}`).digest();
  return zeroBits(digest) >= bits ? null : 'work';
}

/** The client's address: Vercel sets x-forwarded-for itself (a client can't
 *  forge the first entry there). Anything unparseable shares one bucket. */
export function clientIp(headers: Headers): string {
  const ip = headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip')?.trim() || '';
  return isIP(ip) ? ip : 'unknown';
}

/** The network an address sits in: IPv4 /24, IPv6 /56 (a typical customer
 *  allocation), so a rented block of addresses shares one budget. */
export function networkOf(ip: string): string {
  if (isIP(ip) === 4) return ip.split('.').slice(0, 3).join('.') + '.0/24';
  if (isIP(ip) === 6) {
    const [head = '', tail = ''] = ip.toLowerCase().split('::');
    const left = head ? head.split(':') : [];
    const right = tail ? tail.split(':') : [];
    const groups = ip.includes('::') ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
    const g = groups.map((x) => x.padStart(4, '0'));
    return `${g.slice(0, 3).join(':')}:${(g[3] ?? '0000').slice(0, 2)}00::/56`;
  }
  return 'unknown';
}

/** Never an address itself: HMACs under the server secret. */
const keyed = (label: string, value: string) => createHmac('sha256', SECRET!).update(`${label}:${value}`).digest('base64url');
export const hashIp = (ip: string) => keyed('ip', ip);
export const hashNet = (ip: string) => keyed('net', networkOf(ip));

let admin: SupabaseClient | null = null;
/** Bypasses RLS. The only writer of contact_messages: the route has checked
 *  the sender (and, when signed in, verified their token) first. */
export function adminClient(): SupabaseClient {
  admin ??= createClient(URL!, SERVICE!, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}
