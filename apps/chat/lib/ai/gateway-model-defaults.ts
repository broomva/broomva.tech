import type { GatewayType } from "./gateways/registry";

type ModelDefaults = {
  providerOrder: string[];
  disabledModels: string[];
  curatedDefaults: string[];
  anonymousModels: string[];
  defaults: {
    chat: string;
    title: string;
    pdf: string;
    artifact: string;
    artifactSuggestion: string;
    followupSuggestions: string;
    suggestions: string;
    polishText: string;
    formatSheet: string;
    analyzeSheet: string;
    codeEdits: string;
    chatImageCompatible: string;
    image: string;
    deepResearch: string;
    deepResearchFinalReport: string;
  };
};

const multiProviderDefaults = {
  providerOrder: ["openai", "google", "anthropic"],
  disabledModels: [],
  curatedDefaults: [
    "openai/gpt-5-nano",
    "openai/gpt-5-mini",
    "openai/gpt-5.2",
    "openai/gpt-5.2-chat",
    "google/gemini-2.5-flash-lite",
    "google/gemini-3-flash",
    "google/gemini-3-pro-preview",
    "anthropic/claude-sonnet-4.5",
    "anthropic/claude-opus-4.5",
    "xai/grok-4",
  ],
  anonymousModels: ["google/gemini-2.5-flash-lite", "openai/gpt-5-nano"],
  defaults: {
    chat: "openai/gpt-5-mini",
    title: "openai/gpt-5-nano",
    pdf: "openai/gpt-5-mini",
    artifact: "openai/gpt-5-nano",
    artifactSuggestion: "openai/gpt-5-mini",
    followupSuggestions: "google/gemini-2.5-flash-lite",
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
} satisfies ModelDefaults;

const openaiOnlyDefaults = {
  providerOrder: ["openai"],
  disabledModels: [],
  curatedDefaults: [
    "gpt-5-nano",
    "gpt-5-mini",
    "gpt-5.2",
    "gpt-5.2-chat-latest",
  ],
  anonymousModels: ["gpt-5-nano"],
  defaults: {
    chat: "gpt-5-mini",
    title: "gpt-5-nano",
    pdf: "gpt-5-mini",
    artifact: "gpt-5-nano",
    artifactSuggestion: "gpt-5-mini",
    followupSuggestions: "gpt-5-nano",
    suggestions: "gpt-5-mini",
    polishText: "gpt-5-mini",
    formatSheet: "gpt-5-mini",
    analyzeSheet: "gpt-5-mini",
    codeEdits: "gpt-5-mini",
    chatImageCompatible: "gpt-4o-mini",
    image: "gpt-image-1",
    deepResearch: "gpt-5-nano",
    deepResearchFinalReport: "gpt-5-mini",
  },
} satisfies ModelDefaults;

export const GATEWAY_MODEL_DEFAULTS: Record<GatewayType, ModelDefaults> = {
  vercel: multiProviderDefaults,
  openrouter: multiProviderDefaults,
  openai: openaiOnlyDefaults,
  "openai-compatible": openaiOnlyDefaults,
};
