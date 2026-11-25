import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { defaultPython } from "../../src/server/runtime/platform";
import {
  prepareAgyCliConfiguration,
  prepareGeminiConfiguration,
  resolveGeminiBridgeScript,
  resolveGeminiPython,
} from "../../src/server/agents/gemini/configuration";
import type { AgentExecutionOptions } from "../../src/server/agents/agent";

const tempDirs: string[] = [];

async function makeWorkspace() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "kiteva-gemini-config-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

it("builds isolated project-local runtime directories and forwards scoped capability MCP servers", async () => {
  const workspace = await makeWorkspace();
  const pngPath = path.join(workspace, "frame.png");
  await writeFile(pngPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  const options: AgentExecutionOptions = {
    workspace,
    model: "gemini-4-carbon",
    prompt: "Build the composition",
    systemPrompt: "Kiteva system prompt",
    jsonSchema: { type: "object", properties: { done: { type: "boolean" } } },
    readOnly: false,
    textOnly: false,
    sessionId: "saved-gemini-session",
    images: [pngPath],
    capabilityServers: {
      creative_pool: {
        command: "node",
        args: ["pool-mcp.js"],
        env: { KITEVA_POOL: "1" },
        enabledTools: ["search_pool", "read_pool_entry"],
        toolTimeoutSeconds: 45,
      },
    },
    signal: new AbortController().signal,
    onEvent: vi.fn(),
  };

  const prepared = await prepareGeminiConfiguration(options, "high");
  expect(existsSync(prepared.directories.home)).toBe(true);
  expect(existsSync(prepared.directories.appDataDir)).toBe(true);
  expect(existsSync(prepared.directories.saveDir)).toBe(true);
  expect(prepared.directories.appDataDir).not.toContain(path.join(os.homedir(), ".gemini"));
  expect(prepared.env.HOME).toBe(prepared.directories.home);

  expect(prepared.payload).toMatchObject({
    workspace: path.resolve(workspace),
    model: "gemini-4-carbon",
    sessionId: "saved-gemini-session",
    thinkingLevel: "high",
    textOnly: false,
    readOnly: false,
    allowedMcpTools: ["mcp__creative_pool__search_pool", "mcp__creative_pool__read_pool_entry"],
    mcpServers: [
      {
        name: "creative_pool",
        command: "node",
        args: ["pool-mcp.js"],
        env: { KITEVA_POOL: "1" },
        timeoutSeconds: 45,
        enabledTools: ["search_pool", "read_pool_entry"],
      },
    ],
    skillsPaths: [path.join(workspace, ".agents", "skills")],
  });
  expect(prepared.payload.images).toEqual([
    { mimeType: "image/png", dataBase64: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64") },
  ]);

  const textOnlyPrepared = await prepareGeminiConfiguration({ ...options, textOnly: true });
  expect(textOnlyPrepared.payload.enabledTools).toEqual([]);
  expect(textOnlyPrepared.payload.mcpServers).toEqual([]);
  expect(textOnlyPrepared.payload.allowedMcpTools).toEqual([]);
  expect(textOnlyPrepared.payload.skillsPaths).toEqual([]);

  vi.stubEnv("VIDEO_GEMINI_PYTHON", "/custom/venv/bin/python");
  expect(resolveGeminiPython()).toBe("/custom/venv/bin/python");
});

it("wires workspace MCP config, PreToolUse policy hook, and cleanup for agy CLI mode", async () => {
  const workspace = await makeWorkspace();
  const fakeAgy = path.join(workspace, "fake-agy");
  await writeFile(fakeAgy, "#!/bin/sh\nexit 0\n", "utf8");
  await chmod(fakeAgy, 0o755);
  vi.stubEnv("VIDEO_GEMINI_AGY_BIN", fakeAgy);

  const prepared = await prepareAgyCliConfiguration(
    {
      workspace,
      model: "gemini-4-carbon",
      prompt: "Build scene",
      systemPrompt: "Kiteva rules",
      jsonSchema: { type: "object" },
      readOnly: false,
      textOnly: false,
      capabilityServers: {
        creative_pool: {
          command: "node",
          args: ["pool.js"],
          env: { POOL_FLAG: "1" },
          enabledTools: ["search_pool"],
          toolTimeoutSeconds: 30,
        },
      },
      signal: new AbortController().signal,
      onEvent: vi.fn(),
    },
    "high",
  );

  try {
    const mcpConfig = JSON.parse(
      await readFile(path.join(workspace, ".agents", "mcp_config.json"), "utf8"),
    );
    expect(mcpConfig.mcpServers.creative_pool).toEqual({
      command: "node",
      args: ["pool.js"],
      env: { POOL_FLAG: "1" },
      timeoutSeconds: 30,
    });

    const hooksConfig = JSON.parse(
      await readFile(path.join(workspace, ".agents", "hooks.json"), "utf8"),
    );
    expect(hooksConfig.hooks.PreToolUse[0].matcher).toBe("*");

    const settingsConfig = JSON.parse(await readFile(prepared.settingsFile, "utf8"));
    expect(settingsConfig).toMatchObject({
      allowNonWorkspaceAccess: false,
      enableTerminalSandbox: true,
      artifactReviewPolicy: "always-proceed",
      notifications: false,
      disableSlashCommands: false,
      permissions: {
        allow: ["mcp(creative_pool/*)"],
        deny: expect.arrayContaining(["read_url(*)", "execute_url(*)", "command(blender)"]),
      },
    });

    const runHook = (payload: unknown) =>
      JSON.parse(
        execFileSync(process.execPath, [prepared.hookScript], {
          input: JSON.stringify(payload),
          encoding: "utf8",
        }),
      );

    expect(
      runHook({ toolCall: { name: "search_pool", server_name: "creative_pool", args: {} } }),
    ).toEqual({ decision: "auto_approve" });
    expect(
      runHook({
        toolCall: {
          name: "call_mcp_tool",
          args: { ServerName: "creative_pool", ToolName: "search_pool", Arguments: {} },
        },
      }),
    ).toEqual({ decision: "auto_approve" });
    expect(
      runHook({
        toolCall: {
          name: "call_mcp_tool",
          args: { ServerName: "creative_pool", ToolName: "install_anything", Arguments: {} },
        },
      }),
    ).toMatchObject({ decision: "deny" });
    expect(
      runHook({
        toolCall: {
          name: "read_file",
          args: {
            Path: path.join(
              os.homedir(),
              ".gemini/antigravity-cli/mcp/creative_pool/search_pool.json",
            ),
          },
        },
      }),
    ).toEqual({ decision: "allow" });
    expect(
      runHook({
        toolCall: {
          name: "read_file",
          args: {
            Path: path.join(os.homedir(), ".gemini/antigravity-cli/mcp/unlisted_server/tool.json"),
          },
        },
      }),
    ).toMatchObject({ decision: "deny" });
    expect(
      runHook({ toolCall: { name: "install_anything", server_name: "creative_pool", args: {} } }),
    ).toMatchObject({ decision: "deny" });
    expect(
      runHook({ toolCall: { name: "run_command", args: { command: "blender -b scene.blend" } } }),
    ).toMatchObject({ decision: "deny", reason: expect.stringContaining("Blender") });
    expect(
      runHook({
        toolCall: { name: "read_file", args: { Path: path.join(workspace, "BRIEF.md") } },
      }),
    ).toEqual({ decision: "allow" });
    expect(
      runHook({ toolCall: { name: "read_file", args: { Path: "../outside.txt" } } }),
    ).toMatchObject({ decision: "deny" });
    expect(
      runHook({ toolCall: { name: "view_file", args: { path: "../outside.txt" } } }),
    ).toMatchObject({ decision: "deny" });
    expect(
      runHook({ toolCall: { name: "run_command", args: { command: "node --version" } } }),
    ).toEqual({ decision: "allow" });
  } finally {
    await prepared.cleanup();
  }

  expect(existsSync(path.join(workspace, ".agents", "hooks.json"))).toBe(false);
  expect(existsSync(path.join(workspace, ".agents", "mcp_config.json"))).toBe(false);
  expect(existsSync(prepared.hookScript)).toBe(false);
});

it("rejects unsupported image extensions before launching the bridge", async () => {
  const workspace = await makeWorkspace();
  const bmpPath = path.join(workspace, "unsupported.bmp");
  await writeFile(bmpPath, Buffer.from([0x42, 0x4d]));
  await expect(
    prepareGeminiConfiguration({
      workspace,
      model: "gemini-4-neon",
      prompt: "Inspect",
      systemPrompt: "sys",
      jsonSchema: { type: "object" },
      images: [bmpPath],
      signal: new AbortController().signal,
      onEvent: vi.fn(),
    }),
  ).rejects.toThrow("PNG, JPEG, WebP or GIF");
});

it("verifies bridge.py Blender denial and workspace containment helpers without external SDK calls", async () => {
  const workspace = await makeWorkspace();
  const bridgeScript = resolveGeminiBridgeScript();
  const pythonBin = defaultPython();
  const output = execFileSync(
    pythonBin,
    [
      "-c",
      `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("kiteva_gemini_bridge", sys.argv[1])
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
ws = sys.argv[2]
print(json.dumps({
  "blenderDirect": mod._invokes_blender("blender -b scene.blend"),
  "blenderWrapped": mod._invokes_blender("sh -c 'env blender --background'"),
  "blenderBpy": mod._invokes_blender("python3 -c 'import bpy'"),
  "safeNode": mod._invokes_blender("node --version"),
  "inside": mod._path_inside_workspace(ws, "src/index.ts"),
  "outside": mod._path_inside_workspace(ws, "../secret.txt"),
  "mcpName": mod._normalize_tool_name("search_pool", "creative_pool"),
}))
`,
      bridgeScript,
      workspace,
    ],
    { encoding: "utf8" },
  );
  expect(JSON.parse(output)).toEqual({
    blenderDirect: true,
    blenderWrapped: true,
    blenderBpy: true,
    safeNode: false,
    inside: true,
    outside: false,
    mcpName: "mcp__creative_pool__search_pool",
  });
});
