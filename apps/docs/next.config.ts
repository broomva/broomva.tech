import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

const withMDX = createMDX();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      // Stainless-style: append .md to any /docs URL to get raw markdown.
      { source: "/docs/:path*.md", destination: "/api/docs-md/:path*" },
    ];
  },
};

export default withMDX(nextConfig);
