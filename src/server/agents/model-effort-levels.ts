import type { EffortLevel } from "@anthropic-ai/claude-agent-sdk";
import type { ModelReasoningEffort } from "@openai/codex-sdk";
import { agentProviderDefinitions, codexSolModel } from "../../shared/agent-providers";
import type { ModelEffort } from "../../shared/model-effort";

export const deepSeekEffortLevels = ["low", "high", "max"] as const;
export type DeepSeekEffort = (typeof deepSeekEffortLevels)[number];

// The installed SDK types check these values. Per-model support still comes from
// the Codex model catalogue and the Claude and DeepSeek model documentation.
const codexLunaEfforts = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const satisfies readonly ModelReasoningEffort[];
const codexAstraAndSolEfforts = [
  ...codexLunaEfforts,
  "ultra",
] as const satisfies readonly ModelReasoningEffort[];
const claudeEfforts = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const satisfies readonly EffortLevel[];

const modelEffortLevels: Readonly<Partial<Record<string, readonly ModelEffort[]>>> = {
  [agentProviderDefinitions.codex.model]: codexAstraAndSolEfforts,
  [codexSolModel]: codexAstraAndSolEfforts,
  [agentProviderDefinitions.codex.textModel]: codexLunaEfforts,
  [agentProviderDefinitions.claude.model]: claudeEfforts,
  [agentProviderDefinitions.claude.textModel]: claudeEfforts,
  [agentProviderDefinitions.deepseek.model]: deepSeekEffortLevels,
};

export function supportedModelEfforts(model: string): readonly ModelEffort[] {
  return Object.hasOwn(modelEffortLevels, model) ? (modelEffortLevels[model] ?? []) : [];
}
