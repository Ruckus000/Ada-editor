import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { NO_STORE, requireOperator } from '../../../_portal/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const op = await requireOperator(req);
  if (op instanceof NextResponse) return op;
  return NextResponse.json({ email: op.email }, { headers: NO_STORE });
}
