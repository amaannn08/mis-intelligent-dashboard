import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@mis/db', '@mis/core'],
};

export default nextConfig;
