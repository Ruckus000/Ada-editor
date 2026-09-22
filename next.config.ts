import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // A stray lockfile higher up the filesystem otherwise makes Next guess the
  // wrong workspace root. Scripts run from the repo root.
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
