import { agentProviderDefinitions } from "./agent-providers";
const modelNames: Record<string, string> = {
  "claude-haiku-5-5": "Claude Haiku 5.5",
  "claude-opus-5-5": "Claude Opus 5.5",
  "deepseek-v4-pro": "DeepSeek V4 Pro",
  "deepseek-flash": "DeepSeek Flash",
  "gpt-6.1-sol": "GPT-6.1 Sol",
};
export function modelDisplayName(model: string, fallback = model || "Not recorded") {
  return modelNames[model] || fallback;
}
export const defaultProviderModels = {
  codex: agentProviderDefinitions.codex.model,
  claude: agentProviderDefinitions.claude.model,
  deepseek: agentProviderDefinitions.deepseek.model,
} as const;
export function providerDisplayName(provider: keyof typeof defaultProviderModels) {
  return modelDisplayName(defaultProviderModels[provider]);
}
