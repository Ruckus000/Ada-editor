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
    process.env.HOME ? `${process.env.HOME}/Library/Caches/ms-playwright` : null, // macOS
  ].filter((r) => typeof r === 'string' && r.length > 0);

  for (const root of roots) {
    try {
      // Newest revision first: stale caches accumulate, and old builds may not launch.
      const revision = (d) => Number(d.match(/(\d+)$/)?.[1] ?? 0);
      const dirs = readdirSync(root).filter((d) => d.startsWith('chromium')).sort((a, b) => revision(b) - revision(a));
      for (const dir of dirs) {
        for (const rel of [
          'chrome-linux/chrome',
          'chrome-linux/headless_shell',
          'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
          'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
          'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
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
