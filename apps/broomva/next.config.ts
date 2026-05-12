import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  typedRoutes: true,
  cacheComponents: true,
  skipTrailingSlashRedirect: true,
  transpilePackages: [
    "@broomva/billing",
    "@broomva/conformance",
    "@broomva/database",
    "@broomva/deploy",
    "@broomva/tenant",
  ],

  async rewrites() {
    return [
      { source: "/llms.txt", destination: "/api/llms" },
      { source: "/llms-full.txt", destination: "/api/llms-full" },
      // lifegw's default `auth.jwks_url` points at `/api/auth/jwks.json`
      // (see `core/life/crates/life-runtime/lifegw/src/config.rs`). The
      // Neon Auth catch-all `[...path]` ate the literal-folder version
      // because Next.js routes folders-with-dots through the catch-all,
      // so we serve the JWKS from `/api/auth/jwks` and rewrite the
      // canonical `.json` URL in.
      { source: "/api/auth/jwks.json", destination: "/api/auth/jwks" },
      // Media is no longer committed under public/ — it lives in Lago and is
      // served by /api/assets/[...path] (see route.ts). The rewrites below
      // make legacy /images/writing/* and /audio/writing/* URLs in the
      // content corpus continue to resolve transparently.
      {
        source: "/images/writing/:path*",
        destination: "/api/assets/images/writing/:path*",
      },
      {
        source: "/images/projects/:path*",
        destination: "/api/assets/images/projects/:path*",
      },
      {
        source: "/audio/writing/:path*",
        destination: "/api/assets/audio/writing/:path*",
      },
      {
        source: "/audio/projects/:path*",
        destination: "/api/assets/audio/projects/:path*",
      },
      {
        source: "/video/:path*",
        destination: "/api/assets/video/:path*",
      },
    ];
  },

  async redirects() {
    return [
      // Profile aliases — single canonical /profile
      { source: "/cv", destination: "/profile", permanent: true },
      { source: "/resume", destination: "/profile", permanent: true },
      { source: "/about", destination: "/profile", permanent: true },
      { source: "/carlos", destination: "/profile", permanent: true },
      // Writing canonicalization — /blog folds into /writing
      { source: "/blog", destination: "/writing", permanent: true },
      { source: "/blog/:slug", destination: "/writing/:slug", permanent: true },
    ];
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
      {
        source: "/images/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/audio/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: "https://broomva.tech",
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, PUT, DELETE, OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization",
          },
          { key: "Access-Control-Allow-Credentials", value: "true" },
        ],
      },
    ];
  },

  outputFileTracingExcludes: {
    "*": [
      "./public/audio/**",
      "./public/images/**",
    ],
  },
  outputFileTracingIncludes: {
    "/api/chat": ["./public/agent-knowledge.json"],
    "/api/chat/[id]/**": ["./public/agent-knowledge.json"],
  },
  experimental: {
    optimizePackageImports: [
      "react-tweet",
      "echarts-for-react",
      "lucide-react",
      "motion",
      "recharts",
      "sonner",
      "cmdk",
      "date-fns",
      "fuse.js",
      "shiki",
      "streamdown",
      "@streamdown/code",
      "@streamdown/math",
      "@streamdown/mermaid",
      "@radix-ui/react-accordion",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-avatar",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-collapsible",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-hover-card",
      "@radix-ui/react-icons",
      "@radix-ui/react-label",
      "@radix-ui/react-popover",
      "@radix-ui/react-progress",
      "@radix-ui/react-scroll-area",
      "@radix-ui/react-select",
      "@radix-ui/react-separator",
      "@radix-ui/react-slider",
      "@radix-ui/react-slot",
      "@radix-ui/react-switch",
      "@radix-ui/react-tabs",
      "@radix-ui/react-toggle",
      "@radix-ui/react-toggle-group",
      "@radix-ui/react-tooltip",
      "@dnd-kit/core",
      "@dnd-kit/modifiers",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
      "lexical",
      "@lexical/code",
      "@lexical/link",
      "@lexical/list",
      "@lexical/markdown",
      "@lexical/react",
      "@lexical/rich-text",
      "codemirror",
      "@codemirror/lang-javascript",
      "@codemirror/lang-python",
      "@codemirror/state",
      "@codemirror/view",
      "@codemirror/theme-one-dark",
    ],
  },
  serverExternalPackages: ["pino", "pino-pretty"],
  images: {
    formats: ["image/avif", "image/webp"],
    // Next.js 16 requires explicit qualities; default is [75].
    // optimizeProseImages in lib/content.ts emits q=80 URLs, which would
    // otherwise be rejected by Vercel with INVALID_IMAGE_OPTIMIZE_REQUEST.
    qualities: [75, 80],
    remotePatterns: [
      {
        hostname: "avatar.vercel.sh",
      },
      {
        protocol: "https",
        hostname: "*.googleusercontent.com",
        pathname: "**",
      },
      {
        hostname: "avatars.githubusercontent.com",
      },
      {
        hostname: "*.public.blob.vercel-storage.com",
      },
      { hostname: "www.google.com" },
      {
        hostname: "models.dev",
      },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  // Source map upload — reads SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT from env
  silent: !process.env.CI,
  widenClientFileUpload: true,
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
  disableLogger: true,
  automaticVercelMonitors: true,
});
