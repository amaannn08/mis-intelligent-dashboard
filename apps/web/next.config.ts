import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@mis/db', '@mis/core'],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
