import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { copyFile, lstat, readFile, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { command } from "../../../runtime/process";
import { publishPixelAsset } from "../pixel-assets/output";
import { pixelToolResult } from "../pixel-assets/result";

const categories = ["weather", "nature", "water", "fire", "ice", "lightning", "critters"] as const;
const slug = /^[a-z0-9][a-z0-9-]*$/;
const effectId = z
  .string()
  .regex(/^[a-z0-9-]+\/[a-z0-9-]+$/)
  .max(80);
const size = z.number().int().min(1);
const coord = z.number().int().min(0);
const effectMetadata = z.object({
  frames: z
    .array(
      z.object({
        frame: z.object({ x: coord, y: coord, w: size, h: size }),
        duration: size,
      }),
    )
    .min(1)
    .max(540),
  meta: z.object({
    image: z.string(),
    size: z.object({ w: size, h: size }),
    pixelfx: z.object({
      id: effectId,
      fps: size,
      loop: z.boolean(),
      frames: size,
      frameSize: z.tuple([size, size]),
      pivot: z.tuple([z.number().finite(), z.number().finite()]),
    }),
  }),
});

async function listEffects(root: string, category?: (typeof categories)[number]) {
  const entries = await Promise.all(
    (category ? [category] : categories).map(async (group) => {
      const directory = path.join(root, "src/fx", group);
      const info = await lstat(directory).catch(() => undefined);
      if (!info?.isDirectory()) return [];
      const files = await readdir(directory, { withFileTypes: true });
      return files.flatMap((file) => {
        const name = file.name.slice(0, -3);
        return file.isFile() && file.name.endsWith(".js") && slug.test(name)
          ? [`${group}/${name}`]
          : [];
      });
    }),
  );
  return entries.flat().sort();
}

async function verifySheet(image: string, metadata: string, id: string, name: string, fps: number) {
  const [png, json] = await Promise.all([lstat(image), lstat(metadata)]);
  if (!png.isFile() || png.size > 64 * 1024 * 1024 || !json.isFile() || json.size > 1024 * 1024)
    throw Error("PixelFX did not produce a regular PNG and timing file within the size limit.");
  const data = effectMetadata.parse(JSON.parse(await readFile(metadata, "utf8")));
  const { w, h } = data.meta.size;
  const timing = data.meta.pixelfx;
  const info = await sharp(image, { limitInputPixels: 48_000_000 }).metadata();
  if (
    info.format !== "png" ||
    !info.hasAlpha ||
    info.width !== w ||
    info.height !== h ||
    data.meta.image !== name + ".png" ||
    timing.id !== id ||
    timing.fps !== fps ||
    timing.frames !== data.frames.length ||
    data.frames.some(
      ({ frame }) =>
        frame.w !== timing.frameSize[0] ||
        frame.h !== timing.frameSize[1] ||
        frame.x + frame.w > w ||
        frame.y + frame.h > h,
    )
  )
    throw Error("PixelFX sheet dimensions or timing do not match the effect metadata.");
  return timing;
}

export function registerPixelFxTools(server: McpServer, workspace: string, root: string) {
  server.registerTool(
    "list_effects",
    {
      description:
        "List installed PixelFX environment effects. Filter by weather, nature, water, fire, ice, lightning or critters. Choose an exact ID for render_effect.",
      inputSchema: { category: z.enum(categories).optional() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ category }, { signal }) =>
      pixelToolResult(async () => {
        const effects = await listEffects(root, category);
        signal.throwIfAborted();
        return { kind: "effects" as const, effects };
      }),
  );

  server.registerTool(
    "render_effect",
    {
      description:
        "Export an installed PixelFX effect as a transparent PNG sprite sheet and upstream frame timing JSON, using a fixed seed. Use an exact effect ID from list_effects and a new asset name. Preserves PixelFX licence and notices with the exported asset.",
      inputSchema: {
        effect: effectId,
        name: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
        seed: z
          .number()
          .int()
          .min(0)
          .max(2 ** 32 - 1)
          .default(1),
        fps: z.number().int().min(1).max(30).default(12),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ effect, name, seed, fps }, { signal }) =>
      pixelToolResult(async () => {
        if (!(await listEffects(root)).includes(effect))
          throw Error("Choose an installed environment effect from pixel_fx.list_effects.");

        return publishPixelAsset(
          workspace,
          "pixelfx",
          name,
          signal,
          async (staged, relative, leaseSignal) => {
            const scratch = path.join(staged, "upstream");
            await command(
              process.execPath,
              [
                path.join(root, "tools/render.mjs"),
                effect,
                "--sheet",
                "--no-actor",
                "--bg",
                "none",
                "--seed",
                String(seed),
                "--fps",
                String(fps),
                "--max",
                "2",
                "--out",
                scratch,
              ],
              workspace,
              leaseSignal,
              undefined,
              60_000,
            );

            const basename = effect.split("/")[1];
            const source = path.join(scratch, effect, basename);
            const timing = await verifySheet(
              source + ".png",
              source + ".json",
              effect,
              basename,
              fps,
            );
            await Promise.all([
              rename(source + ".png", path.join(staged, basename + ".png")),
              rename(source + ".json", path.join(staged, basename + ".json")),
              copyFile(path.join(root, "LICENSE"), path.join(staged, "LICENSE")),
              copyFile(path.join(root, "NOTICE.md"), path.join(staged, "NOTICE.md")),
            ]);
            await rm(scratch, { recursive: true, force: true });
            return {
              kind: "effect" as const,
              effect,
              seed,
              image: `${relative}/${basename}.png`,
              metadata: `${relative}/${basename}.json`,
              licence: `${relative}/LICENSE`,
              notices: `${relative}/NOTICE.md`,
              fps,
              frames: timing.frames,
              frameSize: timing.frameSize,
              pivot: timing.pivot,
              loop: timing.loop,
            };
          },
        );
      }),
  );
}
