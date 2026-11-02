import type { NextConfig } from 'next';
const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
const apiOrigin = new URL(configuredApiUrl).origin;
const vinextLifecycle = process.env.npm_lifecycle_event?.endsWith(':vinext') ?? false;
const nextConfig: NextConfig = {
  ...(vinextLifecycle ? {} : { output: 'standalone' as const }),
  async headers() {
    return ['/admin', '/admin/:path*', '/account', '/account/:path*', '/login', '/worker', '/worker/:path*', '/api/:path*'].map(source => ({ source, headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }] }));
  },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${apiOrigin}/api/:path*` },
    ];
  },
};
export default nextConfig;
