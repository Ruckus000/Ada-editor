import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

// Error reporting is browser-only by choice (app/_site/sentry.ts), so the
// plugin's "no server instrumentation file" warning is expected.
process.env.SENTRY_SUPPRESS_INSTRUMENTATION_FILE_WARNING ??= '1';

/** Keeps a response out of search engines. */
const NOINDEX = { key: 'X-Robots-Tag', value: 'noindex' };

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // A stray lockfile higher up the filesystem otherwise makes Next guess the
  // wrong workspace root. Scripts run from the repo root.
  outputFileTracingRoot: process.cwd(),
  // The landing page moved to / when the desk moved to /desk (search engines
  // and AI crawlers read / without running JavaScript). Old links still work.
  async redirects() {
    return [{ source: '/welcome', destination: '/', permanent: true }];
  },
  async headers() {
    return [
      // Vercel already sends HSTS. These cover framing (no one can overlay the
      // sign-in screen in an invisible frame), MIME sniffing, referrers leaking
      // document URLs, and browser features the app never uses.
      // ponytail: no script-src CSP — Next's inline bootstrap scripts need a
      // per-request nonce (middleware + dynamic rendering). Add it if the app ever
      // renders untrusted HTML outside React.
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
        ],
      },
      // The app's private screens never belong in search. Their pages say so in
      // metadata too, but the editor renders on demand, and Next streams its
      // metadata into <body>, where not every crawler looks. Keep in step with
      // isAppPath (app/_site/routes.ts) and scripts/verify-seo.mjs.
      ...['/desk', '/editor/:path*', '/sign-in', '/sign-up'].map((source) => ({ source, headers: [NOINDEX] })),
      // The production .vercel.app address stays out of search but keeps working:
      // anyone who used it has their session and unsynced edits in its storage.
      // `has` values are regular expressions, so the dots are escaped.
      { source: '/:path*', has: [{ type: 'host' as const, value: 'ada-editor-umber\\.vercel\\.app' }], headers: [NOINDEX] },
    ];
  },
};

// Error reports (app/_site/sentry.ts). Source maps go to Sentry, then
// are deleted from the deployment, when SENTRY_AUTH_TOKEN is set (production
// builds; the plugin reads SENTRY_ORG and SENTRY_PROJECT itself); other
// builds skip the upload. Reports reach Sentry through
// /monitoring on our own domain: blockers can't drop them, and the visitor's
// browser never talks to a fourth company. No tracing, replay or server SDK.
export default withSentryConfig(nextConfig, {
  tunnelRoute: '/monitoring',
  telemetry: false,
  silent: !process.env.CI,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  webpack: {
    autoInstrumentServerFunctions: false,
    autoInstrumentMiddleware: false,
    autoInstrumentAppDirectory: false,
    treeshake: { removeDebugLogging: true, removeTracing: true, excludeReplayIframe: true, excludeReplayShadowDOM: true, excludeReplayCompressionWorker: true },
  },
});
