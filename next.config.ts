import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // A stray lockfile higher up the filesystem otherwise makes Next guess the
  // wrong workspace root. Scripts run from the repo root.
  outputFileTracingRoot: process.cwd(),
  // Vercel already sends HSTS. These cover framing (no one can overlay the
  // sign-in screen in an invisible frame), MIME sniffing, referrers leaking
  // document URLs, and browser features the app never uses.
  // ponytail: no script-src CSP — Next's inline bootstrap scripts need a
  // per-request nonce (middleware + dynamic rendering). Add it if the app ever
  // renders untrusted HTML outside React.
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
      ],
    }];
  },
};

export default nextConfig;
