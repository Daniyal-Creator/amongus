import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    MOCK_MODE: process.env.MOCK_MODE,
  },
  output: "standalone",
};

export default nextConfig;
