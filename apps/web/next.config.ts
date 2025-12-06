import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@nats-console/shared'],
  devIndicators: false,
};

export default nextConfig;
