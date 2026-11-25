import { blenderToolDenial, invokesBlender } from "../execution-policy";

export const geminiReadOnlyTools = [
  "list_directory",
  "search_directory",
  "find_file",
  "view_file",
  "finish",
] as const;

export const geminiAuthoringTools = [
  ...geminiReadOnlyTools,
  "create_file",
  "edit_file",
  "run_command",
] as const;

export const geminiCliReadOnlyTools = [
  ...geminiReadOnlyTools,
  "read_file",
  "view_file_outline",
  "view_code_item",
  "list_dir",
  "find_by_name",
  "grep_search",
] as const;

export const geminiCliAuthoringTools = [
  ...geminiCliReadOnlyTools,
  "create_file",
  "write_file",
  "write_to_file",
  "edit_file",
  "replace_file_content",
  "multi_replace_file_content",
  "run_command",
] as const;

export type GeminiBuiltinTool = (typeof geminiAuthoringTools)[number];
export type GeminiCliTool = (typeof geminiCliAuthoringTools)[number];

export interface GeminiToolPolicy {
  textOnly: boolean;
  readOnly: boolean;
  allowedMcpTools: string[];
}

export function geminiEnabledTools(policy: Pick<GeminiToolPolicy, "textOnly" | "readOnly">) {
  if (policy.textOnly) return [] as readonly GeminiBuiltinTool[];
  return policy.readOnly ? geminiReadOnlyTools : geminiAuthoringTools;
}

export function geminiCliEnabledTools(policy: Pick<GeminiToolPolicy, "textOnly" | "readOnly">) {
  if (policy.textOnly) return [] as readonly GeminiCliTool[];
  return policy.readOnly ? geminiCliReadOnlyTools : geminiCliAuthoringTools;
}

export function normalizeGeminiToolName(name: string, serverName?: string) {
  if (serverName && !name.startsWith("mcp__")) return `mcp__${serverName}__${name}`;
  return name;
}

export function geminiToolAllowed(name: string, policy: GeminiToolPolicy, serverName?: string) {
  if (policy.textOnly) return false;
  const normalized = normalizeGeminiToolName(name, serverName);
  if (serverName || normalized.startsWith("mcp__")) {
    return policy.allowedMcpTools.includes(normalized);
  }
  return (geminiCliEnabledTools(policy) as readonly string[]).includes(normalized);
}

export function geminiToolDenial(
  name: string,
  args: unknown,
  policy: GeminiToolPolicy,
  serverName?: string,
) {
  const record = args && typeof args === "object" ? (args as Record<string, unknown>) : undefined;
  let effectiveName = name;
  let effectiveServer = serverName;
  if (name === "call_mcp_tool") {
    const mcpServer = record?.ServerName ?? record?.serverName ?? record?.server_name;
    const mcpTool = record?.ToolName ?? record?.toolName ?? record?.tool_name;
    if (typeof mcpServer !== "string" || typeof mcpTool !== "string" || !mcpServer || !mcpTool) {
      return "This MCP tool is unavailable in this Kiteva stage.";
    }
    effectiveServer = mcpServer;
    effectiveName = mcpTool;
  }
  if (!geminiToolAllowed(effectiveName, policy, effectiveServer)) {
    return effectiveServer || effectiveName.startsWith("mcp__")
      ? "This MCP tool is unavailable in this Kiteva stage."
      : "This tool is unavailable in this Kiteva stage.";
  }
  if (effectiveName === "run_command") {
    const command = record?.command ?? record?.CommandLine ?? record?.cmd;
    if (typeof command !== "string") return "The command could not be inspected.";
    if (invokesBlender(command)) return blenderToolDenial;
  }
  return undefined;
}
