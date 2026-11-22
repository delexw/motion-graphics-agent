import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtemp, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { expect, it, vi } from "vitest";
import { technologyPool } from "../src/shared/technology-pool";
import { customerToolActivity } from "../src/shared/activity-model";
import { createBevyTools } from "../src/server/agents/capabilities/bevy/tools";
import { agentCapabilities } from "../src/server/agents/capabilities/registry";
import { prepareProjectLayout } from "../src/server/runtime/workspace";
import { isolatedCommand } from "../src/server/runtime/process";

vi.mock("../src/server/runtime/process", () => ({ isolatedCommand: vi.fn() }));

it("offers Bevy as a build capability with an activity label", () => {
  expect(technologyPool).not.toHaveProperty("bevy");
  const build = agentCapabilities("/job");
  expect(build.servers.bevy.enabledTools).toEqual(["render_frames"]);
  expect(build.guidance).toContain("Read authoringResources in style-context.json");
  expect(agentCapabilities("/job", true).servers).not.toHaveProperty("bevy");
  expect(agentCapabilities("/job", false, true).servers).not.toHaveProperty("bevy");
  for (const name of ["mcp__bevy__render_frames", "bevy: render_frames"])
    expect(customerToolActivity(name, "tool", "full video generation")).toBe(
      "Rendering Bevy frames…",
    );
});

it("publishes only checked frames, preserves existing shots and cleans up failed or cancelled exports", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "bevy-test-"));
  const server = createBevyTools(workspace);
  const client = new Client({ name: "bevy-test", version: "1" });
  const [local, remote] = InMemoryTransport.createLinkedPair();
  try {
    await prepareProjectLayout(workspace);
    const executable = "artifacts/scene.exe";
    await writeFile(path.join(workspace, executable), "fixture", { mode: 0o700 });
    const input = { executable, shot: "opening", width: 8, height: 8, fps: 30, frames: 1 };
    await server.connect(remote);
    await client.connect(local);
    const call = (overrides: Partial<typeof input> = {}) =>
      client.callTool({ name: "render_frames", arguments: { ...input, ...overrides } });
    const result = await call({ executable: "../scene.exe" });
    expect(result.isError).toBe(true);
    expect(isolatedCommand).not.toHaveBeenCalled();

    vi.mocked(isolatedCommand).mockImplementationOnce(async (_binary, [, output], cwd) => {
      expect(cwd).toBe(await realpath(workspace));
      await sharp({ create: { width: 8, height: 8, channels: 3, background: "#e13" } })
        .png()
        .toFile(path.join(output, "frame-000000.png"));
      return "";
    });
    const success = await call();
    expect(success.isError, JSON.stringify(success.structuredContent)).not.toBe(true);
    expect(success.structuredContent).toEqual({
      kind: "frames",
      directory: "artifacts/assets/bevy/opening",
      filenamePattern: "frame-%06d.png",
      startNumber: 0,
      width: 8,
      height: 8,
      fps: 30,
      frames: 1,
    });
    expect((await call()).isError).toBe(true);
    expect(isolatedCommand).toHaveBeenCalledTimes(1);

    vi.mocked(isolatedCommand).mockResolvedValueOnce("").mockRejectedValueOnce(Error("Cancelled"));
    expect((await call({ shot: "missing" })).structuredContent).toMatchObject({
      kind: "error",
      message: expect.stringContaining("wrong number of frames"),
    });
    expect((await call({ shot: "cancelled" })).structuredContent).toMatchObject({
      kind: "error",
      message: expect.stringContaining("Cancelled"),
    });
    expect(await readdir(path.join(workspace, "artifacts/assets/bevy"))).toEqual(["opening"]);
  } finally {
    await client.close();
    await server.close();
    await rm(workspace, { recursive: true, force: true });
  }
});
