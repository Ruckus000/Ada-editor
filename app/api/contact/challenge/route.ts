import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { POW_BASE_BITS, POW_MAX_BITS } from '../../../_contact/rules';
import { adminClient, clientIp, contactReady, hashNet, issueChallenge } from '../../../_contact/server';

export const dynamic = 'force-dynamic';

/** Sends in the last 10 minutes before the puzzle starts getting harder, and
 *  sends from one network in an hour before that network's puzzles do. */
const CALM = 20;
const NET_BUSY = 5;

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * A fresh proof-of-work challenge, fetched when the contact page loads. Its
 * difficulty follows the traffic (contact_bits()): a normal day costs a
 * browser well under a second, a flood up to 16 times that, and the issue
 * time inside it is what the "too fast" check measures from.
 */
export async function GET(req: NextRequest) {
  if (!contactReady) return NextResponse.json({ error: 'not-set-up' }, { status: 503, headers: NO_STORE });
  const { data, error } = await adminClient().rpc('contact_bits', {
    p_net_hash: hashNet(clientIp(req.headers)), p_base: POW_BASE_BITS, p_max: POW_MAX_BITS, p_calm: CALM, p_net_busy: NET_BUSY,
  });
  // If the count can't be read, fail hard rather than open: the max.
  const bits = error || typeof data !== 'number' ? POW_MAX_BITS : data;
  if (error) console.error('contact_bits failed', error);
  return NextResponse.json({ challenge: issueChallenge(bits), bits }, { headers: NO_STORE });
}
