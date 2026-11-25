import { agentProviderDefinitions, geminiCarbonModel } from "../../shared/agent-providers";

// Standard paid-tier Gemini API USD per million tokens, verified 2026-11-24.
// https://ai.google.dev/gemini-api/docs/pricing
// Output rates include thinking/reasoning tokens; cached reads are 5% of standard input (implicit caching).
// Gemini 4 Carbon introductory rates ($2/$0.10/$10) run through 2026-11-30; standard rates ($4/$0.20/$20) are used.
const rates: Record<string, { input: number; cached: number; output: number }> = {
  [agentProviderDefinitions.gemini.model]: { input: 3, cached: 0.15, output: 15 },
  [geminiCarbonModel]: { input: 4, cached: 0.2, output: 20 },
  [agentProviderDefinitions.gemini.textModel]: { input: 1.5, cached: 0.075, output: 7.5 },
};

export interface GeminiPricedUsage {
  input_tokens: number;
  cached_input_tokens: number | null;
  output_tokens: number;
}

/** Price Gemini usage at standard API rates: cached reads are a subset of input; thinking is part of output. */
export function geminiApiCost(model: string, usage: GeminiPricedUsage): number | null {
  const rate = Object.hasOwn(rates, model) ? rates[model] : undefined;
  if (!rate) return null;
  const { input_tokens: input, cached_input_tokens: rawCached, output_tokens: output } = usage;
  if (!Number.isFinite(input) || input < 0 || !Number.isFinite(output) || output < 0) return null;
  if (rawCached !== null && (!Number.isFinite(rawCached) || rawCached < 0 || rawCached > input)) {
    return null;
  }
  const cached = rawCached ?? 0;
  return ((input - cached) * rate.input + cached * rate.cached + output * rate.output) / 1e6;
}
