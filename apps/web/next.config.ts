import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@nats-console/shared'],
  devIndicators: false,

  // Proxy API requests to the backend
  // In single-container mode: API is at localhost:3001
  // In multi-container mode: API_URL env var points to the API service
  async rewrites() {
    const apiUrl = process.env.API_URL || 'http://localhost:3001';
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
      {
        source: '/health/:path*',
        destination: `${apiUrl}/health/:path*`,
      },
      {
        source: '/ws/:path*',
        destination: `${apiUrl}/ws/:path*`,
      },
    ];
  },
};

export default nextConfig;
