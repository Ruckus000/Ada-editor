import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminClient } from '../../../_contact/server';
import { NO_STORE, requireOperator } from '../../../_portal/auth';

export const dynamic = 'force-dynamic';

const RANGES = new Set([7, 30, 90]);

/** The overview's numbers (portal_stats()) for the last 7, 30 or 90 days. */
export async function GET(req: NextRequest) {
  const op = await requireOperator(req);
  if (op instanceof NextResponse) return op;
  const days = Number(req.nextUrl.searchParams.get('days') ?? 7);
  if (!RANGES.has(days)) return NextResponse.json({ error: 'bad-range' }, { status: 400, headers: NO_STORE });
  const { data, error } = await adminClient().rpc('portal_stats', { p_days: days });
  if (error) { console.error('portal_stats failed', error); return NextResponse.json({ error: 'failed' }, { status: 500, headers: NO_STORE }); }
  return NextResponse.json(data, { headers: NO_STORE });
}
