import { expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { parse } from "yaml";
import { prepareDeepSeekConfiguration } from "../src/server/agents/deepseek/configuration";
import type { AgentExecutionOptions } from "../src/server/agents/agent";

it("writes independent invocation patches and preserves tool and environment boundaries", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "deepseek-configuration-"));
  const options: AgentExecutionOptions = {
    workspace,
    model: "deepseek-flash",
    prompt: "fixture",
    systemPrompt: "fixture system",
    jsonSchema: { type: "object" },
    signal: new AbortController().signal,
    onEvent: () => {},
    readOnly: true,
    capabilityServers: {
      fixture: {
        command: process.execPath,
        args: ["fixture.mjs"],
        env: { FIXTURE_VALUE: "synthetic" },
        enabledTools: ["inspect"],
      },
    },
  };
  try {
    const [first, second] = await Promise.all([
      prepareDeepSeekConfiguration(options),
      prepareDeepSeekConfiguration({ ...options, textOnly: true }),
    ]);
    expect(first.home).toBe(second.home);
    expect(first.patchFile).not.toBe(second.patchFile);
    const patch = parse(await readFile(first.patchFile, "utf8"));
    expect(patch).toContainEqual(
      expect.objectContaining({
        id: "sandbox-policy",
        config: expect.objectContaining({ mode: "read-only", workspaceRoot: workspace }),
      }),
    );
    expect(patch).toContainEqual({ id: "approval", config: { policy: "never" } });
    const entries = patch.find((row: { insert?: unknown }) => row.insert).insert;
    expect(entries.find((row: { id: string }) => row.id === "kiteva-mcp-fixture")).toMatchObject({
      config: {
        serverName: "fixture",
        command: process.execPath,
        env: { FIXTURE_VALUE: "synthetic" },
        failOnStartupError: true,
      },
    });
    expect(entries.find((row: { id: string }) => row.id === "kiteva-policy").config).toMatchObject({
      readOnly: true,
      allowedMcpTools: ["mcp__fixture__inspect"],
    });
    const authoring = await prepareDeepSeekConfiguration({ ...options, readOnly: false });
    const authoringPatch = parse(await readFile(authoring.patchFile, "utf8"));
    const policy = (
      rows: Array<{ id?: string; config?: { additionalWritableRoots?: string[] } }>,
    ) => rows.find((row) => row.id === "sandbox-policy")!.config!;
    expect(policy(authoringPatch).additionalWritableRoots).toContain(workspace);
    expect(policy(patch).additionalWritableRoots).not.toContain(workspace);
    const textPatch = parse(await readFile(second.patchFile, "utf8"));
    expect(policy(textPatch).additionalWritableRoots).not.toContain(workspace);
    const textEntries = textPatch.find((row: { insert?: unknown }) => row.insert).insert;
    expect(textEntries).toHaveLength(2);
    expect(
      textEntries.find((row: { id: string }) => row.id === "kiteva-policy").config,
    ).toMatchObject({ textOnly: true, allowedMcpTools: [] });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
