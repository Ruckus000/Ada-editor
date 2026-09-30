import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminClient } from '../../../../_contact/server';
import { NO_STORE, requireOperator } from '../../../../_portal/auth';

export const dynamic = 'force-dynamic';

type Action = 'handled' | 'reopen' | 'release' | 'spam' | 'delete';

/** What each triage action writes. `release`: held → open (not spam after
 *  all). `delete` is permanent: for a sender who asked (privacy notice). */
const PATCH: Record<Exclude<Action, 'delete'>, () => Record<string, unknown>> = {
  handled: () => ({ handled_at: new Date().toISOString() }),
  reopen: () => ({ handled_at: null, status: 'open' }),
  release: () => ({ status: 'open', held_reason: null }),
  spam: () => ({ status: 'spam', handled_at: new Date().toISOString() }),
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const op = await requireOperator(req);
  if (op instanceof NextResponse) return op;
  const id = Number((await params).id);
  const { action } = (await req.json().catch(() => ({}))) as { action?: Action };
  if (!Number.isSafeInteger(id) || id <= 0 || !action || !(action === 'delete' || action in PATCH)) {
    return NextResponse.json({ error: 'bad-request' }, { status: 400, headers: NO_STORE });
  }
  const db = adminClient().from('contact_messages');
  const { error, count } = action === 'delete'
    ? await db.delete({ count: 'exact' }).eq('id', id)
    : await db.update(PATCH[action](), { count: 'exact' }).eq('id', id);
  if (error) { console.error('portal action failed', action, error); return NextResponse.json({ error: 'failed' }, { status: 500, headers: NO_STORE }); }
  if (!count) return NextResponse.json({ error: 'not-found' }, { status: 404, headers: NO_STORE });
  console.info(`portal: ${op.email} ${action} message ${id}`);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
