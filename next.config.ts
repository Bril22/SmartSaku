import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "xlsx", "firebase-admin"],
};

export default nextConfig;
