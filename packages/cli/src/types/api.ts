export interface PromptSummary {
  id?: string;
  slug: string;
  title: string;
  summary?: string | null;
  category?: string | null;
  model?: string | null;
  tags?: string[];
  version?: string | null;
  visibility?: "public" | "private";
  date?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PromptDetail extends PromptSummary {
  content: string;
  html?: string;
  variables?: { name: string; description: string; default?: string }[];
  links?: { label: string; url: string }[];
}

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

export type SkillsResponse = BstackLayer[];

export interface SkillDetail extends BstackSkill {
  layer: string;
}

export interface ContextResponse {
  app: {
    name: string;
    description: string;
  };
  features: Record<string, unknown>;
  conventions: {
    packageManager: string;
    linter: string;
    auth: string;
    coreLang: string;
    webLang: string;
  };
  stack: {
    framework: string;
    database: string;
    auth: string;
    ai: string;
    ui: string;
  };
}
