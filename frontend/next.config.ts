import type { NextConfig } from "next";

const backendUrl = (process.env.BACKEND_URL ?? "http://localhost:4000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  // Optional same-origin proxy. The app calls NEXT_PUBLIC_API_URL directly.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
  // Increase the proxy timeout well beyond the default 1500ms
  experimental: {
    proxyTimeout: 120_000, // 2 minutes
  },
};

export default nextConfig;
