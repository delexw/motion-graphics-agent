import { expect, it } from "vitest";
import { deepseekEvents } from "../../src/server/agents/deepseek/events";
import { activityItems } from "../../src/shared/activity-model";
import type { AgentProgressEvent } from "../../src/shared/contracts";

function notification(type: string, data: unknown, seq = 1) {
  return deepseekEvents({
    method: "session.event",
    params: { sessionId: "fixture-session", event: { type, seq, time: 0, data } },
  });
}

it.each([false, undefined, true])(
  "preserves the SDK tool outcome isError=%s through Activity",
  (isError) => {
    const events = [
      ...notification("tool/call", {
        callId: "call-1",
        name: "mcp__creative_pool__read_pool_entry",
        arguments: "private arguments",
      }),
      ...notification(
        "tool/result",
        {
          message: {
            toolCallId: "call-1",
            isError,
            content: [{ type: "text", text: "private tool result" }],
          },
          meta: { private: "private metadata" },
        },
        2,
      ),
      ...notification(
        "assistant/message",
        { message: { content: [] }, usage: { inputTokens: 10, outputTokens: 3 } },
        3,
      ),
    ];
    expect(JSON.stringify(events)).not.toMatch(
      /private arguments|private tool result|private metadata/,
    );
    const recorded: AgentProgressEvent[] = events.map((event, index) => ({
      ...event,
      id: index + 1,
      runId: "project",
      jobId: "job",
      time: "2026-01-01T00:00:00Z",
      data: { ...(event.data as object), invocationId: "fixture", purpose: "Full video planning" },
    }));
    expect(activityItems(recorded, false)[0]).toMatchObject({
      itemId: "call-1",
      status: isError ? "failed" : "complete",
    });
  },
);

it("matches parallel results by call ID rather than completing the most recent tool", () => {
  const events = [
    ...notification("tool/call", { callId: "first", name: "read" }),
    ...notification("tool/call", { callId: "second", name: "read" }, 2),
    ...notification("tool/result", { message: { toolCallId: "first", isError: false } }, 3),
  ];
  const recorded: AgentProgressEvent[] = events.map((event, index) => ({
    ...event,
    id: index + 1,
    runId: "project",
    time: "2026-01-01T00:00:00Z",
  }));
  expect(
    activityItems(recorded, false).map((item) => ({ id: item.itemId, status: item.status })),
  ).toEqual([
    { id: "first", status: "complete" },
    { id: "second", status: "running" },
  ]);
  expect(notification("tool/result", { message: { isError: false } })).toEqual([]);
});
