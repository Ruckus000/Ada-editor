import { zeroBits } from './rules';

/** Finds a nonce whose SHA-256 (with the challenge) starts with `bits` zero
 *  bits. Shared by the worker and the main-thread fallback. */
export async function solve(challenge: string, bits: number, cancelled: () => boolean = () => false): Promise<string | null> {
  const enc = new TextEncoder();
  for (let n = 0; ; n++) {
    if (n % 2048 === 0 && cancelled()) return null;
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(`${challenge}:${n}`)));
    if (zeroBits(digest) >= bits) return String(n);
  }
}
