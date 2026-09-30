import { NextResponse } from 'next/server';
import { contactReady, issueChallenge } from '../../../_contact/server';
import { POW_BITS } from '../../../_contact/rules';

export const dynamic = 'force-dynamic';

/** A fresh proof-of-work challenge. Fetched when the contact page loads; the
 *  issue time inside it is what the "too fast" check measures from. */
export function GET() {
  if (!contactReady) return NextResponse.json({ error: 'not-set-up' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json({ challenge: issueChallenge(), bits: POW_BITS }, { headers: { 'Cache-Control': 'no-store' } });
}
