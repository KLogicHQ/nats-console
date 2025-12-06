import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@nats-console/shared'],
  devIndicators: false,
};

export default nextConfig;
