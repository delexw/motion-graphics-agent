import { agentProviderDefinitions } from "../../shared/agent-providers";
// Small text tasks use the cheapest model from the user's selected provider.
export const textModels = {
  claude: agentProviderDefinitions.claude.textModel,
  codex: agentProviderDefinitions.codex.textModel,
  deepseek: agentProviderDefinitions.deepseek.textModel,
  gemini: agentProviderDefinitions.gemini.textModel,
} as const;
export const claudeMainModel = "claude-opus-5-5";
export const combinationModels = {
  claude: claudeMainModel,
  codex: agentProviderDefinitions.codex.model,
  deepseek: agentProviderDefinitions.deepseek.model,
  gemini: agentProviderDefinitions.gemini.model,
} as const;
