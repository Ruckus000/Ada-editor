/**
 * Recorded listings for the offline gate. A recorder wraps a live fetcher and
 * saves each JSON or HTML listing it reads (never PDFs) under
 * fixtures/<platform>/; a replayer serves them back by URL, so the gate can run
 * every adapter without the network. Query strings that carry a signature
 * (sig=, se=, sp=) are redacted before anything is written.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');

const SIGNED = /([?&](?:sig|se|sp|sv|st|spr|srt|ss|skoid|sktid|skt|ske|sks|skv|sr)=)[^&"'\s<]*/gi;
/** Signed-URL parameters replaced with REDACTED, in URLs and in bodies. */
export const redact = (text) => String(text).replace(SIGNED, '$1REDACTED');
const keyOf = (url) => createHash('sha256').update(redact(url)).digest('hex').slice(0, 16);

export function createRecorder(fetcher, platform) {
  const dir = join(FIXTURES, platform);
  mkdirSync(dir, { recursive: true });
  const indexPath = join(dir, 'index.json');
  const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : {};
  const save = (url, text) => {
    const file = `${keyOf(url)}.txt`;
    writeFileSync(join(dir, file), redact(text));
    index[redact(url)] = file;
    writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
  };
  return {
    ...fetcher,
    async getText(url) {
      const r = await fetcher.getText(url);
      if (r.ok) save(url, r.text);
      return r;
    },
    async getJson(url) {
      const r = await fetcher.getText(url);
      if (!r.ok) return r;
      save(url, r.text);
      try { return { ok: true, json: JSON.parse(r.text), finalUrl: r.finalUrl }; } catch { return { ok: false, reason: 'not JSON' }; }
    },
  };
}

export function createReplayer(platform) {
  const dir = join(FIXTURES, platform);
  const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
  const read = (url) => {
    const file = index[redact(url)];
    return file ? readFileSync(join(dir, file), 'utf8') : null;
  };
  return {
    async getText(url) {
      const text = read(url);
      return text === null ? { ok: false, reason: `no fixture for ${redact(url)}` } : { ok: true, text, finalUrl: url };
    },
    async getJson(url) {
      const text = read(url);
      if (text === null) return { ok: false, reason: `no fixture for ${redact(url)}` };
      return { ok: true, json: JSON.parse(text), finalUrl: url };
    },
    async getPdf() {
      return { ok: false, reason: 'the replayer serves listings only' };
    },
    stats: () => ({}),
  };
}
