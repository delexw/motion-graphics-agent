import type { ToolActivity } from "../../../shared/tool-activity";
import type { ProviderEvent } from "../agent";
import { commandActivity } from "../command-activity";
import { normalizeGeminiToolName } from "./policy";

const numeric = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const FILE_CHANGE_TOOLS = new Set([
  "create_file",
  "write_file",
  "write_to_file",
  "edit_file",
  "replace_file_content",
  "multi_replace_file_content",
]);

const READ_TOOLS = new Set([
  "read_file",
  "view_file",
  "list_dir",
  "list_directory",
  "find_by_name",
  "find_file",
  "grep_search",
  "search_directory",
  "view_file_outline",
  "view_code_item",
]);

function toolEventType(toolName: string, serverName?: string): ProviderEvent["type"] {
  if (serverName || toolName.startsWith("mcp__") || toolName.startsWith("mcp_")) {
    return "mcp_tool_call";
  }
  if (toolName === "run_command") return "command_execution";
  if (FILE_CHANGE_TOOLS.has(toolName)) {
    return "file_change";
  }
  return "tool";
}

function toolActivityFor(
  toolName: string,
  eventType: ProviderEvent["type"],
  params?: Record<string, unknown>,
): ToolActivity | undefined {
  if (eventType === "command_execution") {
    const cmd = params?.CommandLine ?? params?.command ?? params?.cmd;
    return typeof cmd === "string" && cmd.trim() ? commandActivity(cmd) : undefined;
  }
  if (eventType === "file_change") return "editing";
  if (eventType === "tool" && READ_TOOLS.has(toolName)) return "reading";
  return undefined;
}

/**
 * Normalize Python SDK (`google-antigravity`) UsageMetadata:
 * `cached_content_token_count` is a subset of `prompt_token_count`, and
 * `thoughts_token_count` is separate from `candidates_token_count`.
 */
function buildSdkUsageEvent(
  rawUsage: Record<string, unknown>,
  meta: { usageId?: string; responseModel?: string },
): ProviderEvent {
  const input =
    numeric(rawUsage.prompt_token_count) ??
    numeric(rawUsage.input_tokens) ??
    numeric(rawUsage.inputTokens);
  const rawCached =
    numeric(rawUsage.cached_content_token_count) ??
    numeric(rawUsage.cached_input_tokens) ??
    numeric(rawUsage.cachedInputTokens) ??
    numeric(rawUsage.cache_read_tokens) ??
    numeric(rawUsage.cache_read_input_tokens) ??
    numeric(rawUsage.cached_tokens);
  const cached = rawCached !== null && input !== null ? Math.min(rawCached, input) : rawCached;
  const candidates =
    numeric(rawUsage.candidates_token_count) ??
    numeric(rawUsage.output_tokens) ??
    numeric(rawUsage.outputTokens);
  const thoughts =
    numeric(rawUsage.thoughts_token_count) ??
    numeric(rawUsage.reasoning_output_tokens) ??
    numeric(rawUsage.thinking_tokens) ??
    numeric(rawUsage.thoughtsTokens);
  const output =
    numeric(rawUsage.candidates_token_count) !== null
      ? (candidates ?? 0) + (thoughts ?? 0)
      : candidates;
  const data: Record<string, unknown> = {
    ...(meta.usageId ? { usageId: meta.usageId } : {}),
    ...(meta.responseModel ? { responseModel: meta.responseModel } : {}),
    usageScope: "turn",
    input_tokens: input,
    output_tokens: output,
    cached_input_tokens: cached,
    ...(thoughts !== null ? { reasoning_output_tokens: thoughts } : {}),
    usage: {
      input_tokens: input,
      output_tokens: output,
      cached_input_tokens: cached,
      ...(thoughts !== null ? { reasoning_output_tokens: thoughts } : {}),
    },
  };
  return { type: "usage", message: "Usage recorded", data };
}

/**
 * Normalize `agy --output-format stream-json` usage:
 * Per official Antigravity CLI headless docs, `input_tokens` and `cache_read_tokens`
 * are disjoint (total input = input_tokens + cache_read_tokens), while `output_tokens`
 * already includes `thinking_tokens`. When `prompt_token_count` is supplied instead,
 * fall back to SDK inclusive semantics.
 */
function buildAgyUsageEvent(
  rawUsage: Record<string, unknown>,
  meta: { usageId?: string; responseModel?: string; source: "step" | "result" },
): ProviderEvent {
  if (numeric(rawUsage.prompt_token_count) !== null) {
    const event = buildSdkUsageEvent(rawUsage, meta);
    return {
      ...event,
      data: { ...(event.data as Record<string, unknown>), usageSource: meta.source },
    };
  }
  const uncachedInput = numeric(rawUsage.input_tokens) ?? numeric(rawUsage.inputTokens);
  const cacheRead =
    numeric(rawUsage.cache_read_tokens) ??
    numeric(rawUsage.cache_read_input_tokens) ??
    numeric(rawUsage.cached_input_tokens) ??
    numeric(rawUsage.cachedInputTokens) ??
    numeric(rawUsage.cached_tokens);
  const input =
    uncachedInput !== null
      ? uncachedInput + (cacheRead ?? 0)
      : cacheRead !== null
        ? cacheRead
        : null;
  const output = numeric(rawUsage.output_tokens) ?? numeric(rawUsage.outputTokens);
  const thoughts =
    numeric(rawUsage.thinking_tokens) ??
    numeric(rawUsage.thinking_output_tokens) ??
    numeric(rawUsage.thoughts_token_count) ??
    numeric(rawUsage.reasoning_output_tokens);
  const data: Record<string, unknown> = {
    ...(meta.usageId ? { usageId: meta.usageId } : {}),
    ...(meta.responseModel ? { responseModel: meta.responseModel } : {}),
    usageScope: "turn",
    usageSource: meta.source,
    input_tokens: input,
    output_tokens: output,
    cached_input_tokens: cacheRead,
    ...(thoughts !== null ? { reasoning_output_tokens: thoughts } : {}),
    usage: {
      input_tokens: input,
      output_tokens: output,
      cached_input_tokens: cacheRead,
      ...(thoughts !== null ? { reasoning_output_tokens: thoughts } : {}),
    },
  };
  return { type: "usage", message: "Usage recorded", data };
}

export function geminiEvents(raw: unknown): ProviderEvent[] {
  const event = record(raw);
  const type = typeof event.type === "string" ? event.type : "";
  if (!type) return [];

  if (type === "session") {
    const sessionId = typeof event.conversationId === "string" ? event.conversationId.trim() : "";
    if (!sessionId) return [];
    return [
      {
        type: "session",
        message: "Gemini session opened",
        data: { sessionId },
      },
    ];
  }

  if (type === "text_delta") {
    const text = typeof event.text === "string" ? event.text : "";
    if (!text) return [];
    return [
      {
        type: "text_delta",
        message: text,
        data: { audience: "internal" },
      },
    ];
  }

  if (type === "agent_message") {
    const text = typeof event.text === "string" ? event.text.trim() : "";
    if (!text) return [];
    return [
      {
        type: "agent_message",
        message: text,
        data: { audience: "internal", state: "item.completed" },
      },
    ];
  }

  if (type === "tool") {
    const rawName = nonEmptyString(event.toolName) || "";
    const serverName = nonEmptyString(event.serverName);
    const itemId = nonEmptyString(event.itemId);
    if (!rawName || !itemId) return [];
    const toolName = normalizeGeminiToolName(rawName, serverName);
    const eventType = toolEventType(toolName, serverName);
    const activity = toolActivityFor(toolName, eventType, record(event.parameters));
    return [
      {
        type: eventType,
        message: toolName,
        data: {
          itemId,
          toolName,
          state: "item.started",
          ...(activity ? { activity } : {}),
        },
      },
    ];
  }

  if (type === "tool_result") {
    const itemId = typeof event.itemId === "string" && event.itemId ? event.itemId : undefined;
    if (!itemId) return [];
    const failed = Boolean(event.failed);
    return [
      {
        type: "tool_result",
        message: failed ? "Tool failed" : "Tool finished",
        data: {
          results: [{ itemId, failed, output: "" }],
        },
      },
    ];
  }

  if (type === "usage") {
    const usage = record(event.usage);
    const usageId =
      typeof event.usageId === "string" && event.usageId.trim() ? event.usageId.trim() : undefined;
    const responseModel =
      typeof event.responseModel === "string" && event.responseModel.trim()
        ? event.responseModel.trim()
        : undefined;
    return [buildSdkUsageEvent(usage, { usageId, responseModel })];
  }

  return [];
}

export interface AgyParsedLine {
  events: ProviderEvent[];
  conversationId?: string;
  textDelta?: string;
  result?: {
    ok: boolean;
    conversationId?: string;
    structuredOutput?: unknown;
    text?: string;
    error?: string;
  };
  error?: { message: string };
}

export function parseAgyStreamEvent(raw: unknown, requestedModel: string): AgyParsedLine {
  const obj = record(raw);
  const events: ProviderEvent[] = [];
  const topConvId =
    typeof obj.conversation_id === "string" && obj.conversation_id.trim()
      ? obj.conversation_id.trim()
      : undefined;
  const eventName = typeof obj.event === "string" ? obj.event : "";

  if (eventName === "init") {
    const initObj = record(obj.init);
    const convId =
      (typeof initObj.conversation_id === "string" && initObj.conversation_id.trim()) || topConvId;
    if (convId) {
      events.push({
        type: "session",
        message: "Gemini session opened",
        data: { sessionId: convId },
      });
    }
    return { events, conversationId: convId };
  }

  if (eventName === "step_update") {
    const step = record(obj.step_update);
    const convId =
      (typeof step.conversation_id === "string" && step.conversation_id.trim()) || topConvId;
    const stepIndex =
      typeof step.step_index === "number" && Number.isInteger(step.step_index)
        ? step.step_index
        : undefined;
    const stepState = typeof step.state === "string" ? step.state.toUpperCase() : "";
    const delta = typeof step.text_delta === "string" ? step.text_delta : "";
    if (delta) {
      events.push({
        type: "text_delta",
        message: delta,
        data: { audience: "internal" },
      });
    }
    const toolInfo = record(step.tool_info);
    const toolCall = record(step.tool_call);
    const toolParams = record(toolInfo.parameters ?? toolCall.args ?? step.parameters);
    let rawToolName =
      nonEmptyString(toolCall.name) ||
      nonEmptyString(step.tool_name) ||
      nonEmptyString(toolInfo.name) ||
      "";
    let serverName =
      nonEmptyString(toolCall.server_name) ||
      nonEmptyString(step.server_name) ||
      nonEmptyString(toolInfo.server_name);
    let waitForMcpParams = false;
    if (rawToolName === "call_mcp_tool") {
      const mcpServer = nonEmptyString(
        toolParams.ServerName ?? toolParams.serverName ?? toolParams.server_name,
      );
      const mcpTool = nonEmptyString(
        toolParams.ToolName ?? toolParams.toolName ?? toolParams.tool_name,
      );
      if (mcpServer) serverName = mcpServer;
      if (mcpTool) rawToolName = mcpTool;
      if (!mcpServer && !mcpTool && stepState !== "DONE") {
        waitForMcpParams = true;
      }
    }
    const itemId =
      nonEmptyString(toolCall.id) ||
      nonEmptyString(toolInfo.id) ||
      nonEmptyString(step.call_id) ||
      nonEmptyString(step.step_id) ||
      (stepIndex !== undefined ? `step-${stepIndex}` : undefined);
    const rawError = toolInfo.error ?? toolCall.error;
    const failed = Boolean(
      typeof rawError === "string"
        ? rawError.trim()
        : rawError && typeof rawError === "object" && Object.keys(rawError).length,
    );
    if (rawToolName && itemId && !waitForMcpParams) {
      const toolName = normalizeGeminiToolName(rawToolName, serverName);
      const eventType = toolEventType(toolName, serverName);
      const activity = toolActivityFor(toolName, eventType, toolParams);
      events.push({
        type: eventType,
        message: toolName,
        data: {
          itemId,
          toolName,
          state: stepState === "DONE" ? "item.completed" : "item.started",
          ...(activity ? { activity } : {}),
          ...(stepState === "DONE" ? { failed } : {}),
        },
      });
    }
    const toolResult = record(step.tool_result);
    const resultItemId =
      (typeof toolResult.id === "string" && toolResult.id) ||
      (typeof toolResult.call_id === "string" && toolResult.call_id) ||
      undefined;
    if (resultItemId) {
      const failed = Boolean(toolResult.error || toolResult.failed);
      events.push({
        type: "tool_result",
        message: failed ? "Tool failed" : "Tool finished",
        data: { results: [{ itemId: resultItemId, failed, output: "" }] },
      });
    }
    const stepUsage = record(step.usage ?? step.usage_metadata);
    if (Object.keys(stepUsage).length && (!stepState || stepState === "DONE")) {
      const stepKey =
        stepIndex !== undefined
          ? `step:${stepIndex}`
          : typeof step.step_id === "string"
            ? `step:${step.step_id}`
            : undefined;
      events.push(
        buildAgyUsageEvent(stepUsage, {
          usageId: stepKey ? `gemini:${convId || "cli"}:${stepKey}` : undefined,
          responseModel:
            typeof step.model === "string" && step.model.trim()
              ? step.model.trim()
              : requestedModel,
          source: "step",
        }),
      );
    }
    return { events, conversationId: convId, textDelta: delta || undefined };
  }

  if (eventName === "result") {
    const res = record(obj.result);
    const convId =
      (typeof res.conversation_id === "string" && res.conversation_id.trim()) || topConvId;
    const status = typeof res.status === "string" ? res.status : "SUCCESS";
    const ok = status === "SUCCESS";
    const numTurns =
      typeof res.num_turns === "number" && Number.isInteger(res.num_turns) ? res.num_turns : 1;
    const responseModel =
      typeof res.model === "string" && res.model.trim() ? res.model.trim() : requestedModel;
    const rawUsage = record(res.usage ?? res.usage_metadata ?? obj.usage ?? obj.usage_metadata);
    if (Object.keys(rawUsage).length) {
      events.push(
        buildAgyUsageEvent(rawUsage, {
          usageId: `gemini:${convId || "cli"}:turn:${numTurns}`,
          responseModel,
          source: "result",
        }),
      );
    }
    const errText =
      typeof res.error === "string" && res.error.trim()
        ? res.error.trim()
        : ok
          ? undefined
          : `Antigravity CLI returned status ${status}`;
    return {
      events,
      conversationId: convId,
      result: {
        ok,
        conversationId: convId,
        structuredOutput: res.structured_output,
        text: typeof res.response === "string" ? res.response : undefined,
        error: errText,
      },
    };
  }

  if (eventName === "error") {
    const message =
      (typeof obj.message === "string" && obj.message.trim()) ||
      (typeof obj.error === "string" && obj.error.trim()) ||
      "Antigravity CLI failed.";
    return { events, conversationId: topConvId, error: { message } };
  }

  return { events, conversationId: topConvId };
}
