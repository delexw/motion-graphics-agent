import {
  expandAssistantStream,
  lastAssistantStreamChunk,
  type AssistantStreamRecord,
} from "@deepseek-ai/dsh-llm/assistant-stream";
import type { HarnessNotification } from "@deepseek-ai/dsh-sdk-client";
import type { ProviderEvent } from "../agent";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function token(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** Only observable assistant text, tool identity and usage enter Kiteva events. */
export function deepseekEvents(notification: HarnessNotification): ProviderEvent[] {
  if (notification.method !== "session.event") return [];
  const event = record(notification.params.event);
  const data = record(event.data);
  const sessionId = notification.params.sessionId;
  if (
    ["assistant/message", "assistant/attempt", "compaction/summary"].includes(String(event.type))
  ) {
    if (typeof sessionId !== "string" || !sessionId || token(event.seq) === null)
      throw Error("DeepSeek usage event has no stable session/sequence identity.");
    let reportedUsage = data.usage;
    if (reportedUsage === undefined && Array.isArray(data.stream)) {
      const stream = data.stream as AssistantStreamRecord[];
      expandAssistantStream(stream);
      reportedUsage = lastAssistantStreamChunk(stream, "usage")?.usage;
    }
    const usage = record(reportedUsage);
    const input = token(usage.inputTokens);
    const reads = token(usage.cacheReadTokens);
    const writes = token(usage.cacheWriteTokens);
    const source = record(record(data.message).source);
    const reportedModel = source.model ?? data.model;
    const observedModel = typeof reportedModel === "string" ? { responseModel: reportedModel } : {};
    const content = record(data.message).content;
    const message = Array.isArray(content)
      ? content
          .flatMap((block) => {
            const item = record(block);
            return item.type === "text" && typeof item.text === "string" ? [item.text] : [];
          })
          .join("")
      : "";
    return [
      ...(message ? [{ type: "agent_message", message, data: { sessionId } }] : []),
      {
        type: "usage",
        message: "DeepSeek model step usage",
        data: {
          sessionId,
          ...observedModel,
          usageScope: "step",
          usageId: `deepseek:${sessionId}:${event.seq}`,
          usageKind: event.type,
          sourceEventSequence: event.seq,
          sourceTurn: token(data.turn),
          sourceStep: token(data.step),
          total_tokens: token(usage.totalTokens),
          reasoning_tokens: token(usage.reasoningTokens),
          ...(event.type === "compaction/summary"
            ? { purpose: "DeepSeek context compaction" }
            : {}),
          input_tokens: input === null ? null : input + (reads || 0) + (writes || 0),
          output_tokens: token(usage.outputTokens),
          cached_input_tokens: reads,
          cache_write_input_tokens: writes,
        },
      },
    ];
  }
  if (event.type === "tool/call")
    return [
      {
        type: "tool",
        message: typeof data.name === "string" ? data.name : "DeepSeek tool",
        data: { sessionId, toolName: data.name, itemId: data.callId, state: "item.started" },
      },
    ];
  if (event.type === "tool/result") {
    const message = record(data.message);
    // Results own the outcome. Match the SDK's provider-issued call ID; never
    // complete the latest unrelated tool when a malformed result has no ID.
    if (typeof message.toolCallId !== "string" || !message.toolCallId) return [];
    const failed = message.isError === true;
    return [
      {
        type: "tool_result",
        message: failed ? "DeepSeek tool failed" : "DeepSeek tool completed",
        data: {
          sessionId,
          results: [{ itemId: message.toolCallId, failed, output: "" }],
        },
      },
    ];
  }
  if (event.type === "turn/end" && record(data.reason).kind === "error")
    return [{ type: "error", message: "DeepSeek model turn failed", data: { sessionId } }];
  return [];
}
