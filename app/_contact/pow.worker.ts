import { solve } from './solve';

/** Solves the contact form's puzzle off the main thread: at the hardest
 *  difficulty a slow phone works for several seconds, and typing mustn't lag. */
const ctx = self as unknown as { onmessage: ((e: MessageEvent<{ challenge: string; bits: number }>) => void) | null; postMessage(v: string | null): void };
ctx.onmessage = (e) => { void solve(e.data.challenge, e.data.bits).then((nonce) => ctx.postMessage(nonce)); };
