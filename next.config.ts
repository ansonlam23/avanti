import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components is off on purpose: nearly every screen here is live data
  // (orders, stock, chat), so we use the classic model and mark DB-reading
  // pages with `export const dynamic = "force-dynamic"`. See CONTRACTS.md.
  cacheComponents: false,
  // Clean screen recordings: no Next.js dev badge.
  devIndicators: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    // Owner onboarding uploads a phone photo + a ≤45 s voice note.
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
