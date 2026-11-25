/** Provider identity and default routing shared by UI, MCP and backend. */
export const agentProviderIds = ["codex", "claude", "deepseek", "gemini"] as const;
export const agentProviderDefinitions = {
  codex: { name: "GPT", model: "gpt-6.2-astra", textModel: "gpt-6-luna" },
  claude: { name: "Claude", model: "claude-opus-5-5", textModel: "claude-haiku-5-5" },
  deepseek: { name: "DeepSeek", model: "deepseek-flash", textModel: "deepseek-flash" },
  gemini: { name: "Gemini", model: "gemini-4-neon", textModel: "gemini-4-hydrogen" },
} as const;

export const codexSolModel = "gpt-6.2-sol";
export const geminiCarbonModel = "gemini-4-carbon";
export type AgentProviderId = (typeof agentProviderIds)[number];

export const agentModelChoices: readonly {
  value: string;
  provider: AgentProviderId;
  mainModel?: string;
}[] = [
  { value: "codex", provider: "codex" },
  { value: codexSolModel, provider: "codex", mainModel: codexSolModel },
  { value: "claude", provider: "claude" },
  { value: "deepseek", provider: "deepseek" },
  { value: "gemini", provider: "gemini" },
  { value: geminiCarbonModel, provider: "gemini", mainModel: geminiCarbonModel },
];

const providerModelPrefixes: ReadonlyArray<readonly [AgentProviderId, string]> = [
  ["codex", "gpt-"],
  ["claude", "claude-"],
  ["deepseek", "deepseek-"],
  ["gemini", "gemini-"],
];

export function agentModelOwner(model: string): AgentProviderId | undefined {
  const normalized = model.trim().toLowerCase();
  if (!normalized) return undefined;
  for (const id of agentProviderIds) {
    const def = agentProviderDefinitions[id];
    if (normalized === def.model.toLowerCase() || normalized === def.textModel.toLowerCase())
      return id;
  }
  const choice = agentModelChoices.find((entry) => entry.mainModel?.toLowerCase() === normalized);
  if (choice) return choice.provider;
  return providerModelPrefixes.find(([, prefix]) => normalized.startsWith(prefix))?.[0];
}

export function agentModelCompatibilityError(
  provider: AgentProviderId,
  mainModel?: string,
): string | undefined {
  if (!mainModel) return undefined;
  const owner = agentModelOwner(mainModel);
  if (owner && owner !== provider)
    return `Model "${mainModel}" belongs to ${agentProviderDefinitions[owner].name} (${owner}), not ${agentProviderDefinitions[provider].name} (${provider}). Choose the matching provider or model; no silent substitution.`;
  return undefined;
}

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
