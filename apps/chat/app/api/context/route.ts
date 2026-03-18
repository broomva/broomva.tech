import { NextResponse } from "next/server";
import config from "@/chat.config";

export async function GET() {
  return NextResponse.json({
    app: {
      name: config.appName,
      description: config.appDescription,
    },
    features: config.features,
    conventions: {
      packageManager: "Bun",
      linter: "Biome",
      auth: "Better Auth",
      coreLang: "Rust",
      webLang: "TypeScript",
    },
    stack: {
      framework: "Next.js 16 + Turborepo",
      database: "Neon Postgres + Drizzle ORM",
      auth: "Better Auth (Google, GitHub OAuth)",
      ai: "Vercel AI SDK v6 + AI Gateway",
      ui: "Tailwind v4 + Radix UI + shadcn/ui",
    },
  });
}
