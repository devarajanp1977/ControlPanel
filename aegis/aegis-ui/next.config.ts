// next.config.ts — keep the build minimal while the UI proxies all privileged work through the local agent.
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  typedRoutes: true,
};

export default nextConfig;