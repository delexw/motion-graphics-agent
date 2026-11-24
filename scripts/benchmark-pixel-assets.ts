import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import { agentCapabilities } from "../src/server/agents/capabilities/registry";
import { prepareProjectLayout } from "../src/server/runtime/workspace";

const trials = 3;
const asset = z.object({
  kind: z.enum(["character", "effect"]),
  image: z.string(),
  metadata: z.string(),
});
const definitions = z.object({
  items: z.array(z.object({ id: z.string() })),
});
const outputs = z.object({
  credits: z.string(),
});
const effectOutputs = z.object({
  licence: z.string(),
  notices: z.string(),
  frames: z.number(),
  fps: z.number(),
});
const parts = [
  "body/shadow:base",
  "body/body:base",
  "head/heads/fantasy/heads_goblin:base",
  "torso/dresses/kimono/dress_kimono:forest",
  "feet/boots/feet_boots_rim:base",
];
const selectors = { body: "female", animation: "walk" };
type Input = Record<string, unknown>;

async function call(client: Client, name: string, input: Input) {
  return client.callTool({ name, arguments: input }, undefined, { timeout: 80_000 });
}

async function successful(client: Client, name: string, input: Input) {
  const result = await call(client, name, input);
  assert(!result.isError, JSON.stringify(result.structuredContent ?? result.content));
  return result.structuredContent;
}

async function timed<T>(run: () => Promise<T>) {
  const start = performance.now();
  const value = await run();
  return { value, milliseconds: Math.round(performance.now() - start) };
}

async function sample(workspace: string, client: Client, tool: string, input: Input) {
  const { value, milliseconds } = await timed(() => successful(client, tool, input));
  const result = asset.parse(value);
  const base = async (relative: string) => readFile(path.join(workspace, relative));
  const image = await base(result.image);
  const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
  if (result.kind === "character") {
    const attribution = (await base(outputs.parse(value).credits)).toString("utf8");
    for (const phrase of [
      "CC0 1.0",
      "CC BY 4.0",
      "CC BY 3.0",
      "OGA-BY 3.0 section 8(g)",
      "body/bodies/female/walk.png",
      "Changes:",
      "https://opengameart.org/",
    ])
      assert(attribution.includes(phrase), `Missing attribution: ${phrase}`);
  } else {
    const files = effectOutputs.parse(value);
    assert((await base(files.licence)).includes("MIT License"));
    assert((await base(files.notices)).includes("Notices"));
  }
  return {
    milliseconds,
    bytes: image.length,
    imageSha256: sha256(image),
    metadataSha256: sha256(await base(result.metadata)),
    result: value,
  };
}

async function main(workspace: string) {
  await mkdir(workspace);
  await prepareProjectLayout(workspace);
  const { servers } = agentCapabilities(workspace);
  assert(servers.lpc && servers.pixel_fx, "Install LPC and PixelFX before running the benchmark.");
  const connect = async (id: "lpc" | "pixel_fx") => {
    const client = new Client({ name: "kiteva-pixel-assets-benchmark", version: "1.0.0" });
    const { command, args, env, enabledTools } = servers[id];
    try {
      await client.connect(new StdioClientTransport({ command, args, env }));
      assert.deepEqual(
        (await client.listTools()).tools.map(({ name }) => name).sort(),
        [...enabledTools].sort(),
      );
      return client;
    } catch (error) {
      await client.close();
      throw error;
    }
  };
  const lpc = await connect("lpc");
  try {
    const fx = await connect("pixel_fx");
    try {
      const discovered = await timed(() =>
        successful(lpc, "list_parts", { ...selectors, search: "goblin" }),
      );
      assert(
        definitions
          .parse(discovered.value)
          .items.some(({ id }) => id === "head/heads/fantasy/heads_goblin:base"),
      );
      const discoveredFx = await timed(() =>
        successful(fx, "list_effects", { category: "weather" }),
      );
      assert(
        z
          .object({ effects: z.array(z.string()) })
          .parse(discoveredFx.value)
          .effects.includes("weather/fireflies"),
      );
      const rejected = await call(lpc, "build_character", {
        ...selectors,
        body: "muscular",
        name: "excluded-body",
        parts: ["body/body:base"],
      });
      assert(rejected.isError, "An excluded LPC body was accepted.");
      const runs = [];
      for (let index = 0; index < trials; index += 1) {
        runs.push({
          character: await sample(workspace, lpc, "build_character", {
            ...selectors,
            name: `goblin-${index + 1}`,
            parts,
          }),
          fireflies: await sample(workspace, fx, "render_effect", {
            effect: "weather/fireflies",
            name: `fireflies-${index + 1}`,
            seed: 42,
            fps: 12,
          }),
          torch: await sample(workspace, fx, "render_effect", {
            effect: "fire/torch",
            name: `torch-${index + 1}`,
            seed: 42,
            fps: 12,
          }),
        });
      }
      for (const key of ["character", "fireflies", "torch"] as const) {
        assert.equal(
          new Set(runs.map((run) => run[key].imageSha256)).size,
          1,
          `${key} image varies`,
        );
        assert.equal(
          new Set(runs.map((run) => run[key].metadataSha256)).size,
          1,
          `${key} metadata varies`,
        );
      }
      const report = {
        trials,
        rejectedExcludedBody: true,
        discoveryMilliseconds: { lpc: discovered.milliseconds, pixelFx: discoveredFx.milliseconds },
        runs,
      };
      const reportPath = path.join(workspace, "benchmark.json");
      await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
      process.stdout.write(
        JSON.stringify(
          {
            reportPath,
            discoveryMilliseconds: report.discoveryMilliseconds,
            runs: runs.map((run) =>
              Object.fromEntries(
                Object.entries(run).map(([id, { milliseconds, bytes }]) => [
                  id,
                  { milliseconds, bytes },
                ]),
              ),
            ),
          },
          null,
          2,
        ) + "\n",
      );
    } finally {
      await fx.close();
    }
  } finally {
    await lpc.close();
  }
}

if (!process.argv[2])
  throw Error("Provide a new output directory for the local pixel asset benchmark.");
await main(path.resolve(process.argv[2]));
