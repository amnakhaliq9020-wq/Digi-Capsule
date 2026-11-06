import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

const rootEnv = path.resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  async rewrites() {
    const api = process.env.API_INTERNAL_URL || "http://127.0.0.1:3001";
    return [{ source: "/v1/:path*", destination: `${api}/v1/:path*` }];
  },
};

export default nextConfig;
