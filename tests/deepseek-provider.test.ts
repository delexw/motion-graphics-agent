import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { agentProviderIds, agentProviderName } from "../src/shared/agent-providers";
import { ProviderSchema } from "../src/shared/domains/common";
import { attachDeepSeekCost } from "../src/server/agents/deepseek/cost-meter";
import { deepseekEvents } from "../src/server/agents/deepseek/events";
import { deepseekToolAllowed, deepseekToolDenial } from "../src/server/agents/deepseek/policy";
import { projectGovernance } from "../src/server/governance/report";
import { RequestSchema, type AgentProgressEvent, type Run } from "../src/shared/contracts";

const sdk = vi.hoisted(() => ({
  construct: vi.fn(),
  start: vi.fn(),
  close: vi.fn(),
  run: vi.fn(),
  resume: vi.fn(),
  setWorkingDirectory: vi.fn(),
}));
vi.mock("@deepseek-ai/dsh-sdk-client", () => ({
  DeepSeekHarness: class {
    constructor(options: unknown) {
      sdk.construct(options);
    }
    start = sdk.start;
    close = sdk.close;
    resumeSession = sdk.resume;
    session() {
      return { id: "fixture-session", run: sdk.run };
    }
  },
}));
vi.mock("../src/server/agents/deepseek/configuration", () => ({
  prepareDeepSeekConfiguration: async () => ({
    home: "/isolated/deepseek",
    patchFile: "/isolated/deepseek/turn.yml",
  }),
}));
vi.mock("../src/server/agents/bundled-skills", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/server/agents/bundled-skills")>()),
  prepareBundledSkills: vi.fn(),
}));
vi.mock("../src/server/agents/caveman", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/server/agents/caveman")>()),
  cavemanSettings: () => ({ enabled: false }),
}));
import { agentTurn } from "../src/server/agents/providers";
import { deepseekAgent } from "../src/server/agents/deepseek-agent";
import type { AgentExecutionOptions } from "../src/server/agents/agent";

const policy = { textOnly: false, readOnly: false, allowedMcpTools: ["mcp__fixture__inspect"] };
const notification = (data: unknown) => ({
  method: "session.event",
  params: {
    sessionId: "fixture-session",
    event: { type: "assistant/message", seq: 4, time: 0, data },
  },
});
const options = (): AgentExecutionOptions => ({
  workspace: "/tmp/fixture",
  model: "deepseek-flash",
  prompt: "Return a result",
  systemPrompt: "fixture system",
  jsonSchema: { type: "object" },
  textOnly: true,
  signal: new AbortController().signal,
  onEvent: vi.fn(),
});
beforeEach(() => {
  vi.clearAllMocks();
  sdk.start.mockResolvedValue(undefined);
  sdk.close.mockResolvedValue(undefined);
  sdk.setWorkingDirectory.mockResolvedValue("/tmp/fixture");
  sdk.run.mockResolvedValue({
    finalResponse: '{"ok":true}',
    finishReason: "completed",
    sessionId: "fixture-session",
  });
});
afterEach(() => vi.unstubAllEnvs());

it("registers DeepSeek with the shared request contract and provider metadata", () => {
  expect(agentProviderIds).toContain("deepseek");
  expect(ProviderSchema.parse("deepseek")).toBe("deepseek");
  expect(agentProviderName("deepseek")).toBe("DeepSeek");
  expect(agentProviderName("historical-provider")).toBe("historical-provider");
});
it.each(["read", "write", "bash", "mcp__fixture__inspect", "plugin_manager"])(
  "text-only denies %s before dispatch",
  (name) => expect(deepseekToolAllowed(name, { ...policy, textOnly: true })).toBe(false),
);
it.each(["write", "edit", "bash", "web_fetch", "plugin_manager", "subagent"])(
  "read-only denies %s",
  (name) => expect(deepseekToolAllowed(name, { ...policy, readOnly: true })).toBe(false),
);
it("keeps only stage-scoped MCP names and permitted native tools", () => {
  expect(deepseekToolAllowed("mcp__fixture__inspect", policy)).toBe(true);
  expect(deepseekToolAllowed("mcp__fixture__install", policy)).toBe(false);
  expect(deepseekToolAllowed("read", { ...policy, readOnly: true })).toBe(true);
  expect(deepseekToolDenial("bash", { command: "blender -b" }, policy)).toContain("Blender");
  expect(deepseekToolDenial("bash", {}, policy)).toContain("inspected");
  expect(deepseekToolDenial("bash", { command: "node --version" }, policy)).toBeUndefined();
});
it("reports disjoint cache accounting and excludes reasoning content", () => {
  const events = deepseekEvents(
    notification({
      message: {
        source: { model: "actual-model" },
        content: [
          { type: "reasoning", text: "private reasoning" },
          { type: "text", text: "observable result" },
        ],
      },
      usage: { inputTokens: 10, outputTokens: 4, cacheReadTokens: 6, cacheWriteTokens: 2 },
    }),
  );
  expect(events[0].message).toBe("observable result");
  expect(events[1].data).toMatchObject({
    input_tokens: 18,
    output_tokens: 4,
    cached_input_tokens: 6,
    cache_write_input_tokens: 2,
    responseModel: "actual-model",
  });
  expect(JSON.stringify(events)).not.toContain("private reasoning");
});
it("keeps missing or malformed usage unknown", () => {
  expect(
    deepseekEvents(
      notification({ message: { content: [] }, usage: { inputTokens: -5, outputTokens: "4" } }),
    )[0].data,
  ).toMatchObject({ input_tokens: null, output_tokens: null, cached_input_tokens: null });
  expect(deepseekEvents({ method: "unrelated", params: {} })).toEqual([]);
});
it("dispatches through the registered adapter with shared invocation attribution", async () => {
  const events: AgentProgressEvent[] = [];
  sdk.run.mockImplementation(async (_input, options) => {
    options.onNotification(
      notification({
        message: { content: [] },
        usage: { inputTokens: 10, outputTokens: 4, cacheReadTokens: 2 },
      }),
    );
    return {
      finalResponse: '{"ok":true}',
      finishReason: "completed",
      sessionId: "fixture-session",
    };
  });
  const result = await agentTurn({
    provider: "deepseek",
    workspace: "/tmp/fixture",
    textOnly: true,
    prompt: "Return a result",
    schema: z.object({ ok: z.literal(true) }),
    signal: new AbortController().signal,
    onEvent: (event) =>
      events.push({ ...event, id: events.length, runId: "fixture", time: "2026-11-15T00:00:00Z" }),
  });
  expect(result.value).toEqual({ ok: true });
  expect(events.find((e) => e.type === "usage")?.data).toMatchObject({
    provider: "deepseek",
    model: "deepseek-flash",
    invocationId: expect.any(String),
    input_tokens: 12,
  });
  const run: Run = {
    id: "fixture",
    createdAt: "2026-11-15T00:00:00Z",
    phase: "preparing",
    request: RequestSchema.parse({ provider: "deepseek", instructions: "Explain an idea" }),
    jobs: [],
    candidates: [],
  };
  expect(projectGovernance(run, events).activity[0]).toMatchObject({
    calls: 1,
    inputTokens: 12,
    outputTokens: 4,
    costLow: null,
    costHigh: null,
  });
  expect(sdk.close).toHaveBeenCalledTimes(1);
});
it("does not inherit unrelated provider credentials", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "synthetic-unrelated");
  vi.stubEnv("OPENAI_API_KEY", "synthetic-other");
  vi.stubEnv("DEEPSEEK_API_KEY", "synthetic-deepseek");
  await deepseekAgent.run(options());
  const config = sdk.construct.mock.calls[0][0];
  expect(config.env.DEEPSEEK_API_KEY).toBe("synthetic-deepseek");
  expect(config.env.ANTHROPIC_API_KEY).toBeUndefined();
  expect(config.env.OPENAI_API_KEY).toBeUndefined();
  expect(config.env.DSH_TELEMETRY_DISABLED).toBe("1");
  await expect(config.onUserQuestion()).resolves.toEqual({ cancelled: true });
});
it("restores the saved session without silently replacing it", async () => {
  sdk.resume.mockResolvedValue({
    id: "saved-session",
    run: sdk.run,
    setWorkingDirectory: sdk.setWorkingDirectory,
  });
  await deepseekAgent.run({ ...options(), sessionId: "saved-session" });
  expect(sdk.resume).toHaveBeenCalledWith("saved-session");
  expect(sdk.setWorkingDirectory).toHaveBeenCalledWith("/tmp/fixture");
  sdk.resume.mockRejectedValueOnce(Error("Session unavailable"));
  await expect(deepseekAgent.run({ ...options(), sessionId: "missing" })).rejects.toThrow(
    "Session unavailable",
  );
  expect(sdk.run).toHaveBeenCalledTimes(1);
});
it.each(["error", "aborted", null])("rejects incomplete model outcome %s", async (finishReason) => {
  sdk.run.mockResolvedValue({
    finalResponse: '{"ok":true}',
    finishReason,
    sessionId: "fixture-session",
  });
  await expect(deepseekAgent.run(options())).rejects.toThrow("did not complete");
  expect(sdk.close).toHaveBeenCalledTimes(1);
});
it("retains usage before rejecting malformed output", async () => {
  const onEvent = vi.fn();
  sdk.run.mockImplementation(async (_input, options) => {
    options.onNotification(notification({ usage: { inputTokens: 7, outputTokens: 3 } }));
    return {
      finishReason: "completed",
      finalResponse: "invalid JSON",
      sessionId: "fixture-session",
    };
  });
  await expect(deepseekAgent.run({ ...options(), onEvent })).rejects.toThrow();
  expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "usage" }));
  expect(sdk.close).toHaveBeenCalledTimes(1);
});
it("redacts provider failure messages and closes on startup failure", async () => {
  vi.stubEnv("DEEPSEEK_API_KEY", "synthetic-secret-token");
  sdk.start.mockRejectedValueOnce(Error("rejected synthetic-secret-token"));
  await expect(deepseekAgent.run(options())).rejects.toThrow("rejected [redacted]");
  expect(sdk.close).toHaveBeenCalledTimes(1);
});
it("cancels by closing and awaiting the runtime without retrying", async () => {
  const controller = new AbortController();
  sdk.run.mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        sdk.close.mockImplementation(async () => {
          reject(Error("closed"));
        });
        controller.abort();
      }),
  );
  await expect(
    deepseekAgent.run({ ...options(), signal: controller.signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(sdk.run).toHaveBeenCalledTimes(1);
  expect(sdk.close).toHaveBeenCalledTimes(1);
});

it("counts distinct steps and failed attempts once even across notification replay", () => {
  const asEvent = (id: number, sequence: number, extra: Record<string, unknown> = {}) => {
    const n = notification({
      turn: 1,
      step: sequence,
      message: { content: [] },
      usage: { inputTokens: 10, outputTokens: 4, cacheReadTokens: 2, cacheWriteTokens: 0 },
      ...extra,
    });
    n.params.event.seq = sequence;
    const usage = deepseekEvents(n).find((e) => e.type === "usage")!;
    return {
      ...usage,
      id,
      runId: "fixture",
      time: "2026-11-15T00:00:00Z",
      data: {
        ...(usage.data as object),
        provider: "deepseek",
        model: "deepseek-flash",
        invocationId: "same-invocation",
      },
    };
  };
  const run: Run = {
    id: "fixture",
    createdAt: "2026-11-15T00:00:00Z",
    phase: "preparing",
    request: RequestSchema.parse({ provider: "deepseek", instructions: "Explain an idea" }),
    jobs: [],
    candidates: [],
  };
  const first = asEvent(1, 10);
  const second = asEvent(2, 20);
  const costs = new Map(
    [first, second].map((event, index) => [
      z.object({ usageId: z.string() }).parse(event.data).usageId,
      {
        usageId: z.object({ usageId: z.string() }).parse(event.data).usageId,
        model: "deepseek-flash",
        priced: true,
        costUsd: (index + 1) * 0.00001,
        rows: [],
      },
    ]),
  );
  const priced = [first, second].map((event) => ({
    ...event,
    data: attachDeepSeekCost(event, costs).data,
  }));
  const replay = {
    ...priced[0],
    id: 3,
    data: { ...(priced[0].data as object), invocationId: "replayed-invocation" },
  };
  const activity = projectGovernance(run, [...priced, replay]).activity[0];
  expect(activity).toMatchObject({
    inputTokens: 24,
    outputTokens: 8,
    cachedTokens: 4,
    costBasis: "Plugin API estimate · dsh-cost-meter (USD)",
  });
  expect(activity.costLow).toBeCloseTo(0.00003, 12);
  expect(activity.costHigh).toBeCloseTo(0.00003, 12);
});
it("uses final top-level usage instead of adding streaming snapshots or reasoning", () => {
  const n = notification({
    message: { content: [] },
    usage: {
      inputTokens: 20,
      outputTokens: 10,
      cacheReadTokens: 5,
      cacheWriteTokens: 0,
      reasoningTokens: 7,
      totalTokens: 35,
    },
    stream: [
      {
        type: "chunk",
        time: 1,
        chunk: { type: "usage", usage: { inputTokens: 10, outputTokens: 2 } },
      },
    ],
  });
  const event = deepseekEvents(n)[0];
  expect(event.data).toMatchObject({
    input_tokens: 25,
    output_tokens: 10,
    total_tokens: 35,
    reasoning_tokens: 7,
  });
});
it("recovers the last usage sample from failed-attempt streams with the official helper", () => {
  const n = notification({
    turn: 1,
    step: 1,
    stream: [
      {
        type: "chunk",
        time: 1,
        chunk: { type: "usage", usage: { inputTokens: 10, outputTokens: 2 } },
      },
      {
        type: "chunk",
        time: 2,
        chunk: { type: "usage", usage: { inputTokens: 12, outputTokens: 4 } },
      },
    ],
  });
  n.params.event.type = "assistant/attempt";
  expect(deepseekEvents(n)[0].data).toMatchObject({
    input_tokens: 12,
    output_tokens: 4,
    usageId: "deepseek:fixture-session:4",
  });
});
it("records compaction usage independently and ignores token/context projections", () => {
  const n = notification({ model: "deepseek-flash", usage: { inputTokens: 11, outputTokens: 3 } });
  n.params.event.type = "compaction/summary";
  expect(deepseekEvents(n)[0].data).toMatchObject({
    input_tokens: 11,
    purpose: "DeepSeek context compaction",
  });
  n.params.event.type = "session.projection";
  expect(deepseekEvents(n)).toEqual([]);
});

it("does not run in the source workspace when the resumed directory handoff fails", async () => {
  sdk.resume.mockResolvedValue({
    id: "saved-session",
    run: sdk.run,
    setWorkingDirectory: sdk.setWorkingDirectory,
  });
  sdk.setWorkingDirectory.mockRejectedValueOnce(Error("Revision directory unavailable"));
  await expect(deepseekAgent.run({ ...options(), sessionId: "saved-session" })).rejects.toThrow(
    "Revision directory unavailable",
  );
  expect(sdk.run).not.toHaveBeenCalled();
  expect(sdk.close).toHaveBeenCalledOnce();
});
