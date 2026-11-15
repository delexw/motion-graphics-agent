import { invokesBlender, blenderToolDenial } from "../execution-policy";

export interface DeepSeekToolPolicy {
  textOnly: boolean;
  readOnly: boolean;
  allowedMcpTools: string[];
}

export function deepseekToolAllowed(name: string, policy: DeepSeekToolPolicy) {
  if (policy.textOnly) return false;
  if (name.startsWith("mcp__")) return policy.allowedMcpTools.includes(name);
  return [
    "read",
    "read_image",
    "glob",
    "grep",
    "skill",
    ...(!policy.readOnly ? ["write", "edit", "bash", "pwsh"] : []),
  ].includes(name);
}

export function deepseekToolDenial(name: string, args: unknown, policy: DeepSeekToolPolicy) {
  if (!deepseekToolAllowed(name, policy)) return "This tool is unavailable in this Kiteva stage.";
  if (["bash", "pwsh"].includes(name)) {
    const command =
      args && typeof args === "object" && "command" in args ? args.command : undefined;
    if (typeof command !== "string") return "The command could not be inspected.";
    if (invokesBlender(command)) return blenderToolDenial;
  }
  return undefined;
}
