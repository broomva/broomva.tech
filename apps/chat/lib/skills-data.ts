export interface BstackSkill {
  slug: string;
  name: string;
  description: string;
  installCommand: string;
  skillsUrl: string;
}

export interface BstackLayer {
  id: string;
  name: string;
  description: string;
  skills: BstackSkill[];
}

export const BSTACK_LAYERS: BstackLayer[] = [
  {
    id: "foundation",
    name: "Foundation",
    description:
      "Control, governance, and workflow structure for safe agent operation.",
    skills: [
      {
        slug: "agentic-control-kernel",
        name: "Agentic Control Kernel",
        description:
          "LLM-as-controller with safety shields, typed schemas, multi-rate loop hierarchy, and EGRI-compatible evaluators.",
        installCommand: "npx skills add broomva/agentic-control-kernel",
        skillsUrl: "https://skills.sh/broomva/agentic-control-kernel",
      },
      {
        slug: "control-metalayer-loop",
        name: "Control Metalayer Loop",
        description:
          "Control primitives: setpoints, sensors, controller policy, actuators, feedback loops, stability and entropy controls.",
        installCommand: "npx skills add broomva/control-metalayer",
        skillsUrl: "https://skills.sh/broomva/control-metalayer",
      },
      {
        slug: "harness-engineering-playbook",
        name: "Harness Engineering",
        description:
          "Agent-first workflow: AGENTS.md, PLANS.md, deterministic smoke/test/lint harness, architecture boundaries, observability.",
        installCommand: "npx skills add broomva/harness-engineering-skill",
        skillsUrl: "https://skills.sh/broomva/harness-engineering-skill",
      },
    ],
  },
  {
    id: "memory",
    name: "Memory & Consciousness",
    description:
      "Persistent context across sessions — governance, knowledge graph, and episodic memory.",
    skills: [
      {
        slug: "agent-consciousness",
        name: "Agent Consciousness",
        description:
          "Three-substrate persistence: control metalayer (governance), Obsidian knowledge graph (declarative), conversation bridge (episodic).",
        installCommand: "npx skills add broomva/control-metalayer",
        skillsUrl: "https://skills.sh/broomva/control-metalayer",
      },
      {
        slug: "knowledge-graph-memory",
        name: "Knowledge Graph Memory",
        description:
          "Bridge Claude Code conversation logs to Obsidian knowledge graph with wikilinks, frontmatter, and session metadata.",
        installCommand: "npx skills add broomva/control-metalayer",
        skillsUrl: "https://skills.sh/broomva/control-metalayer",
      },
      {
        slug: "prompt-library",
        name: "Prompt Library",
        description:
          "Versioned, parameterized prompts with OAuth-authenticated write API. Pull, push, update prompts remotely.",
        installCommand: "npx skills add broomva/prompt-library",
        skillsUrl: "https://skills.sh/broomva/prompt-library",
      },
    ],
  },
  {
    id: "orchestration",
    name: "Orchestration",
    description:
      "Agent dispatch, project scaffolding, and self-improvement loops.",
    skills: [
      {
        slug: "symphony",
        name: "Symphony",
        description:
          "Rust orchestration engine for coding agents. Linear/GitHub tracker integration, control metalayer, lifecycle hooks.",
        installCommand: "npx skills add broomva/symphony",
        skillsUrl: "https://skills.sh/broomva/symphony",
      },
      {
        slug: "symphony-forge",
        name: "Symphony Forge",
        description:
          "CLI scaffolder: next-forge projects with composable control metalayer for AI agent governance.",
        installCommand: "npx skills add broomva/symphony-forge",
        skillsUrl: "https://skills.sh/broomva/symphony-forge",
      },
      {
        slug: "autoany",
        name: "Autoany",
        description:
          "Evaluator-Governed Recursive Improvement (EGRI). Turns ambiguous goals into safe, measurable self-improvement loops.",
        installCommand: "npx skills add broomva/autoany",
        skillsUrl: "https://skills.sh/broomva/autoany",
      },
    ],
  },
  {
    id: "research",
    name: "Research & Intelligence",
    description:
      "Multi-source research, skills inventory, and content generation.",
    skills: [
      {
        slug: "deep-dive-research-orchestrator",
        name: "Deep Research Orchestrator",
        description:
          "Multi-dimensional research using coordinated AI specialists across 10+ sources with citation tracking.",
        installCommand: "npx skills add broomva/deep-dive-research-skill",
        skillsUrl: "https://skills.sh/broomva/deep-dive-research-skill",
      },
      {
        slug: "skills",
        name: "Skills Inventory",
        description:
          "Canonical reference of 83+ agent skills across 15 domains. Browse, search, and discover capabilities.",
        installCommand: "npx skills add broomva/skills",
        skillsUrl: "https://skills.sh/broomva/skills",
      },
      {
        slug: "skills-showcase",
        name: "Skills Showcase",
        description:
          "Remotion video generator + X thread copy for showcasing the full agent skills inventory.",
        installCommand: "npx skills add broomva/skills",
        skillsUrl: "https://skills.sh/broomva/skills",
      },
    ],
  },
  {
    id: "design",
    name: "Design & Implementation",
    description:
      "BroomVA design system and production-grade project templates.",
    skills: [
      {
        slug: "arcan-glass",
        name: "Arcan Glass",
        description:
          "BroomVA trademark web styling: glass/frosted effects, dark-first themes, AI Blue tokens for Next.js + Tailwind v4.",
        installCommand: "npx skills add broomva/arcan-glass",
        skillsUrl: "https://skills.sh/broomva/arcan-glass",
      },
      {
        slug: "next-forge",
        name: "Next Forge",
        description:
          "Production Next.js SaaS template: Turborepo, authentication, payments, observability, control metalayer.",
        installCommand: "npx skills add broomva/symphony-forge",
        skillsUrl: "https://skills.sh/broomva/symphony-forge",
      },
    ],
  },
  {
    id: "platform",
    name: "Platform Specialties",
    description: "Domain-specific decision tools and content pipelines.",
    skills: [
      {
        slug: "alkosto-wait-optimizer",
        name: "Alkosto Wait Optimizer",
        description:
          "Probability-based decision tool for optimizing wait times with uncertainty handling and cutoff rules.",
        installCommand: "npx skills add broomva/alkosto-wait-optimizer-skill",
        skillsUrl: "https://skills.sh/broomva/alkosto-wait-optimizer-skill",
      },
      {
        slug: "content-creation",
        name: "Content Creation",
        description:
          "Full pipeline: idea to published blog post, Remotion video, and social media distribution across platforms.",
        installCommand: "npx skills add broomva/content-creation",
        skillsUrl: "https://skills.sh/broomva",
      },
      {
        slug: "finance-substrate",
        name: "Finance Substrate",
        description:
          "Personal finance and Colombian tax management. Bank imports, DIAN projection, Form 210 estimation.",
        installCommand: "npx skills add broomva/finance-substrate",
        skillsUrl: "https://skills.sh/broomva/finance-substrate",
      },
      {
        slug: "wealth-management",
        name: "Wealth Management",
        description:
          "Portfolio projections, asset allocation, Monte Carlo simulation, tax-efficient withdrawal planning.",
        installCommand: "npx skills add broomva/wealth-management",
        skillsUrl: "https://skills.sh/broomva/wealth-management",
      },
      {
        slug: "investment-management",
        name: "Investment Management",
        description:
          "Portfolio construction, factor models, backtesting, and multi-platform execution (Alpaca, Coinbase, Polymarket).",
        installCommand: "npx skills add broomva/investment-management",
        skillsUrl: "https://skills.sh/broomva/investment-management",
      },
    ],
  },
  {
    id: "strategy",
    name: "Strategy & Decision Intelligence",
    description:
      "Strategic thinking, decision logging, risk analysis, and productivity reviews integrated with the Obsidian vault.",
    skills: [
      {
        slug: "morning-briefing",
        name: "Morning Briefing",
        description:
          "Daily briefing: calendar, priorities, blockers, and strategic context from vault and git history.",
        installCommand: "npx skills add broomva/strategy-skills",
        skillsUrl: "https://skills.sh/broomva/strategy-skills",
      },
      {
        slug: "pre-mortem",
        name: "Pre-Mortem",
        description:
          "Structured risk analysis: imagine failure, identify causes, design mitigations before launch.",
        installCommand: "npx skills add broomva/strategy-skills",
        skillsUrl: "https://skills.sh/broomva/strategy-skills",
      },
      {
        slug: "drift-check",
        name: "Drift Check",
        description:
          "Detect priority drift between stated goals and actual execution patterns across sessions.",
        installCommand: "npx skills add broomva/strategy-skills",
        skillsUrl: "https://skills.sh/broomva/strategy-skills",
      },
      {
        slug: "decision-log",
        name: "Decision Log",
        description:
          "Structured decision records: context, options evaluated, decision rationale, and review triggers.",
        installCommand: "npx skills add broomva/strategy-skills",
        skillsUrl: "https://skills.sh/broomva/strategy-skills",
      },
      {
        slug: "weekly-review",
        name: "Weekly Review",
        description:
          "End-of-week retrospective: wins, blockers, lessons learned, and priorities for next week.",
        installCommand: "npx skills add broomva/strategy-skills",
        skillsUrl: "https://skills.sh/broomva/strategy-skills",
      },
      {
        slug: "braindump",
        name: "Braindump",
        description:
          "Rapid thought capture to structured Obsidian notes with tags, links, and action items.",
        installCommand: "npx skills add broomva/strategy-skills",
        skillsUrl: "https://skills.sh/broomva/strategy-skills",
      },
      {
        slug: "strategy-critique",
        name: "Strategy Critique",
        description:
          "Red-team your strategy: challenge assumptions, find blind spots, stress-test decisions.",
        installCommand: "npx skills add broomva/strategy-skills",
        skillsUrl: "https://skills.sh/broomva/strategy-skills",
      },
      {
        slug: "stakeholder-update",
        name: "Stakeholder Update",
        description:
          "Multi-audience status updates: adjusts detail, framing, and tone per stakeholder type.",
        installCommand: "npx skills add broomva/strategy-skills",
        skillsUrl: "https://skills.sh/broomva/strategy-skills",
      },
    ],
  },
];

export const TOTAL_SKILLS = BSTACK_LAYERS.reduce(
  (sum, layer) => sum + layer.skills.length,
  0,
);
export const TOTAL_LAYERS = BSTACK_LAYERS.length;
