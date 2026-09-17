import { defineConfig } from '@playwright/test';

/**
 * Screen reader projects only. The tree-level and Orca gates are plain Node
 * scripts (scripts/verify-a11y.mjs, scripts/verify-orca.mjs); Playwright is here
 * solely because Guidepup drives NVDA and VoiceOver through it.
 */
export default defineConfig({
  testDir: './tests/screen-reader',
  // Screen readers are slow and cannot be parallelised: there is one of them.
  workers: 1,
  fullyParallel: false,
  timeout: 5 * 60 * 1000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  webServer: {
    command: 'node scripts/serve-preview.mjs',
    url: 'http://127.0.0.1:8080/preview.html',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  use: { baseURL: 'http://127.0.0.1:8080' },
  // Each project matches its own spec. These pointed at a screen-reader.spec.ts
  // that was split into two files and never updated, so both projects matched
  // nothing and CI reported "No tests found" as a pass-shaped failure.
  projects: [
    { name: 'nvda', testMatch: /nvda\.spec\.ts/, use: { browserName: 'chromium' } },
    { name: 'voiceover', testMatch: /voiceover\.spec\.ts/, use: { browserName: 'webkit' } },
  ],
});
