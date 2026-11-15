/** Provider identity and default routing shared by UI, MCP and backend. */
export const agentProviderIds = ["codex", "claude", "deepseek"] as const;
export const agentProviderDefinitions = {
  codex: { name: "GPT", model: "gpt-6.1-sol", textModel: "gpt-6-luna" },
  claude: { name: "Claude", model: "claude-opus-5-5", textModel: "claude-haiku-5-5" },
  deepseek: { name: "DeepSeek", model: "deepseek-flash", textModel: "deepseek-flash" },
} as const;

export function agentProviderName(provider: string) {
  const id = agentProviderIds.find((id) => id === provider);
  return id ? agentProviderDefinitions[id].name : provider;
}
