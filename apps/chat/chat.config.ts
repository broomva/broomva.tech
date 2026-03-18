import type { ConfigInput } from "@/lib/config-schema";

const isProd = process.env.NODE_ENV === "production";

/**
 * ChatJS Configuration
 *
 * Edit this file to customize your app.
 * @see https://chatjs.dev/docs/reference/config
 */
const config = {
  appPrefix: "broomva",
  appName: "broomva.tech",
  appTitle: "broomva.tech — Building autonomous software systems",
  appDescription:
    "Rust Agent OS stack, control metalayers, and harness engineering for AI-native workflows. Chat, projects, writing, and notes by Carlos D. Escobar-Valbuena.",
  appUrl: "https://broomva.tech",
  organization: {
    name: "broomva.tech",
    contact: {
      privacyEmail: "carlos@broomva.tech",
      legalEmail: "carlos@broomva.tech",
    },
  },
  services: {
    hosting: "Vercel",
    aiProviders: [
      "OpenAI",
      "Anthropic",
      "xAI",
      "Google",
      "Meta",
      "Mistral",
      "Alibaba",
      "Amazon",
      "Cohere",
      "DeepSeek",
      "Perplexity",
      "Vercel",
      "Inception",
      "Moonshot",
      "Morph",
      "ZAI",
    ],
    paymentProcessors: [],
  },
  features: {
    sandbox: true, // Vercel-native, no key needed
    webSearch: true, // Requires TAVILY_API_KEY or FIRECRAWL_API_KEY
    urlRetrieval: false, // Requires FIRECRAWL_API_KEY
    deepResearch: true, // Requires webSearch
    mcp: false, // Requires MCP_ENCRYPTION_KEY
    imageGeneration: true, // Requires BLOB_READ_WRITE_TOKEN
    attachments: true, // Requires BLOB_READ_WRITE_TOKEN
    followupSuggestions: true,
  },
  legal: {
    minimumAge: 13,
    governingLaw: "United States",
    refundPolicy: "no-refunds",
  },
  policies: {
    privacy: {
      title: "Privacy Policy",
      lastUpdated: "July 24, 2025",
    },
    terms: {
      title: "Terms of Service",
      lastUpdated: "July 24, 2025",
    },
  },
  authentication: {
    google: false, // Requires AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET
    github: false, // Requires AUTH_GITHUB_ID + AUTH_GITHUB_SECRET
    vercel: false, // Requires VERCEL_APP_CLIENT_ID + VERCEL_APP_CLIENT_SECRET
  },
  models: {
    gateway: "vercel",
    providerOrder: ["openai", "google", "anthropic", "xai"],
    disabledModels: ["morph/morph-v3-large", "morph/morph-v3-fast"],
    curatedDefaults: [
      // OpenAI
      "openai/gpt-5-nano",
      "openai/gpt-5-mini",
      "openai/gpt-5.2",
      "openai/gpt-5.2-chat",
      // Google
      "google/gemini-2.5-flash-lite",
      "google/gemini-3-flash",
      "google/gemini-3-pro-preview",
      // Anthropic
      "anthropic/claude-sonnet-4.5",
      "anthropic/claude-opus-4.5",
      // xAI
      "xai/grok-4",
    ],
    anonymousModels: [
      "google/gemini-2.5-flash-lite",
      "openai/gpt-5-mini",
      "openai/gpt-5-nano",
      "anthropic/claude-haiku-4.5",
    ],
    defaults: {
      chat: "openai/gpt-5-mini",
      title: "openai/gpt-5-nano",
      pdf: "openai/gpt-5-mini",
      artifact: "openai/gpt-5-nano",
      artifactSuggestion: "openai/gpt-5-mini",
      followupSuggestions: "openai/gpt-5-nano",
      suggestions: "openai/gpt-5-mini",
      polishText: "openai/gpt-5-mini",
      formatSheet: "openai/gpt-5-mini",
      analyzeSheet: "openai/gpt-5-mini",
      codeEdits: "openai/gpt-5-mini",
      chatImageCompatible: "openai/gpt-4o-mini",
      image: "google/gemini-3-pro-image",
      deepResearch: "google/gemini-2.5-flash-lite",
      deepResearchFinalReport: "google/gemini-3-flash",
    },
  },
  anonymous: {
    credits: isProd ? 10 : 1000,
    availableTools: [],
    rateLimit: {
      requestsPerMinute: isProd ? 5 : 60,
      requestsPerMonth: isProd ? 10 : 1000,
    },
  },
  attachments: {
    maxBytes: 1024 * 1024, // 1MB
    maxDimension: 2048,
    acceptedTypes: {
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
      "application/pdf": [".pdf"],
    },
  },
} satisfies ConfigInput;

export default config;
