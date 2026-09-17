#!/usr/bin/env node
/**
 * Static server for design-system/.
 *
 * The preview must be served over HTTP: Chromium treats an ES module loaded
 * from a file:// origin as cross-origin and blocks it, so the hydration bundle
 * never runs and the page is silently inert. Shared by the a11y gate and by
 * `npm run preview`.
 */

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, normalize, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../design-system');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

/** @param port 0 picks a free port. Returns the server and its origin. */
export async function serve(port = 0) {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]));
    // Reject traversal outright rather than trying to sanitise it.
    const file = resolve(ROOT, '.' + (path === '/' ? '/preview.html' : path));
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    // Read BEFORE writing headers: writing them first means a failed read
    // cannot fall back to a 404, because the headers are already sent.
    let body;
    try {
      body = readFileSync(file);
    } catch {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

// CLI: node scripts/serve-preview.mjs
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { origin } = await serve(Number(process.env.PORT ?? 8080));
  console.log(`design system preview: ${origin}`);
  console.log('Ctrl-C to stop.');
}
