/**
 * Static price table per model. Numbers are USD per million tokens.
 * Update when Anthropic / OpenAI ship new tiers — this is the single
 * source of truth for cost computation.
 *
 * Costs are stored on prompt_invocation rows at completion time, so
 * later price changes don't retroactively rewrite historical cost.
 */
type ModelPricing = { inputPer1M: number; outputPer1M: number };

const PRICES: Record<string, ModelPricing> = {
  "claude-sonnet-4.5": { inputPer1M: 3, outputPer1M: 15 },
  "claude-opus-4.5": { inputPer1M: 15, outputPer1M: 75 },
  "claude-haiku-4.5": { inputPer1M: 0.8, outputPer1M: 4 },
  "claude-sonnet-4": { inputPer1M: 3, outputPer1M: 15 },
  "claude-opus-4": { inputPer1M: 15, outputPer1M: 75 },
  "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10 },
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
};

/**
 * Compute USD cost for a model invocation. Returns null if the model
 * isn't in our price table — callers should treat null as "unknown" and
 * leave the column unset rather than guessing.
 */
export function computeCostUsd(
  model: string,
  tokensIn: number | null,
  tokensOut: number | null,
): number | null {
  const price = PRICES[model];
  if (!price) return null;
  const inT = tokensIn ?? 0;
  const outT = tokensOut ?? 0;
  return (inT / 1_000_000) * price.inputPer1M + (outT / 1_000_000) * price.outputPer1M;
}
