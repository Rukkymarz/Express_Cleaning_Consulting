import type { NextConfig } from 'next';
const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
const apiOrigin = new URL(configuredApiUrl).origin;
const nextConfig: NextConfig = {
  output: 'standalone',
  async headers() {
    return ['/admin', '/admin/:path*', '/account', '/account/:path*', '/login', '/worker', '/worker/:path*', '/api/:path*', '/sanctum/:path*'].map(source => ({ source, headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }] }));
  },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${apiOrigin}/api/:path*` },
      { source: '/sanctum/:path*', destination: `${apiOrigin}/sanctum/:path*` },
    ];
  },
};
export default nextConfig;
