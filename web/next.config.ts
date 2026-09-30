import type { NextConfig } from 'next';
const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
const apiOrigin = new URL(configuredApiUrl).origin;
const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${apiOrigin}/api/:path*` },
      { source: '/sanctum/:path*', destination: `${apiOrigin}/sanctum/:path*` },
    ];
  },
};
export default nextConfig;
