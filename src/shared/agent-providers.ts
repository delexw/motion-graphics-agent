/** Provider identity and default routing shared by UI, MCP and backend. */
export const agentProviderIds = ["codex", "claude", "deepseek"] as const;
export const agentProviderDefinitions = {
  codex: { name: "GPT", model: "gpt-6.2-astra", textModel: "gpt-6-luna" },
  claude: { name: "Claude", model: "claude-opus-5-5", textModel: "claude-haiku-5-5" },
  deepseek: { name: "DeepSeek", model: "deepseek-flash", textModel: "deepseek-flash" },
} as const;

export const codexSolModel = "gpt-6.2-sol";
type AgentProviderId = (typeof agentProviderIds)[number];

export const agentModelChoices: readonly {
  value: string;
  provider: AgentProviderId;
  mainModel?: string;
}[] = [
  { value: "codex", provider: "codex" },
  { value: codexSolModel, provider: "codex", mainModel: codexSolModel },
  { value: "claude", provider: "claude" },
  { value: "deepseek", provider: "deepseek" },
];

export function agentModelChoiceValue({
  provider,
  mainModel,
}: {
  provider: AgentProviderId;
  mainModel?: string;
}) {
  return (
    agentModelChoices.find(
      (choice) => choice.provider === provider && choice.mainModel === mainModel,
    )?.value ?? provider
  );
}

export function agentProviderName(provider: string) {
  const id = agentProviderIds.find((id) => id === provider);
  return id ? agentProviderDefinitions[id].name : provider;
}
