import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  agentModelChoices,
  agentModelCompatibilityError,
  agentProviderIds,
  agentProviderName,
  geminiCarbonModel,
} from "../../src/shared/agent-providers";
import { ProviderSchema } from "../../src/shared/domains/common";
import { defaultProviderModels, modelDisplayName } from "../../src/shared/model-display-name";
import { supportedModelEfforts } from "../../src/server/agents/model-effort-levels";
import { geminiEvents, parseAgyStreamEvent } from "../../src/server/agents/gemini/events";
import { geminiToolAllowed, geminiToolDenial } from "../../src/server/agents/gemini/policy";
import {
  prepareAgyCliConfiguration,
  resolveAgyBinary,
  resolveGeminiTransport,
} from "../../src/server/agents/gemini/configuration";
import { projectGovernance } from "../../src/server/governance/report";
import { activityItems } from "../../src/shared/activity-model";
import { projectActivityEvent } from "../../src/shared/project-activity";
import { RequestSchema, type AgentProgressEvent, type Run } from "../../src/shared/contracts";
import { ModelCapacityError } from "../../src/server/agents/capacity-error";
import { deferred } from "../fixtures/deferred";

const bridgeFixture = vi.hoisted(() => ({
  scriptPath: "",
}));

vi.mock("../../src/server/agents/gemini/configuration", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../src/server/agents/gemini/configuration")>();
  return {
    ...original,
    prepareAgyCliConfiguration: vi.fn(original.prepareAgyCliConfiguration),
    prepareGeminiConfiguration: async (
      options: Parameters<typeof original.prepareGeminiConfiguration>[0],
      effort?: Parameters<typeof original.prepareGeminiConfiguration>[1],
    ) => {
      const prepared = await original.prepareGeminiConfiguration(options, effort);
      return {
        ...prepared,
        pythonBin: process.execPath,
        bridgeScript: bridgeFixture.scriptPath,
      };
    },
  };
});

vi.mock("../../src/server/agents/bundled-skills", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/server/agents/bundled-skills")>()),
  prepareBundledSkills: vi.fn(),
}));

import { agentTurn } from "../../src/server/agents/providers";
import { geminiAgent, geminiNativeEffort } from "../../src/server/agents/gemini-agent";
import type { AgentExecutionOptions } from "../../src/server/agents/agent";

const policy = { textOnly: false, readOnly: false, allowedMcpTools: ["mcp__fixture__inspect"] };
let tempDir = "";

async function writeFakeBridge(code: string) {
  const file = path.join(tempDir, `fake-bridge-${Math.random().toString(36).slice(2)}.mjs`);
  await writeFile(file, code, "utf8");
  bridgeFixture.scriptPath = file;
  return file;
}

async function writeFakeAgy(jsBody: string) {
  const file = path.join(tempDir, `fake-agy-${Math.random().toString(36).slice(2)}`);
  await writeFile(file, `#!/usr/bin/env node\n${jsBody}\n`, "utf8");
  await chmod(file, 0o755);
  return file;
}

const baseOptions = (): AgentExecutionOptions => ({
  workspace: tempDir,
  model: "gemini-4-neon",
  prompt: "Return a result",
  systemPrompt: "fixture system",
  jsonSchema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
  textOnly: true,
  signal: new AbortController().signal,
  onEvent: vi.fn(),
});

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv("GEMINI_API_KEY", "synthetic-default-sdk-key");
  vi.stubEnv("VIDEO_GEMINI_TRANSPORT", "");
  vi.stubEnv("VIDEO_GEMINI_AGY_BIN", "");
  tempDir = await mkdtemp(path.join(os.tmpdir(), "kiteva-gemini-unit-"));
  await writeFakeBridge(`
let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  const payload = JSON.parse(raw);
  const emit = (obj) => process.stdout.write(JSON.stringify(obj) + "\\n");
  emit({ type: "session", conversationId: payload.sessionId || "gemini-session-1" });
  emit({
    type: "usage",
    usageId: "gemini:gemini-session-1:1",
    responseModel: payload.model,
    usage: {
      prompt_token_count: 100,
      cached_content_token_count: 30,
      candidates_token_count: 20,
      thoughts_token_count: 15,
      total_token_count: 135,
    },
  });
  emit({
    type: "result",
    ok: true,
    conversationId: payload.sessionId || "gemini-session-1",
    structuredOutput: { ok: true },
    text: '{"ok":true}',
  });
});
`);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

it("registers Gemini Neon and Carbon with shared metadata, efforts and ownership checks", () => {
  expect(agentProviderIds).toContain("gemini");
  expect(ProviderSchema.parse("gemini")).toBe("gemini");
  expect(agentProviderName("gemini")).toBe("Gemini");
  expect(defaultProviderModels.gemini).toBe("gemini-4-neon");
  expect(geminiCarbonModel).toBe("gemini-4-carbon");
  expect(modelDisplayName("gemini-4-neon")).toBe("Gemini 4 Neon");
  expect(modelDisplayName("gemini-4-carbon")).toBe("Gemini 4 Carbon");
  expect(modelDisplayName("gemini-4-hydrogen")).toBe("Gemini 4 Hydrogen");
  expect(agentModelChoices).toEqual(
    expect.arrayContaining([
      { value: "gemini", provider: "gemini" },
      { value: "gemini-4-carbon", provider: "gemini", mainModel: "gemini-4-carbon" },
    ]),
  );
  expect(supportedModelEfforts("gemini-4-neon")).toEqual(["low", "medium", "high", "xhigh"]);
  expect(supportedModelEfforts("gemini-4-hydrogen")).toEqual(["low", "medium", "high", "xhigh"]);
  expect(supportedModelEfforts("gemini-4-carbon")).toEqual(["low", "medium", "high"]);
  expect(geminiNativeEffort("max", "gemini-4-neon")).toBe("xhigh");
  expect(geminiNativeEffort("ultra", "gemini-4-neon")).toBe("xhigh");
  expect(geminiNativeEffort("xhigh", "gemini-4-carbon")).toBe("high");
  expect(agentModelCompatibilityError("gemini", "gemini-4-carbon")).toBeUndefined();
  expect(agentModelCompatibilityError("gemini", "claude-opus-5-5")).toContain("Claude");
  expect(agentModelCompatibilityError("claude", "gemini-4-neon")).toContain("Gemini");
  expect(agentModelCompatibilityError("claude", "explicit-custom-model")).toBeUndefined();
});

it("auto-selects agy CLI when no Gemini/Vertex credentials are set, and SDK when credentials are set", () => {
  expect(resolveGeminiTransport({})).toBe("cli");
  expect(resolveGeminiTransport({ GEMINI_API_KEY: "k" })).toBe("sdk");
  expect(resolveGeminiTransport({ GOOGLE_API_KEY: "k" })).toBe("sdk");
  expect(resolveGeminiTransport({ GOOGLE_GENAI_USE_VERTEXAI: "true" })).toBe("sdk");
  expect(resolveGeminiTransport({ VIDEO_GEMINI_TRANSPORT: "cli", GEMINI_API_KEY: "k" })).toBe(
    "cli",
  );
  expect(resolveGeminiTransport({ VIDEO_GEMINI_TRANSPORT: "sdk" })).toBe("sdk");
  expect(() => resolveGeminiTransport({ VIDEO_GEMINI_TRANSPORT: "bogus" })).toThrow("Invalid");
  expect(() => resolveAgyBinary({ PATH: "", HOME: path.join(tempDir, "no-agy-home") })).toThrow(
    /not installed/,
  );
});

it.each([
  "view_file",
  "list_directory",
  "create_file",
  "edit_file",
  "run_command",
  "mcp__fixture__inspect",
])("text-only denies %s before dispatch", (name) => {
  expect(geminiToolAllowed(name, { ...policy, textOnly: true })).toBe(false);
});

it.each([
  "create_file",
  "edit_file",
  "run_command",
  "search_web",
  "read_url_content",
  "invoke_subagent",
  "ask_question",
  "generate_image",
  "schedule",
])("read-only denies %s", (name) => {
  expect(geminiToolAllowed(name, { ...policy, readOnly: true })).toBe(false);
});

it("keeps only stage-scoped MCP tools, permitted native tools and Blender denial", () => {
  expect(geminiToolAllowed("mcp__fixture__inspect", policy)).toBe(true);
  expect(geminiToolAllowed("inspect", policy, "fixture")).toBe(true);
  expect(geminiToolAllowed("mcp__fixture__install", policy)).toBe(false);
  expect(geminiToolAllowed("view_file", { ...policy, readOnly: true })).toBe(true);
  expect(geminiToolDenial("run_command", { command: "blender -b" }, policy)).toContain("Blender");
  expect(geminiToolDenial("run_command", { command: 'python3 -c "import bpy"' }, policy)).toContain(
    "Blender",
  );
  expect(geminiToolDenial("run_command", {}, policy)).toContain("inspected");
  expect(geminiToolDenial("run_command", { command: "node --version" }, policy)).toBeUndefined();
});

it("normalizes Gemini SDK and agy stream-json events, keeping malformed usage null", () => {
  const [usage] = geminiEvents({
    type: "usage",
    usageId: "gemini:s1:1",
    responseModel: "gemini-4-carbon",
    usage: {
      prompt_token_count: 100,
      cached_content_token_count: 30,
      candidates_token_count: 20,
      thoughts_token_count: 15,
    },
  });
  expect(usage.data).toMatchObject({
    usageId: "gemini:s1:1",
    responseModel: "gemini-4-carbon",
    input_tokens: 100,
    cached_input_tokens: 30,
    output_tokens: 35,
    reasoning_output_tokens: 15,
  });

  const [malformed] = geminiEvents({
    type: "usage",
    usage: { prompt_token_count: -1, candidates_token_count: "bad" },
  });
  expect(malformed.data).toMatchObject({
    input_tokens: null,
    output_tokens: null,
    cached_input_tokens: null,
  });
  expect(geminiEvents({ type: "thought", text: "private" })).toEqual([]);

  const cliStepTool = parseAgyStreamEvent(
    {
      event: "step_update",
      step_update: {
        conversation_id: "agy-conv-1",
        step_index: 1,
        state: "DONE",
        step_type: "tool",
        tool_name: "read_file",
      },
    },
    "gemini-4-neon",
  );
  expect(cliStepTool.events[0]).toMatchObject({
    type: "tool",
    data: { itemId: "step-1", toolName: "read_file", state: "item.completed" },
  });

  // Per official agy headless docs, input_tokens (278) and cache_read_tokens (30214) are disjoint.
  const cliStepUsage = parseAgyStreamEvent(
    {
      event: "step_update",
      step_update: {
        conversation_id: "agy-conv-1",
        step_index: 4,
        state: "DONE",
        step_type: "agent_response",
        usage: {
          input_tokens: 278,
          cache_read_tokens: 30214,
          output_tokens: 12,
          thinking_tokens: 8,
        },
      },
    },
    "gemini-4-neon",
  );
  expect(cliStepUsage.events[0]).toMatchObject({
    type: "usage",
    data: {
      usageId: "gemini:agy-conv-1:step:4",
      usageSource: "step",
      input_tokens: 30492,
      cached_input_tokens: 30214,
      output_tokens: 12,
      reasoning_output_tokens: 8,
    },
  });

  const cliResult = parseAgyStreamEvent(
    {
      event: "result",
      result: {
        conversation_id: "agy-conv-1",
        status: "SUCCESS",
        num_turns: 2,
        response: '{"ok":true}',
        usage: { input_tokens: 40, cache_read_tokens: 10, output_tokens: 8 },
      },
    },
    "gemini-4-neon",
  );
  expect(cliResult.conversationId).toBe("agy-conv-1");
  expect(cliResult.result).toMatchObject({ ok: true, text: '{"ok":true}' });
  expect(cliResult.events[0]).toMatchObject({
    type: "usage",
    data: {
      usageId: "gemini:agy-conv-1:turn:2",
      usageSource: "result",
      input_tokens: 50,
      cached_input_tokens: 10,
      output_tokens: 8,
    },
  });
});

it("dispatches Neon and Carbon through agentTurn via SDK bridge with Governance attribution", async () => {
  const events: AgentProgressEvent[] = [];
  const result = await agentTurn({
    provider: "gemini",
    model: "gemini-4-carbon",
    workspace: tempDir,
    textOnly: true,
    reasoningEffort: "max",
    prompt: "Return a result",
    schema: z.object({ ok: z.literal(true) }),
    signal: new AbortController().signal,
    onEvent: (event) =>
      events.push({ ...event, id: events.length, runId: "fixture", time: "2026-11-24T00:00:00Z" }),
  });

  expect(result.value).toEqual({ ok: true });
  expect(result.sessionId).toBe("gemini-session-1");
  expect(events.find((e) => e.type === "invocation")?.data).toMatchObject({
    provider: "gemini",
    model: "gemini-4-carbon",
    prompt: expect.objectContaining({ reasoningEffort: "high" }),
  });
  expect(events.find((e) => e.type === "usage")?.data).toMatchObject({
    provider: "gemini",
    model: "gemini-4-carbon",
    responseModel: "gemini-4-carbon",
    invocationId: expect.any(String),
    input_tokens: 100,
    cached_input_tokens: 30,
    output_tokens: 35,
  });

  const run: Run = {
    id: "fixture",
    createdAt: "2026-11-24T00:00:00Z",
    phase: "preparing",
    request: RequestSchema.parse({
      provider: "gemini",
      mainModel: "gemini-4-carbon",
      instructions: "Explain an idea",
    }),
    jobs: [],
    candidates: [],
  };
  const activity = projectGovernance(run, events).activity[0];
  expect(activity).toMatchObject({
    model: "gemini-4-carbon",
    calls: 1,
    inputTokens: 100,
    cachedTokens: 30,
    outputTokens: 35,
    costBasis: "Standard API estimate · Gemini API rates",
  });
  expect(activity.costLow).toBeCloseTo(0.000986, 10);
  expect(activity.costHigh).toBeCloseTo(0.000986, 10);
});

it("uses agy CLI when no Gemini API key is set, strips unrelated secrets, and cleans up workspace configs", async () => {
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("GOOGLE_API_KEY", "");
  vi.stubEnv("GOOGLE_GENAI_USE_VERTEXAI", "");
  vi.stubEnv("GOOGLE_GENAI_USE_ENTERPRISE", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "synthetic-anthropic-secret");
  vi.stubEnv("OPENAI_API_KEY", "synthetic-openai-secret");
  vi.stubEnv("DEEPSEEK_API_KEY", "synthetic-deepseek-secret");
  vi.stubEnv("ANYSEARCH_API_KEY", "synthetic-anysearch-secret");

  const fakeAgy = await writeFakeAgy(`
const args = process.argv.slice(2);
const model = args[args.indexOf("--model") + 1];
const effort = args[args.indexOf("--effort") + 1];
const response = {
  ok: true,
  model,
  effort,
  hasSandbox: args.includes("--sandbox"),
  hasJsonSchema: args.includes("--json-schema"),
  hasSettings: args.includes("--settings"),
  hasAnthropic: Boolean(process.env.ANTHROPIC_API_KEY),
  hasOpenai: Boolean(process.env.OPENAI_API_KEY),
  hasDeepseek: Boolean(process.env.DEEPSEEK_API_KEY),
  hasAnysearch: process.env.ANYSEARCH_API_KEY === "synthetic-anysearch-secret",
};
console.log(JSON.stringify({ event: "init", conversation_id: "agy-session-42" }));
console.log(JSON.stringify({
  event: "step_update",
  step_update: {
    conversation_id: "agy-session-42",
    step_index: 1,
    state: "DONE",
    step_type: "tool",
    tool_name: "read_file",
  },
}));
console.log(JSON.stringify({
  event: "step_update",
  step_update: {
    conversation_id: "agy-session-42",
    step_index: 2,
    state: "DONE",
    step_type: "agent_response",
    usage: { input_tokens: 50, cache_read_tokens: 5, output_tokens: 12, thinking_tokens: 4 },
  },
}));
console.log(JSON.stringify({
  event: "result",
  result: {
    conversation_id: "agy-session-42",
    status: "SUCCESS",
    num_turns: 1,
    response: JSON.stringify(response),
    usage: { input_tokens: 50, cache_read_tokens: 5, output_tokens: 12, thinking_tokens: 4 },
  },
}));
`);
  vi.stubEnv("VIDEO_GEMINI_AGY_BIN", fakeAgy);

  const events: AgentProgressEvent[] = [];
  const result = await agentTurn({
    provider: "gemini",
    model: "gemini-4-neon",
    workspace: tempDir,
    textOnly: true,
    reasoningEffort: "xhigh",
    prompt: "Return structured details",
    schema: z.object({
      ok: z.literal(true),
      model: z.string(),
      effort: z.string(),
      hasSandbox: z.boolean(),
      hasJsonSchema: z.boolean(),
      hasSettings: z.boolean(),
      hasAnthropic: z.boolean(),
      hasOpenai: z.boolean(),
      hasDeepseek: z.boolean(),
      hasAnysearch: z.boolean(),
    }),
    signal: new AbortController().signal,
    onEvent: (event) =>
      events.push({ ...event, id: events.length, runId: "fixture", time: "2026-11-24T00:00:00Z" }),
  });

  expect(result.sessionId).toBe("agy-session-42");
  expect(result.value).toEqual({
    ok: true,
    model: "gemini-4-neon",
    effort: "xhigh",
    hasSandbox: true,
    hasJsonSchema: true,
    hasSettings: true,
    hasAnthropic: false,
    hasOpenai: false,
    hasDeepseek: false,
    hasAnysearch: true,
  });
  expect(events.filter((e) => e.type === "usage")).toHaveLength(1);
  expect(events.find((e) => e.type === "usage")?.data).toMatchObject({
    provider: "gemini",
    model: "gemini-4-neon",
    input_tokens: 55,
    cached_input_tokens: 5,
    output_tokens: 12,
  });

  const run: Run = {
    id: "fixture-agy",
    createdAt: "2026-11-24T00:00:00Z",
    phase: "preparing",
    request: RequestSchema.parse({
      provider: "gemini",
      mainModel: "gemini-4-neon",
      instructions: "Explain an idea",
    }),
    jobs: [],
    candidates: [],
  };
  const activity = projectGovernance(run, events).activity[0];
  expect(activity).toMatchObject({
    model: "gemini-4-neon",
    calls: 1,
    tools: 1,
    inputTokens: 55,
    cachedTokens: 5,
    outputTokens: 12,
    costBasis: "Standard API estimate · Gemini API rates",
  });
  // Neon: ((55 - 5) * 3 + 5 * 0.15 + 12 * 15) / 1e6 = (150 + 0.75 + 180) / 1e6 = 0.00033075
  expect(activity.costLow).toBeCloseTo(0.00033075, 10);
});

it("tracks resumed agy CLI turns sharing a conversation ID without collision or double counting", async () => {
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("GOOGLE_API_KEY", "");
  vi.stubEnv("GOOGLE_GENAI_USE_VERTEXAI", "");
  vi.stubEnv("GOOGLE_GENAI_USE_ENTERPRISE", "");

  const fakeAgy = await writeFakeAgy(`
const args = process.argv.slice(2);
const convIdx = args.indexOf("--conversation");
const isResume = convIdx !== -1;
const convId = "agy-resumed-conv";
if (!isResume) {
  console.log(JSON.stringify({ event: "init", conversation_id: convId }));
  console.log(JSON.stringify({
    event: "step_update",
    step_update: {
      conversation_id: convId,
      step_index: 2,
      state: "DONE",
      step_type: "agent_response",
      usage: { input_tokens: 1000, cache_read_tokens: 0, output_tokens: 100, thinking_tokens: 20 },
    },
  }));
  console.log(JSON.stringify({
    event: "result",
    result: {
      conversation_id: convId,
      status: "SUCCESS",
      num_turns: 1,
      response: JSON.stringify({ ok: true }),
      usage: { input_tokens: 1000, cache_read_tokens: 0, output_tokens: 100, thinking_tokens: 20 },
    },
  }));
} else {
  console.log(JSON.stringify({
    event: "step_update",
    step_update: {
      conversation_id: convId,
      step_index: 4,
      state: "DONE",
      step_type: "agent_response",
      usage: { input_tokens: 200, cache_read_tokens: 1000, output_tokens: 50, thinking_tokens: 10 },
    },
  }));
  console.log(JSON.stringify({
    event: "result",
    result: {
      conversation_id: convId,
      status: "SUCCESS",
      num_turns: 2,
      response: JSON.stringify({ ok: true }),
      usage: { input_tokens: 1200, cache_read_tokens: 1000, output_tokens: 150, thinking_tokens: 30 },
    },
  }));
}
`);
  vi.stubEnv("VIDEO_GEMINI_AGY_BIN", fakeAgy);

  const events: AgentProgressEvent[] = [];
  const pushEvent =
    (purpose: string) => (event: Omit<AgentProgressEvent, "id" | "runId" | "time">) =>
      events.push({
        ...event,
        id: events.length,
        runId: "fixture-resumed",
        time: "2026-11-24T00:00:00Z",
        data: { ...(event.data as object), purpose },
      });

  const turn1 = await agentTurn({
    provider: "gemini",
    model: "gemini-4-neon",
    workspace: tempDir,
    textOnly: true,
    prompt: "First turn",
    schema: z.object({ ok: z.literal(true) }),
    signal: new AbortController().signal,
    onEvent: pushEvent("Preview video planning"),
  });
  expect(turn1.sessionId).toBe("agy-resumed-conv");

  const turn2 = await agentTurn({
    provider: "gemini",
    model: "gemini-4-neon",
    workspace: tempDir,
    textOnly: true,
    sessionId: turn1.sessionId,
    prompt: "Resumed turn",
    schema: z.object({ ok: z.literal(true) }),
    signal: new AbortController().signal,
    onEvent: pushEvent("Full video planning"),
  });
  expect(turn2.sessionId).toBe("agy-resumed-conv");

  const run: Run = {
    id: "fixture-resumed",
    createdAt: "2026-11-24T00:00:00Z",
    phase: "preparing",
    request: RequestSchema.parse({
      provider: "gemini",
      mainModel: "gemini-4-neon",
      instructions: "Explain an idea",
    }),
    jobs: [],
    candidates: [],
  };
  const gov = projectGovernance(run, events);
  expect(gov.activity).toHaveLength(2);
  expect(gov.activity[0]).toMatchObject({
    model: "gemini-4-neon",
    purpose: "Preview video planning",
    calls: 1,
    inputTokens: 1000,
    cachedTokens: 0,
    outputTokens: 100,
    costBasis: "Standard API estimate · Gemini API rates",
  });
  expect(gov.activity[0].costLow).toBeCloseTo(0.0045, 10);

  expect(gov.activity[1]).toMatchObject({
    model: "gemini-4-neon",
    purpose: "Full video planning",
    calls: 1,
    inputTokens: 1200,
    cachedTokens: 1000,
    outputTokens: 50,
    costBasis: "Standard API estimate · Gemini API rates",
  });
  // (200 * 3 + 1000 * 0.15 + 50 * 15) / 1e6 = (600 + 150 + 750) / 1e6 = 0.0015
  expect(gov.activity[1].costLow).toBeCloseTo(0.0015, 10);
});

it("starts the Gemini CLI timeout after the queue and skips a cancelled turn", async () => {
  const firstStarted = deferred();
  const timeout = vi.spyOn(AbortSignal, "timeout");
  const executionTimeoutMs = 65_000;
  const sharedDatabase = path.join(tempDir, "conversation.lock");
  const release = path.join(tempDir, "release-first");
  const fakeAgy = await writeFakeAgy(`
const fs = require("node:fs");
const database = ${JSON.stringify(sharedDatabase)};
const lock = fs.openSync(database, "wx");
fs.closeSync(lock);
console.log(JSON.stringify({ event: "init", conversation_id: "fixture-conversation" }));
const finish = () => {
  fs.unlinkSync(database);
  console.log(JSON.stringify({
    event: "result",
    result: { status: "SUCCESS", response: '{"ok":true}' },
  }));
};
if (require("node:path").basename(process.cwd()) === "first") {
  const timer = setInterval(() => {
    if (!fs.existsSync(${JSON.stringify(release)})) return;
    clearInterval(timer);
    finish();
  }, 10);
} else {
  finish();
}
`);
  vi.stubEnv("VIDEO_GEMINI_TRANSPORT", "cli");
  vi.stubEnv("VIDEO_GEMINI_AGY_BIN", fakeAgy);
  const first = geminiAgent.run({
    ...baseOptions(),
    workspace: path.join(tempDir, "first"),
    onEvent: (event) => {
      if (event.type === "session") firstStarted.resolve();
    },
  });
  const turns = [first];
  try {
    await Promise.race([
      firstStarted.promise,
      first.then(() => {
        throw Error("First CLI turn ended before the overlap could be tested");
      }),
    ]);
    const second = geminiAgent.run({
      ...baseOptions(),
      workspace: path.join(tempDir, "second"),
      executionTimeoutMs,
    });
    turns.push(second);
    const controller = new AbortController();
    const cancelled = geminiAgent.run({
      ...baseOptions(),
      workspace: path.join(tempDir, "cancelled"),
      signal: controller.signal,
      executionTimeoutMs,
    });
    const rejected = expect(cancelled).rejects.toThrow("Cancel queued CLI turn");
    controller.abort(Error("Cancel queued CLI turn"));
    await rejected;
    expect(prepareAgyCliConfiguration).toHaveBeenCalledTimes(1);
    expect(timeout).not.toHaveBeenCalledWith(executionTimeoutMs);
    await writeFile(release, "");
    await expect(Promise.all(turns)).resolves.toEqual([
      { result: { ok: true }, sessionId: "fixture-conversation" },
      { result: { ok: true }, sessionId: "fixture-conversation" },
    ]);
    expect(prepareAgyCliConfiguration).toHaveBeenCalledTimes(2);
    expect(timeout.mock.calls.filter(([ms]) => ms === executionTimeoutMs)).toHaveLength(1);
  } finally {
    await writeFile(release, "");
    await Promise.allSettled(turns);
  }
});

it("fails immediately when no Gemini API key is set and agy CLI is missing", async () => {
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("GOOGLE_API_KEY", "");
  vi.stubEnv("GOOGLE_GENAI_USE_VERTEXAI", "");
  vi.stubEnv("GOOGLE_GENAI_USE_ENTERPRISE", "");
  vi.stubEnv("VIDEO_GEMINI_AGY_BIN", path.join(tempDir, "missing-agy"));

  await expect(geminiAgent.run(baseOptions())).rejects.toThrow(/not found or not executable/);
});

const emptyConversationId =
  "failed to start conversation: backend returned an empty conversation id";

it("recovers an empty new conversation ID with a fresh CLI start in the same turn", async () => {
  const marker = path.join(tempDir, "failed-start");
  const fakeAgy = await writeFakeAgy(`
const fs = require("node:fs");
const marker = ${JSON.stringify(marker)};
if (!fs.existsSync(marker)) {
  fs.writeFileSync(marker, "");
  console.log(JSON.stringify({ event: "error", message: ${JSON.stringify(emptyConversationId)} }));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ event: "init", conversation_id: "recovered-conversation" }));
  console.log(JSON.stringify({
    event: "result",
    result: { status: "SUCCESS", response: '{"ok":true}' },
  }));
}
`);
  vi.stubEnv("VIDEO_GEMINI_TRANSPORT", "cli");
  vi.stubEnv("VIDEO_GEMINI_AGY_BIN", fakeAgy);
  const onEvent = vi.fn();

  await expect(geminiAgent.run({ ...baseOptions(), onEvent })).resolves.toEqual({
    result: { ok: true },
    sessionId: "recovered-conversation",
  });
  expect(prepareAgyCliConfiguration).toHaveBeenCalledTimes(2);
  expect(onEvent.mock.calls.map(([event]) => event.type)).toEqual(["retry", "session"]);
  expect(onEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "retry",
      data: expect.objectContaining({ reason: "gemini_conversation_start", retry: 1 }),
    }),
  );
});

it.each(["resumed", "opened", "cancelled"] as const)(
  "does not start a replacement conversation when the turn is %s",
  async (state) => {
    const fakeAgy = await writeFakeAgy(`
if (${JSON.stringify(state)} === "opened")
  console.log(JSON.stringify({ event: "init", conversation_id: "opened-conversation" }));
console.error(${JSON.stringify(emptyConversationId)});
process.exitCode = 1;
`);
    vi.stubEnv("VIDEO_GEMINI_TRANSPORT", "cli");
    vi.stubEnv("VIDEO_GEMINI_AGY_BIN", fakeAgy);
    const controller = new AbortController();
    const onEvent = vi.fn((event) => {
      if (state === "cancelled" && event.type === "retry") controller.abort();
    });
    await expect(
      geminiAgent.run({
        ...baseOptions(),
        sessionId: state === "resumed" ? "saved-conversation" : undefined,
        signal: controller.signal,
        onEvent,
      }),
    ).rejects.toThrow(state === "cancelled" ? /aborted/i : emptyConversationId);
    expect(prepareAgyCliConfiguration).toHaveBeenCalledOnce();
    expect(onEvent.mock.calls.filter(([event]) => event.type === "retry")).toHaveLength(
      state === "cancelled" ? 1 : 0,
    );
  },
);

it("scopes SDK bridge credentials strictly and never places API keys in stdin payload", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "synthetic-anthropic-secret");
  vi.stubEnv("OPENAI_API_KEY", "synthetic-openai-secret");
  vi.stubEnv("DEEPSEEK_API_KEY", "synthetic-deepseek-secret");
  vi.stubEnv("TYPESAFE_API_KEY", "synthetic-jev-secret");
  vi.stubEnv("GEMINI_API_KEY", "synthetic-gemini-secret");
  vi.stubEnv("ANYSEARCH_API_KEY", "synthetic-anysearch-secret");

  await writeFakeBridge(`
let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  const result = {
    hasGemini: process.env.GEMINI_API_KEY === "synthetic-gemini-secret",
    hasAnysearch: process.env.ANYSEARCH_API_KEY === "synthetic-anysearch-secret",
    hasAnthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    hasOpenai: Boolean(process.env.OPENAI_API_KEY),
    hasDeepseek: Boolean(process.env.DEEPSEEK_API_KEY),
    hasTypesafe: Boolean(process.env.TYPESAFE_API_KEY),
    payloadContainsSecret: raw.includes("synthetic-gemini-secret"),
  };
  process.stdout.write(JSON.stringify({ type: "result", ok: true, structuredOutput: result }) + "\\n");
});
`);

  const out = await geminiAgent.run(baseOptions());
  expect(out.result).toEqual({
    hasGemini: true,
    hasAnysearch: true,
    hasAnthropic: false,
    hasOpenai: false,
    hasDeepseek: false,
    hasTypesafe: false,
    payloadContainsSecret: false,
  });
});

it("redacts secrets in errors, retains usage on malformed output, and maps capacity errors", async () => {
  vi.stubEnv("GEMINI_API_KEY", "secret-gemini-value-12345");
  await writeFakeBridge(`
process.stdin.resume();
process.stdin.on("end", () => {
  process.stdout.write(JSON.stringify({ type: "error", message: "rejected secret-gemini-value-12345" }) + "\\n");
  process.exit(1);
});
`);
  await expect(geminiAgent.run(baseOptions())).rejects.toThrow("rejected [redacted]");

  await writeFakeBridge(`
process.stdin.resume();
process.stdin.on("end", () => {
  process.stdout.write(JSON.stringify({
    type: "usage",
    usageId: "gemini:s1:malformed",
    responseModel: "gemini-4-neon",
    usage: { prompt_token_count: 12, candidates_token_count: 4 },
  }) + "\\n");
  process.stdout.write(JSON.stringify({ type: "result", ok: true, text: "not json" }) + "\\n");
});
`);
  const onEvent = vi.fn();
  await expect(geminiAgent.run({ ...baseOptions(), onEvent })).rejects.toThrow();
  expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "usage" }));

  await writeFakeBridge(`
process.stdin.resume();
process.stdin.on("end", () => {
  process.stdout.write(JSON.stringify({ type: "error", code: "model_capacity", message: "429 quota exceeded" }) + "\\n");
  process.exit(1);
});
`);
  await expect(geminiAgent.run(baseOptions())).rejects.toBeInstanceOf(ModelCapacityError);
});

it("rejects native plan mode and cleans up bridge process on cancellation", async () => {
  await expect(geminiAgent.run({ ...baseOptions(), planMode: true })).rejects.toThrow("plan mode");

  await writeFakeBridge(`
process.stdin.resume();
setTimeout(() => {}, 30000);
`);
  const controller = new AbortController();
  const running = geminiAgent.run({ ...baseOptions(), signal: controller.signal });
  setTimeout(() => controller.abort(Error("user cancelled")), 50);
  await expect(running).rejects.toThrow("user cancelled");
});

it("captures real agy CLI tool_info activity labels, completion states, MCP unwrapping, and failures", () => {
  const convId = "agy-tool-info-conv";
  const toEvent = (id: number, raw: unknown): AgentProgressEvent[] =>
    parseAgyStreamEvent(raw, "gemini-4-neon").events.flatMap((e, idx) => {
      const projected = projectActivityEvent({
        id: id * 10 + idx,
        runId: "fixture-activity",
        time: "2026-11-25T00:00:00Z",
        type: e.type,
        message: e.message,
        data: { ...(e.data as object), purpose: "Full video generation" },
      });
      return projected ? [projected] : [];
    });

  // 1. call_mcp_tool ACTIVE before tool_info.parameters arrives waits instead of emitting generic tool
  const pendingMcp = parseAgyStreamEvent(
    {
      event: "step_update",
      step_update: {
        conversation_id: convId,
        step_index: 1,
        state: "ACTIVE",
        step_type: "tool",
        tool_name: "call_mcp_tool",
      },
    },
    "gemini-4-neon",
  );
  expect(pendingMcp.events).toEqual([]);

  // 2. DONE call_mcp_tool with tool_info.parameters unwraps to MCP server/tool and customer label
  const mcpDone = parseAgyStreamEvent(
    {
      event: "step_update",
      step_update: {
        conversation_id: convId,
        step_index: 1,
        state: "DONE",
        step_type: "tool",
        tool_name: "call_mcp_tool",
        tool_info: {
          name: "call_mcp_tool",
          parameters: { ServerName: "creative_pool", ToolName: "read_pool_entry" },
          output: "SECRET_RAW_OUTPUT_SHOULD_NOT_LEAK",
        },
      },
    },
    "gemini-4-neon",
  );
  expect(mcpDone.events[0]).toMatchObject({
    type: "mcp_tool_call",
    message: "mcp__creative_pool__read_pool_entry",
    data: {
      itemId: "step-1",
      toolName: "mcp__creative_pool__read_pool_entry",
      state: "item.completed",
      failed: false,
    },
  });
  expect(JSON.stringify(mcpDone)).not.toContain("SECRET_RAW_OUTPUT");

  // 3. run_command ACTIVE -> DONE transitions status and maps commandActivity without leaking CommandLine
  const cmdStart = parseAgyStreamEvent(
    {
      event: "step_update",
      step_update: {
        conversation_id: convId,
        step_index: 2,
        state: "ACTIVE",
        step_type: "tool",
        tool_name: "run_command",
        tool_info: {
          name: "run_command",
          parameters: { CommandLine: "npm run check" },
        },
      },
    },
    "gemini-4-neon",
  );
  expect(cmdStart.events[0]).toMatchObject({
    type: "command_execution",
    data: { itemId: "step-2", activity: "checking", state: "item.started" },
  });

  const cmdFail = parseAgyStreamEvent(
    {
      event: "step_update",
      step_update: {
        conversation_id: convId,
        step_index: 2,
        state: "DONE",
        step_type: "tool",
        tool_name: "run_command",
        tool_info: {
          name: "run_command",
          parameters: { CommandLine: "esbuild entry.tsx --bundle" },
          output: "Build failed stderr",
          error: { type: "exit_code", message: "SENSITIVE_ERROR_DETAIL" },
        },
      },
    },
    "gemini-4-neon",
  );
  expect(cmdFail.events[0]).toMatchObject({
    type: "command_execution",
    data: { itemId: "step-2", activity: "bundling", state: "item.completed", failed: true },
  });
  expect(JSON.stringify(cmdFail)).not.toContain("SENSITIVE_ERROR_DETAIL");
  expect(JSON.stringify(cmdFail)).not.toContain("esbuild entry.tsx");

  const streamEvents: AgentProgressEvent[] = [
    ...toEvent(1, {
      event: "step_update",
      step_update: {
        conversation_id: convId,
        step_index: 1,
        state: "ACTIVE",
        step_type: "tool",
        tool_name: "call_mcp_tool",
      },
    }),
    ...toEvent(2, {
      event: "step_update",
      step_update: {
        conversation_id: convId,
        step_index: 1,
        state: "DONE",
        step_type: "tool",
        tool_name: "call_mcp_tool",
        tool_info: {
          name: "call_mcp_tool",
          parameters: { ServerName: "creative_pool", ToolName: "read_pool_entry" },
        },
      },
    }),
    ...toEvent(3, {
      event: "step_update",
      step_update: {
        conversation_id: convId,
        step_index: 2,
        state: "DONE",
        step_type: "tool",
        tool_name: "write_to_file",
        tool_info: { name: "write_to_file", parameters: { TargetFile: "src/scene.tsx" } },
      },
    }),
    ...toEvent(4, {
      event: "step_update",
      step_update: {
        conversation_id: convId,
        step_index: 3,
        state: "DONE",
        step_type: "tool",
        tool_name: "grep_search",
        tool_info: { name: "grep_search", parameters: { Query: "motion" } },
      },
    }),
    ...toEvent(5, {
      event: "step_update",
      step_update: {
        conversation_id: convId,
        step_index: 4,
        state: "ACTIVE",
        step_type: "tool",
        tool_name: "run_command",
        tool_info: { name: "run_command", parameters: { CommandLine: "npm run test" } },
      },
    }),
  ];

  const items = activityItems(streamEvents, false);
  expect(items.map((item) => [item.text, item.status])).toEqual([
    ["Reading creative references…", "complete"],
    ["Updating project files…", "complete"],
    ["Reading project content…", "complete"],
    ["Checking project code…", "running"],
  ]);

  const cmdCompleted = toEvent(6, {
    event: "step_update",
    step_update: {
      conversation_id: convId,
      step_index: 4,
      state: "DONE",
      step_type: "tool",
      tool_name: "run_command",
      tool_info: { name: "run_command", parameters: { CommandLine: "npm run test" } },
    },
  });
  const updatedItems = activityItems([...streamEvents, ...cmdCompleted], false);
  expect(updatedItems.at(-1)).toMatchObject({
    text: "Checking project code…",
    status: "complete",
  });

  // Also confirm projectGovernance deduplicates ACTIVE+DONE step-${stepIndex} tool calls per step
  const run: Run = {
    id: "fixture-activity",
    createdAt: "2026-11-25T00:00:00Z",
    phase: "generating",
    request: RequestSchema.parse({
      provider: "gemini",
      mainModel: "gemini-4-neon",
      instructions: "Explain an idea",
    }),
    jobs: [],
    candidates: [],
  };
  const gov = projectGovernance(run, [...streamEvents, ...cmdCompleted]);
  expect(gov.activity[0].tools).toBe(4);
});
