import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
};

export default nextConfig;
