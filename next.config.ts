import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The build checks the app's types only (see tsconfig.build.json); `tsc --noEmit` checks everything.
  typescript: { tsconfigPath: "tsconfig.build.json" },
};

export default nextConfig;
