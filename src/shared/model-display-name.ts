import { agentProviderDefinitions, codexSolModel, geminiCarbonModel } from "./agent-providers";
const modelNames: Record<string, string> = {
  "claude-haiku-5-5": "Claude Haiku 5.5",
  "claude-opus-5-5": "Claude Opus 5.5",
  "deepseek-v4-pro": "DeepSeek V4 Pro",
  "deepseek-flash": "DeepSeek Flash",
  "gemini-4-neon": "Gemini 4 Neon",
  [geminiCarbonModel]: "Gemini 4 Carbon",
  "gemini-4-hydrogen": "Gemini 4 Hydrogen",
  "gpt-6.1-sol": "GPT-6.1 Sol",
  [codexSolModel]: "GPT-6.2 Sol",
  "gpt-6.2-astra": "GPT-6.2 Astra",
};
export function modelDisplayName(model: string, fallback = model || "Not recorded") {
  return modelNames[model] || fallback;
}
export const defaultProviderModels = {
  codex: agentProviderDefinitions.codex.model,
  claude: agentProviderDefinitions.claude.model,
  deepseek: agentProviderDefinitions.deepseek.model,
  gemini: agentProviderDefinitions.gemini.model,
} as const;
export function providerDisplayName(provider: keyof typeof defaultProviderModels) {
  return modelDisplayName(defaultProviderModels[provider]);
}
