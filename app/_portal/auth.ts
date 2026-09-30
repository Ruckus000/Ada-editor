import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminClient, contactReady } from '../_contact/server';

export const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Every portal API route starts here. The browser sends its Supabase access
 * token; the server verifies it and looks the account's email up in the
 * operators allowlist. Nothing about access is decided in the browser.
 * Returns the operator's email, or the response to send instead.
 */
export async function requireOperator(req: NextRequest): Promise<{ email: string } | NextResponse> {
  if (!contactReady) return NextResponse.json({ error: 'not-set-up' }, { status: 503, headers: NO_STORE });
  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) return NextResponse.json({ error: 'signed-out' }, { status: 401, headers: NO_STORE });
  const db = adminClient();
  const { data, error } = await db.auth.getUser(jwt);
  const email = data.user?.email?.toLowerCase();
  if (error || !email) return NextResponse.json({ error: 'signed-out' }, { status: 401, headers: NO_STORE });
  const { data: row } = await db.from('operators').select('email').eq('email', email).maybeSingle();
  if (!row) return NextResponse.json({ error: 'not-operator' }, { status: 403, headers: NO_STORE });
  return { email };
}
