import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, expect, it, vi } from "vitest";
import { agentCapabilities } from "../../src/server/agents/capabilities/registry";
import { registerLpcTools } from "../../src/server/agents/capabilities/lpc/tools";
import { registerPixelFxTools } from "../../src/server/agents/capabilities/pixel-fx/tools";
import { projectFiles } from "../../src/server/project-export/bundle";
import { publishPixelAsset } from "../../src/server/agents/capabilities/pixel-assets/output";
import { prepareProjectLayout } from "../../src/server/runtime/workspace";
import { customerToolActivity } from "../../src/shared/activity-model";

afterEach(() => vi.unstubAllEnvs());

async function withFixture(
  run: (fixture: { workspace: string; upstream: string }) => Promise<void>,
) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "pixel-asset-test-"));
  const workspace = path.join(temporary, "project");
  const upstream = path.join(temporary, "upstream");
  try {
    await prepareProjectLayout(workspace);
    await run({ workspace, upstream });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function write(root: string, file: string, contents: string | Buffer) {
  const target = path.join(root, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
}

async function withClient(
  register: (server: McpServer) => void,
  run: (client: Client) => Promise<void>,
) {
  const server = new McpServer({ name: "pixel-test", version: "1.0.0" });
  register(server);
  const client = new Client({ name: "test", version: "1.0.0" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverSide);
    await client.connect(clientSide);
    await run(client);
  } finally {
    await client.close();
    await server.close();
  }
}

it("requires verified licence and credit metadata for every LPC layer and preserves existing assets", async () => {
  await withFixture(async ({ workspace, upstream }) => {
    const png = await sharp({
      create: { width: 576, height: 256, channels: 4, background: "#00ff00" },
    })
      .png()
      .toBuffer();
    const examples = [
      { id: "mask", licence: "CC-BY 4.0" },
      { id: "shadow", licence: "CC0" },
      { id: "body", licence: "CC-BY-SA 3.0" },
      { id: "banner", licence: "CC-BY" },
    ];
    for (const { id, licence } of examples) {
      const credit = (file: string, licenses: string[]) => ({
        file,
        licenses,
        urls: ["https://example.com/art"],
        authors: ["Fixture Artist"],
      });
      await write(
        upstream,
        `sheet_definitions/${id}.json`,
        JSON.stringify({
          name: id,
          animations: ["walk"],
          layer_1: { zPos: id === "shadow" ? 1 : 20, female: `${id}/` },
          credits: [
            credit(id, [licence]),
            ...(id === "mask" ? [credit(`${id}/walk/restricted.png`, ["GPL 3.0"])] : []),
          ],
        }),
      );
      await write(upstream, `spritesheets/${id}/walk.png`, png);
    }
    await write(upstream, "spritesheets/mask/walk/restricted.png", png);
    await withClient(
      (server) => registerLpcTools(server, workspace, upstream),
      async (client) => {
        const selectors = { body: "female", animation: "walk" };
        const discovered = await client.callTool({ name: "list_parts", arguments: selectors });
        expect(discovered.structuredContent).toEqual({
          kind: "parts",
          items: [
            { id: "mask:base", name: "mask" },
            { id: "shadow:base", name: "shadow" },
          ],
          nextOffset: null,
          total: 2,
        });
        const build = (parts: string[], name = "character") =>
          client.callTool({
            name: "build_character",
            arguments: { ...selectors, parts, name },
          });
        const rejected = await build(["mask:restricted"], "rejected");
        expect(rejected.isError).toBe(true);
        const builds = await Promise.all([
          build(["mask:base", "shadow:base"]),
          build(["mask:base", "shadow:base"]),
        ]);
        expect(builds.filter((result) => result.isError)).toHaveLength(1);
        const success = builds.find((result) => !result.isError);
        expect(success?.structuredContent).toMatchObject({ kind: "character", frameSize: 64 });
        const directory = path.join(workspace, "artifacts/assets/lpc/character");
        const credits = await readFile(path.join(directory, "CREDITS.md"), "utf8");
        expect(credits).toContain("[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)");
        expect(credits).toContain("[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)");
        expect(credits).toContain("Fixture Artist");
        expect(credits).toContain("Changes:");
        expect((await projectFiles(workspace)).map(({ name }) => name)).toContain(
          "artifacts/assets/lpc/character/CREDITS.md",
        );
        expect(
          JSON.parse(await readFile(path.join(directory, "character.json"), "utf8")).credits,
        ).toMatchObject([{ sprite: "shadow/walk.png" }, { sprite: "mask/walk.png" }]);
      },
    );
  });
});

it("checks the PixelFX CLI contract and publishes the transparency, timing and licences together", async () => {
  await withFixture(async ({ workspace, upstream }) => {
    const png = await sharp({
      create: { width: 2, height: 2, channels: 4, background: "#00ff007f" },
    })
      .png()
      .toBuffer();
    await write(upstream, "src/fx/weather/fog.js", "");
    await write(upstream, "LICENSE", "fixture licence");
    await write(upstream, "NOTICE.md", "fixture notices");
    await write(
      upstream,
      "tools/render.mjs",
      `
      import { mkdirSync, writeFileSync } from "node:fs";
      import { join } from "node:path";
      const [, , effect, ...args] = process.argv;
      const flag = (key) => args[args.indexOf(key) + 1];
      if (!args.includes("--sheet") || !args.includes("--no-actor") || flag("--bg") !== "none" || Number(flag("--max")) < 2) process.exit(1);
      const directory = join(flag("--out"), effect);
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, "fog.png"), Buffer.from(${JSON.stringify(png.toString("base64"))}, "base64"));
      writeFileSync(join(directory, "fog.json"), JSON.stringify({
        frames: [{ frame: { x: 0, y: 0, w: 2, h: 2 }, duration: 83 }],
        meta: { image: "fog.png", size: { w: 2, h: 2 },
          pixelfx: { id: effect, fps: Number(flag("--fps")), loop: true, frames: 1, frameSize: [2, 2], pivot: [1, 1] } },
      }));
    `,
    );
    await withClient(
      (server) => registerPixelFxTools(server, workspace, upstream),
      async (client) => {
        const listed = await client.callTool({
          name: "list_effects",
          arguments: { category: "weather" },
        });
        expect(listed.structuredContent).toEqual({ kind: "effects", effects: ["weather/fog"] });
        const render = (effect: string) =>
          client.callTool({ name: "render_effect", arguments: { effect, name: "fog" } });
        expect((await render("weather/missing")).isError).toBe(true);
        const result = await render("weather/fog");
        expect(result.structuredContent).toMatchObject({
          kind: "effect",
          fps: 12,
          frames: 1,
          loop: true,
        });
        expect(
          await readFile(path.join(workspace, "artifacts/assets/pixelfx/fog/NOTICE.md"), "utf8"),
        ).toBe("fixture notices");
      },
    );
  });
});

it("registers only provisioned pixel tools for builds and gives every tool a distinct activity label", async () => {
  await withFixture(async ({ workspace, upstream }) => {
    vi.stubEnv("KITEVA_LPC_ROOT", upstream);
    vi.stubEnv("KITEVA_PIXELFX_ROOT", upstream);
    expect(agentCapabilities(workspace).servers).not.toHaveProperty("lpc");
    expect(agentCapabilities(workspace).servers).not.toHaveProperty("pixel_fx");
    for (const directory of ["sheet_definitions", "spritesheets", "src/fx/weather"])
      await mkdir(path.join(upstream, directory), { recursive: true });
    for (const file of ["tools/render.mjs", "LICENSE", "NOTICE.md"])
      await write(upstream, file, "");
    const { servers } = agentCapabilities(workspace);
    expect(servers.lpc.enabledTools).toEqual(["list_parts", "build_character"]);
    expect(servers.pixel_fx.enabledTools).toEqual(["list_effects", "render_effect"]);
    expect(agentCapabilities(workspace, true).servers).not.toHaveProperty("lpc");
    expect(agentCapabilities(workspace, false, true).servers).not.toHaveProperty("pixel_fx");
    expect([
      customerToolActivity("mcp__lpc__list_parts", "tool"),
      customerToolActivity("mcp__lpc__build_character", "tool"),
      customerToolActivity("mcp__pixel_fx__list_effects", "tool"),
      customerToolActivity("mcp__pixel_fx__render_effect", "tool"),
    ]).toEqual([
      "Finding licensed pixel character parts…",
      "Building a pixel character…",
      "Finding pixel environment effects…",
      "Rendering a pixel environment effect…",
    ]);
  });
});

it("supports existing workspaces without an assets folder and rejects output links", async () => {
  await withFixture(async ({ workspace, upstream }) => {
    const legacy = path.join(workspace, "legacy");
    await mkdir(legacy);
    const signal = new AbortController().signal;
    await expect(
      publishPixelAsset(legacy, "lpc", "first", signal, async (_, relative) => relative),
    ).resolves.toBe("assets/lpc/first");
    await mkdir(upstream);
    const linked = path.join(workspace, "linked");
    await mkdir(linked);
    await symlink(upstream, path.join(linked, "assets"), "junction");
    const build = vi.fn();
    await expect(publishPixelAsset(linked, "lpc", "escaped", signal, build)).rejects.toThrow(
      "project-owned assets directory",
    );
    expect(build).not.toHaveBeenCalled();
  });
});

it("publishes eligible OGA-BY bodies and accessories under CC BY 3.0 with credits", async () => {
  await withFixture(async ({ workspace, upstream }) => {
    const bodies = ["male", "female", "teen", "child", "muscular", "pregnant"];
    const credit = (file: string, licenses: string[]) => ({
      file,
      licenses,
      authors: ["Fixture Artist"],
      urls: ["https://example.com/stock-art"],
    });
    const stockPath = (body: string) => `body/bodies/${body}`;
    await write(
      upstream,
      "sheet_definitions/body/body.json",
      JSON.stringify({
        name: "Stock body",
        animations: ["walk"],
        layer_1: {
          zPos: 10,
          ...Object.fromEntries(bodies.map((body) => [body, stockPath(body) + "/"])),
        },
        credits: [
          ...bodies.map((body) =>
            credit(stockPath(body), [
              ...(bodies.slice(0, 4).includes(body) ? ["OGA-BY 3.0"] : []),
              "CC-BY-SA 3.0",
              "GPL 3.0",
            ]),
          ),
          credit("body/bodies/child/walk/restricted.png", ["GPL 3.0"]),
        ],
      }),
    );
    await write(
      upstream,
      "sheet_definitions/head/accessory.json",
      JSON.stringify({
        name: "Accessory",
        animations: ["walk"],
        layer_1: { zPos: 20, female: "accessory/front/" },
        layer_2: { zPos: 5, female: "accessory/back/" },
        credits: [
          credit("accessory/front", ["OGA-BY 3.0+"]),
          credit("accessory/back", ["OGA-BY-3.0"]),
          credit("accessory/front/walk/other-version.png", ["OGA-BY 4.0", "CC-BY-SA 4.0"]),
          credit("accessory/front/walk/direct.png", ["OGA-BY 3.0", "CC-BY 4.0"]),
        ],
      }),
    );
    const png = await sharp({
      create: { width: 576, height: 256, channels: 4, background: "#00ff00" },
    })
      .png()
      .toBuffer();
    for (const body of bodies)
      await write(upstream, `spritesheets/${stockPath(body)}/walk.png`, png);
    await write(upstream, "spritesheets/body/bodies/child/walk/restricted.png", png);
    for (const file of [
      "accessory/front/walk.png",
      "accessory/back/walk.png",
      "accessory/front/walk/other-version.png",
      "accessory/front/walk/direct.png",
    ])
      await write(upstream, `spritesheets/${file}`, png);
    await write(
      upstream,
      "spritesheets/accessory/front/walk/wrong-grid.png",
      await sharp({ create: { width: 576, height: 320, channels: 4, background: "#00ff00" } })
        .png()
        .toBuffer(),
    );
    await withClient(
      (server) => registerLpcTools(server, workspace, upstream),
      async (client) => {
        for (const [index, body] of bodies.entries()) {
          const result = await client.callTool({
            name: "list_parts",
            arguments: { body, animation: "walk" },
          });
          expect(result.structuredContent).toMatchObject({
            items: [
              ...(index < 4 ? [{ id: "body/body:base", name: "Stock body" }] : []),
              ...(body === "female"
                ? [
                    { id: "head/accessory:base", name: "Accessory" },
                    { id: "head/accessory:direct", name: "Accessory (direct)" },
                  ]
                : []),
            ],
          });
        }
        const result = await client.callTool({
          name: "build_character",
          arguments: {
            body: "female",
            animation: "walk",
            parts: ["body/body:base", "head/accessory:base"],
            name: "stock-character",
          },
        });
        expect(result.structuredContent).toMatchObject({ kind: "character" });
        const directory = path.join(workspace, "artifacts/assets/lpc/stock-character");
        const credits = await readFile(path.join(directory, "CREDITS.md"), "utf8");
        expect(credits).toContain("[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)");
        expect(credits).toContain(
          "[OGA-BY 3.0 section 8(g)](https://static.opengameart.org/OGA-BY-3.0.txt)",
        );
        expect(credits).toContain("Fixture Artist");
        expect(credits).toContain("https://example.com/stock-art");
        const manifest = JSON.parse(await readFile(path.join(directory, "character.json"), "utf8"));
        expect(manifest.credits).toMatchObject([
          {
            sprite: "accessory/back/walk.png",
            licence: "CC BY 3.0",
            licenceBasis: { licence: "OGA-BY 3.0", section: "8(g)" },
          },
          {
            sprite: "body/bodies/female/walk.png",
            licence: "CC BY 3.0",
            licenceBasis: { licence: "OGA-BY 3.0", section: "8(g)" },
          },
          {
            sprite: "accessory/front/walk.png",
            licence: "CC BY 3.0",
            licenceBasis: { licence: "OGA-BY 3.0", section: "8(g)" },
          },
        ]);
        const direct = await client.callTool({
          name: "build_character",
          arguments: {
            body: "female",
            animation: "walk",
            parts: ["head/accessory:direct"],
            name: "direct",
          },
        });
        expect(direct.structuredContent).toMatchObject({ kind: "character" });
        const directManifest = JSON.parse(
          await readFile(
            path.join(workspace, "artifacts/assets/lpc/direct/character.json"),
            "utf8",
          ),
        );
        expect(directManifest.credits[1]).toMatchObject({
          sprite: "accessory/front/walk/direct.png",
          licence: "CC BY 4.0",
        });
        expect(directManifest.credits[1]).not.toHaveProperty("licenceBasis");
        expect((await projectFiles(workspace)).map(({ name }) => name)).toContain(
          "artifacts/assets/lpc/stock-character/CREDITS.md",
        );
      },
    );
  });
});
