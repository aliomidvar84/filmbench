import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@filmbench/shared"],
//  output: "standalone",
};

export default nextConfig;
