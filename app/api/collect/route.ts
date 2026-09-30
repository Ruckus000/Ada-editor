import { createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminClient, clientIp, contactReady } from '../../_contact/server';

export const dynamic = 'force-dynamic';

/** Only the public site is counted, never the app: document URLs are private. */
const COUNTED = new Set(['/', '/accessibility', '/privacy', '/contact']);
const BOTS = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|curl|wget|python|axios|node-fetch|go-http/i;

const none = () => new NextResponse(null, { status: 204 });

let salt: { day: string; value: string } | null = null;
async function todaysSalt(): Promise<string | null> {
  const day = new Date().toISOString().slice(0, 10);
  if (salt?.day === day) return salt.value;
  const { data, error } = await adminClient().rpc('visit_salt');
  if (error || typeof data !== 'string') { console.error('visit_salt failed', error); return null; }
  salt = { day, value: data };
  return data;
}

const deviceOf = (ua: string) => (/iPad|Tablet|PlayBook|Silk/i.test(ua) ? 'tablet' : /Mobi|Android|iPhone|iPod/i.test(ua) ? 'mobile' : 'desktop');

/**
 * One page view of the public site, Umami/Plausible style: no cookies, no
 * stored address. The visitor is an HMAC of address + browser + site under
 * today's random salt (visit_salt(), deleted after two days). Not counted:
 * bots, Do Not Track or Global Privacy Control, requests from other sites,
 * and any path outside the public pages. Always answers 204, so the beacon
 * learns nothing either way.
 */
export async function POST(req: NextRequest) {
  if (!contactReady) return none();
  const h = req.headers;
  const ua = h.get('user-agent') ?? '';
  if (!ua || BOTS.test(ua) || h.get('dnt') === '1' || h.get('sec-gpc') === '1') return none();
  const host = h.get('host') ?? '';
  const origin = h.get('origin');
  if (origin && new URL(origin).host !== host) return none();

  let body: { p?: unknown; r?: unknown };
  try { body = JSON.parse(await req.text()); } catch { return none(); }
  const path = typeof body.p === 'string' ? body.p.split(/[?#]/)[0] ?? '' : '';
  if (!COUNTED.has(path)) return none();

  let referrerHost: string | null = null;
  if (typeof body.r === 'string' && body.r) {
    try {
      const r = new URL(body.r).host.replace(/^www\./, '').toLowerCase();
      if (r && r !== host.replace(/^www\./, '').toLowerCase()) referrerHost = r.slice(0, 253);
    } catch { /* not a URL */ }
  }

  const key = await todaysSalt();
  if (!key) return none();
  const visitor = createHmac('sha256', key).update(`${clientIp(h)}|${ua}|${host}`).digest('base64url').slice(0, 22);
  const country = h.get('x-vercel-ip-country');

  const { error } = await adminClient().from('page_views').insert({
    path,
    referrer_host: referrerHost,
    device: deviceOf(ua),
    country: country && /^[A-Z]{2}$/.test(country) ? country : null,
    visitor,
  });
  if (error) console.error('page view insert failed', error);
  return none();
}
