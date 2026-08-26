import { config } from "@/lib/config";
import { getAllSlugs, getContentBySlug } from "@/lib/content";

export async function GET() {
  const [projectSlugs, writingSlugs, noteSlugs, promptSlugs] =
    await Promise.all([
      getAllSlugs("projects"),
      getAllSlugs("writing"),
      getAllSlugs("notes"),
      getAllSlugs("prompts"),
    ]);

  const projectEntries = await Promise.all(
    projectSlugs.map(async (slug) => {
      const entry = await getContentBySlug("projects", slug);
      return entry
        ? `- [${entry.title}](${config.appUrl}/projects/${slug}): ${entry.summary ?? ""}`
        : null;
    }),
  );

  const writingEntries = await Promise.all(
    writingSlugs.map(async (slug) => {
      const entry = await getContentBySlug("writing", slug);
      return entry
        ? `- [${entry.title}](${config.appUrl}/writing/${slug}): ${entry.summary ?? ""}`
        : null;
    }),
  );

  const noteEntries = await Promise.all(
    noteSlugs.map(async (slug) => {
      const entry = await getContentBySlug("notes", slug);
      return entry
        ? `- [${entry.title}](${config.appUrl}/notes/${slug}): ${entry.summary ?? ""}`
        : null;
    }),
  );

  const promptEntries = await Promise.all(
    promptSlugs.map(async (slug) => {
      const entry = await getContentBySlug("prompts", slug);
      return entry
        ? `- [${entry.title}](${config.appUrl}/prompts/${slug}): ${entry.summary ?? ""}`
        : null;
    }),
  );

  const content = `# ${config.appName} — Extended Site Index

> ${config.appDescription}

## About

broomva.tech is the personal platform of Carlos D. Escobar-Valbuena, focused on building autonomous software systems. The platform combines a Rust Agent OS stack (Arcan runtime, Lago persistence, Autonomic homeostasis, Praxis tool execution, Vigil observability, Spaces networking) with AI-native web applications.

The core thesis: democratize creation through AI agents. Anyone should be able to build, ship, and monetize what they love — with autonomous agents handling the operational complexity.

## Technology Stack

- **Runtime**: Next.js 16 on Vercel (Turborepo monorepo)
- **Agent OS**: Rust workspace — Arcan (runtime), Lago (event-sourced persistence), Autonomic (homeostasis), Praxis (tool execution), Vigil (OpenTelemetry observability), Spaces (SpacetimeDB networking)
- **Orchestration**: Symphony daemon for coding agent dispatch
- **AI routing**: deployment-selected providers may include ${config.services.aiProviders.join(", ")}; names are not availability promises
- **Design System**: Arcan Glass (dark-first, glass effects, Tailwind v4 + shadcn/ui)

## Projects

${projectEntries.filter(Boolean).join("\n")}

## Writing

${writingEntries.filter(Boolean).join("\n")}

## Notes

${noteEntries.filter(Boolean).join("\n")}

## Prompts

${promptEntries.filter(Boolean).join("\n")}

## APIs

### Prompts API
- \`GET ${config.appUrl}/api/prompts\` — List all prompts. Query params: \`category\`, \`tag\`, \`search\`.
- \`GET ${config.appUrl}/api/prompts/[slug]\` — Get a single prompt by slug. Returns title, content, category, tags.

### Chat API
- \`POST ${config.appUrl}/api/chat\` — AI chat endpoint. Requires authentication. Supports streaming responses via Server-Sent Events.

### Content API
- \`GET ${config.appUrl}/sitemap.xml\` — Full sitemap with all pages and content
- \`GET ${config.appUrl}/llms.txt\` — Concise site overview for LLMs
- \`GET ${config.appUrl}/robots.txt\` — Crawler directives
- \`GET ${config.appUrl}/<kind>/<slug>.md\` — Raw markdown for any content page (kind: writing, projects, notes, prompts)

## Features

- **AI Chat**: authenticated streaming chat using the deployed model catalog; tools and provider routes depend on active configuration and credentials
- **Knowledge Graph**: Obsidian vault integration for connected note-taking
- **Memory**: persistence is deployment-dependent and not represented as universally available
- **Content Platform**: MDX-based writing, projects, notes with full-text search
- **Prompt Library**: Versioned, categorized prompts with API access

## Contact

- Website: ${config.appUrl}
- Email: ${config.organization.contact.privacyEmail}
- Operator: ${config.organization.name}
`;

  return new Response(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
