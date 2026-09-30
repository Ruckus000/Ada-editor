import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The two things the portal asks of Resend, without its SDK: verify a webhook
 * (Resend signs them with Svix) and read or send an email over its REST API.
 * Resend already sends the sign-in emails, so nothing here adds a company.
 */

const API = 'https://api.resend.com';
const KEY = process.env.RESEND_API_KEY;
const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;

export const resendReady = Boolean(KEY);
export const inboundReady = Boolean(KEY && WEBHOOK_SECRET?.startsWith('whsec_'));

/** Svix: HMAC-SHA256 over `id.timestamp.body` with the base64 key after
 *  `whsec_`; any one `v1,<sig>` in the header may match. Older than five
 *  minutes (either way) is a replay. */
export function verifyWebhook(body: string, headers: Headers, now = Date.now()): boolean {
  const id = headers.get('svix-id');
  const ts = headers.get('svix-timestamp');
  const sigs = headers.get('svix-signature');
  if (!id || !ts || !sigs || !WEBHOOK_SECRET?.startsWith('whsec_')) return false;
  if (!/^\d+$/.test(ts) || Math.abs(now / 1000 - Number(ts)) > 5 * 60) return false;
  const key = Buffer.from(WEBHOOK_SECRET.slice('whsec_'.length), 'base64');
  const want = Buffer.from(createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64'));
  return sigs.split(' ').some((s) => {
    const [version, sig = ''] = s.split(',');
    const got = Buffer.from(sig);
    return version === 'v1' && got.length === want.length && timingSafeEqual(got, want);
  });
}

export type ReceivedEmail = {
  id: string;
  from: string;
  to: string[];
  subject: string;
  text: string | null;
  html: string | null;
  reply_to: string[] | null;
  message_id: string | null;
  headers: Record<string, string> | null;
};

/** The body isn't in the webhook; fetch it (GET /emails/receiving/{id}). */
export async function getReceivedEmail(id: string): Promise<ReceivedEmail | null> {
  const res = await fetch(`${API}/emails/receiving/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${KEY}` }, cache: 'no-store' });
  if (!res.ok) { console.error('resend receiving get failed', res.status, await res.text().catch(() => '')); return null; }
  return (await res.json()) as ReceivedEmail;
}

type Outgoing = { from: string; to: string; subject: string; text: string; html: string; replyTo?: string; headers?: Record<string, string> };

export async function sendEmail({ replyTo, ...mail }: Outgoing): Promise<boolean> {
  const res = await fetch(`${API}/emails`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...mail, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  if (!res.ok) console.error('resend send failed', res.status, await res.text().catch(() => ''));
  return res.ok;
}

/** A header value from a received email, whatever its case. */
export const headerOf = (h: Record<string, string> | null, name: string) =>
  h ? Object.entries(h).find(([k]) => k.toLowerCase() === name)?.[1] ?? null : null;

/** "Name <a@b.c>" → "a@b.c". */
export const addressOf = (s: string) => (s.match(/<([^<>\s]+@[^<>\s]+)>/)?.[1] ?? s).trim().toLowerCase();

/** Plain text for a message that only has HTML: tags out, entities decoded,
 *  whitespace kept readable. Never rendered as HTML in the portal. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
