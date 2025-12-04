import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@nats-console/shared'],
};

export default nextConfig;
