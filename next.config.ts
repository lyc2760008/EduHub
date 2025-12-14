import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  turbopack: {
    // Explicitly set the project root to avoid Turbopack picking a higher-level lockfile
    root: __dirname,
  },
};

export default nextConfig;
