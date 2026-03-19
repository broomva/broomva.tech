import { config } from "@/lib/config";

export function GET() {
  const content = `# ${config.appName}

> ${config.appDescription}

## Overview

broomva.tech is the personal platform of Carlos D. Escobar-Valbuena. It serves as a hub for projects, long-form writing, technical notes, reusable prompts, and an AI-powered chat interface. The platform is built on a Rust Agent OS stack with orchestration, governance, and kernel layers.

## Sections

- [Projects](${config.appUrl}/projects): Active projects including the Agent OS, orchestration runtimes, and AI-native tools.
- [Writing](${config.appUrl}/writing): Long-form essays on harness engineering, control systems, and AI-native infrastructure.
- [Notes](${config.appUrl}/notes): Short operational notes from day-to-day agent engineering work.
- [Prompts](${config.appUrl}/prompts): Reusable, versioned prompts for agent workflows. Available via API at /api/prompts.
- [Skills](${config.appUrl}/skills): The Broomva Stack — agent skills across multiple domains.
- [Chat](${config.appUrl}/chat): AI chat interface powered by multiple model providers.
- [Start Here](${config.appUrl}/start-here): Guided entry point to the platform and its core concepts.
- [Now](${config.appUrl}/now): Monthly snapshot of current build focus and open questions.
- [Contact](${config.appUrl}/contact): Ways to collaborate.

## APIs

- \`GET /api/prompts\` — List all prompts (filterable by category, tag)
- \`GET /api/prompts/[slug]\` — Get a single prompt by slug
- \`GET /api/chat\` — AI chat endpoint (authenticated)
- \`GET /sitemap.xml\` — Full sitemap
- \`GET /llms-full.txt\` — Extended documentation for LLMs

## Key Topics

- Agent OS (Rust): Arcan runtime, Lago persistence, Autonomic homeostasis
- Harness Engineering: control metalayers, safety shields, governance
- Orchestration: Symphony daemon, workflow automation
- AI-native development: agent loops, tool execution, MCP integration

## Contact

- Website: ${config.appUrl}
- Email: ${config.organization.contact.privacyEmail}
`;

  return new Response(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
