/**
 * Resolve a Chromium binary across environments.
 *
 * Shared because it was not: verify-a11y.mjs learned to search properly while
 * verify-orca.mjs kept a hardcoded container path, so on CI the Orca gate found
 * no browser, skipped, and exited 0 — reporting success for a screen reader
 * test that never ran.
 */

import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

export function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    '/opt/pw-browsers',
    process.env.HOME ? `${process.env.HOME}/.cache/ms-playwright` : null,
  ].filter((r) => typeof r === 'string' && r.length > 0);

  for (const root of roots) {
    try {
      for (const dir of readdirSync(root).filter((d) => d.startsWith('chromium'))) {
        for (const rel of [
          'chrome-linux/chrome',
          'chrome-linux/headless_shell',
          'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
        ]) {
          const candidate = resolve(root, dir, rel);
          if (existsSync(candidate)) return candidate;
        }
      }
    } catch { /* root absent */ }
  }

  for (const name of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']) {
    if (existsSync(name)) return name;
  }
  return null;
}
