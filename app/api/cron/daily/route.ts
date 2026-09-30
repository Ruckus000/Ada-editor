import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminClient, contactReady } from '../../../_contact/server';
import { alertEmail, weeklyEmail } from '../../../_portal/report';
import { resendReady, sendEmail } from '../../../_portal/resend';
import type { Stats } from '../../../_portal/types';

export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET;
const REPORT_TO = process.env.REPORT_TO;
const REPORT_FROM = process.env.REPORT_FROM;
const PORTAL_URL = process.env.PORTAL_HOST ? `https://${process.env.PORTAL_HOST}/portal` : '/portal';

/** Reports go out at 9am New York time (EST in winter, EDT in summer).
 *  Vercel crons run on UTC, so vercel.json fires at 13:00 and 14:00 UTC and
 *  only the run that lands in the 9 o'clock hour in New York does anything. */
const ZONE = 'America/New_York';
const HOUR = 9;
function inZone(d: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: ZONE, hour: 'numeric', hourCycle: 'h23', weekday: 'short' }).formatToParts(d).map((p) => [p.type, p.value]));
  return { hour: Number(parts.hour), weekday: parts.weekday };
}

function authorised(req: NextRequest) {
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${CRON_SECRET ?? ''}`);
  return Boolean(CRON_SECRET) && got.length === want.length && timingSafeEqual(got, want);
}

/**
 * Once a day at 9am New York time (see ZONE). Vercel sends
 * `Authorization: Bearer $CRON_SECRET`.
 *  1. Alert: if open messages arrived since the last alert, one short email
 *     saying how many. Quiet days send nothing.
 *  2. Mondays (New York): the weekly report (portal_stats(7)).
 *  3. Housekeeping: page views older than 13 months go.
 * Emails carry counts and a portal link only, never message text.
 */
export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  if (!contactReady) return NextResponse.json({ error: 'not-set-up' }, { status: 503 });
  const now = new Date();
  const local = inZone(now);
  // `?force=1` runs it now regardless of the hour (for a manual test).
  if (local.hour !== HOUR && req.nextUrl.searchParams.get('force') !== '1') return NextResponse.json({ ok: true, skipped: `not ${HOUR}:00 in ${ZONE}` });
  const db = adminClient();
  const mail = resendReady && REPORT_TO && REPORT_FROM;
  const done: string[] = [];

  const { data: runs } = await db.from('portal_runs').select('kind, last_at');
  const last = (kind: string) => runs?.find((r) => r.kind === kind)?.last_at as string | undefined;
  const mark = (kind: string) => db.from('portal_runs').upsert({ kind, last_at: now.toISOString() });

  const since = last('alert') ?? new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
  const { count } = await db.from('contact_messages').select('id', { count: 'exact', head: true })
    .eq('status', 'open').is('handled_at', null).gt('created_at', since);
  if (count && mail) {
    const m = alertEmail(count, PORTAL_URL);
    if (await sendEmail({ from: REPORT_FROM, to: REPORT_TO, ...m })) { await mark('alert'); done.push(`alert:${count}`); }
  } else {
    await mark('alert');
  }

  const weeklyDue = local.weekday === 'Mon' && (!last('weekly') || now.getTime() - Date.parse(last('weekly')!) > 6 * 24 * 60 * 60_000);
  if (weeklyDue && mail) {
    const { data: stats, error } = await db.rpc('portal_stats', { p_days: 7 });
    if (!error && stats) {
      const m = weeklyEmail(stats as Stats, PORTAL_URL);
      if (await sendEmail({ from: REPORT_FROM, to: REPORT_TO, ...m })) { await mark('weekly'); done.push('weekly'); }
    }
  }

  const cutoff = new Date(now.getTime() - 396 * 24 * 60 * 60_000).toISOString().slice(0, 10);
  await db.from('page_views').delete().lt('day', cutoff);

  if (!mail) done.push('no-mail-settings');
  return NextResponse.json({ ok: true, done });
}
