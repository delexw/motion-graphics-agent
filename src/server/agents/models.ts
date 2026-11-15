import { agentProviderDefinitions } from "../../shared/agent-providers";
// Small text tasks use the cheapest model from the user's selected provider.
export const textModels = {
  claude: agentProviderDefinitions.claude.textModel,
  codex: agentProviderDefinitions.codex.textModel,
  deepseek: agentProviderDefinitions.deepseek.textModel,
} as const;
export const claudeMainModel = "claude-opus-5-5";
export const combinationModels = {
  claude: claudeMainModel,
  codex: "gpt-6.1-sol",
  deepseek: agentProviderDefinitions.deepseek.model,
} as const;
