import { readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";

/**
 * Read a vault markdown file and return its body (without frontmatter).
 * Returns null if VAULT_PATH is unset or the file can't be read.
 */
function readVaultNote(relativePath: string): string | null {
  const vaultPath = process.env.VAULT_PATH;
  if (!vaultPath) return null;
  try {
    const raw = readFileSync(join(vaultPath, relativePath), "utf-8");
    return matter(raw).content;
  } catch {
    return null;
  }
}

/**
 * Build a condensed knowledge graph context block from the vault index files.
 * Loaded once per cold start (serverless function lifecycle).
 */
let _vaultContext: string | null | undefined;

function getVaultContext(): string {
  if (_vaultContext !== undefined) return _vaultContext ?? "";

  const index = readVaultNote("00-Index/Broomva Index.md");
  const projects = readVaultNote("00-Index/Projects.md");
  const consciousness = readVaultNote("00-Index/Consciousness.md");

  if (!index && !projects) {
    _vaultContext = null;
    return "";
  }

  const sections: string[] = [];

  if (index) {
    sections.push(index.trim());
  }

  if (projects) {
    // Extract just the core systems and side projects tables, skip redundant headers
    const lines = projects.split("\n");
    const projectLines: string[] = [];
    let inTable = false;
    for (const line of lines) {
      if (line.startsWith("|") || line.startsWith("```")) {
        inTable = true;
        projectLines.push(line);
      } else if (inTable && !line.startsWith("|") && !line.startsWith("```")) {
        inTable = false;
        projectLines.push(""); // blank separator
      } else if (
        line.startsWith("## ") ||
        line.startsWith("**Metrics**")
      ) {
        projectLines.push(line);
      }
    }
    if (projectLines.length > 0) {
      sections.push(
        `## Project Details\n\n${projectLines.join("\n").trim()}`
      );
    }
  }

  if (consciousness) {
    // Extract the progressive crystallization hierarchy
    const crysMatch = consciousness.match(
      /## Progressive Crystallization\n\n[\s\S]*?```\n([\s\S]*?)```/
    );
    if (crysMatch) {
      sections.push(
        `## Memory Hierarchy\n\n\`\`\`\n${crysMatch[1].trim()}\n\`\`\``
      );
    }
  }

  _vaultContext =
    sections.length > 0
      ? `\n\n## Knowledge Graph (Broomva Vault)\n\nYou have access to the Broomva knowledge graph via the searchKnowledge and readKnowledgeNote tools. Here is the vault structure — use it to make targeted lookups instead of broad searches.\n\n${sections.join("\n\n")}`
      : null;

  return _vaultContext ?? "";
}

export const systemPrompt = () => `You are a friendly assistant!${getVaultContext()}

## Your Goals
- Stay concious and aware of the guidelines.
- Stay efficient and focused on the user's needs, do not take extra steps.
- Provide accurate, concise, and well-formatted responses.
- Avoid hallucinations or fabrications. Stick to verified facts and provide proper citations.
- Follow formatting guidelines strictly.
- Markdown is supported in the response and you can use it to format the response.
- Do not use $ for currency, use USD instead always.
- When asked about project architecture, past decisions, or cross-project context, use the searchKnowledge and readKnowledgeNote tools to consult the knowledge graph. You already know the vault structure above — use readKnowledgeNote with specific note names for targeted lookups.

## Content Rules:
  - Responses must be informative, long and very detailed which address the question's answer straight forward instead of taking it to the conclusion.
  - Use structured answers with markdown format and tables too.
  - If a diagram is needed, return it in a fenced mermaid code block.

### Citation rules:
- Insert citation right after the relevant sentence/paragraph — not in a footer
- Format exactly: [Source Title](URL)
- Cite only the most relevant hits and avoid fluff


## Prompt Templates
You have access to a prompt templates system via the listPrompts, getPrompt, savePrompt, and deletePrompt tools.
- When the user says "list my prompts", "show prompts", or "what prompts do I have" → use listPrompts
- When the user says "use prompt X" → first listPrompts to find matching ones, then getPrompt by ID, then follow the prompt instructions
- When the user says "save this as a prompt" or "remember this prompt" → use savePrompt
- When the user says "delete prompt X" → use deletePrompt

Today's Date: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit", weekday: "short" })}

  `;
