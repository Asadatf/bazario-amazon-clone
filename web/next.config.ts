import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // This app is its own root (the repo root has no lockfile); stops Next guessing a parent directory.
  outputFileTracingRoot: __dirname,
  // Optional same-origin mode: with NEXT_PUBLIC_API_URL empty, the browser calls /api/v1/* on this domain and
  // Next proxies it to the API. The refresh cookie is then first-party, which avoids third-party-cookie blocking.
  async rewrites() {
    const target = process.env.API_PROXY_TARGET;
    return target ? [{ source: '/api/v1/:path*', destination: `${target}/api/v1/:path*` }] : [];
  },
};

export default nextConfig;
