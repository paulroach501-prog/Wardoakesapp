import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Service worker + manifest are served from /public.
  // Caching headers so the SW updates promptly during development.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
