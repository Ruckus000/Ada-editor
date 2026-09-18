import { defineConfig, devices } from '@playwright/test';
import { screenReaderConfig } from '@guidepup/playwright';

/**
 * Screen reader projects only. The token, accessibility-tree and Orca gates are
 * plain Node scripts; Playwright is here solely because Guidepup drives NVDA and
 * VoiceOver through it.
 *
 * `screenReaderConfig` is Guidepup's own required baseline: one worker, no
 * parallelism (a screen reader is a singleton), and — the part that matters —
 * `headless: false`. Playwright defaults to headless, and a headless browser has
 * no window for a screen reader to read. Omitting this is why NVDA announced a
 * single phrase, "blank", and why VoiceOver read the Finder instead of the page.
 */
export default defineConfig({
  ...screenReaderConfig,
  testDir: './tests/screen-reader',
  timeout: 5 * 60 * 1000,
  retries: process.env.CI ? 1 : 0,
  reportSlowTests: null,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  webServer: {
    command: 'node scripts/serve-preview.mjs',
    url: 'http://127.0.0.1:8080/preview.html',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'nvda',
      testMatch: /nvda\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:8080',
        headless: false,
        // Chromium does not expose its accessibility tree to platform assistive
        // technology unless renderer accessibility is forced on.
        launchOptions: { args: ['--force-renderer-accessibility'] },
      },
    },
    {
      name: 'voiceover',
      testMatch: /voiceover\.spec\.ts/,
      use: {
        ...devices['Desktop Safari'],
        baseURL: 'http://127.0.0.1:8080',
        headless: false,
      },
    },
  ],
});
