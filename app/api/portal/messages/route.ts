import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminClient } from '../../../_contact/server';
import { NO_STORE, requireOperator } from '../../../_portal/auth';

export const dynamic = 'force-dynamic';

const COLUMNS = 'id, created_at, source, email, to_address, subject, message, status, held_reason, handled_at, user_id';

/**
 * The triage lists. `open`: waiting for a person; `held`: set aside by the
 * spam rules, waiting for a verdict; `handled`: done; `spam`: an operator's
 * verdict. Newest first, 200 at most.
 */
export async function GET(req: NextRequest) {
  const op = await requireOperator(req);
  if (op instanceof NextResponse) return op;
  const view = req.nextUrl.searchParams.get('view') ?? 'open';
  let q = adminClient().from('contact_messages').select(COLUMNS).order('created_at', { ascending: false }).limit(200);
  if (view === 'open') q = q.eq('status', 'open').is('handled_at', null);
  else if (view === 'held') q = q.eq('status', 'held').is('handled_at', null);
  else if (view === 'handled') q = q.not('handled_at', 'is', null).neq('status', 'spam');
  else if (view === 'spam') q = q.eq('status', 'spam');
  else return NextResponse.json({ error: 'bad-view' }, { status: 400, headers: NO_STORE });
  const { data, error } = await q;
  if (error) { console.error('portal messages failed', error); return NextResponse.json({ error: 'failed' }, { status: 500, headers: NO_STORE }); }
  return NextResponse.json({ messages: data }, { headers: NO_STORE });
}
