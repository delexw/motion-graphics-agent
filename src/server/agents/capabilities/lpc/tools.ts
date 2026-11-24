import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { publishPixelAsset } from "../pixel-assets/output";
import { pixelToolResult } from "../pixel-assets/result";
import { lpcAnimations, lpcBodyTypes, lpcCatalogue } from "./catalog";
import {
  lpcDirections as directions,
  lpcFrameSize as frameSize,
  lpcSheetGrid,
  lpcSheetMatchesGrid,
} from "./sheet";

const selectors = {
  body: z.enum(lpcBodyTypes),
  animation: z.enum(lpcAnimations),
};
const assetName = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/);

export function registerLpcTools(server: McpServer, workspace: string, root: string) {
  const catalogue = lpcCatalogue(root);
  server.registerTool(
    "list_parts",
    {
      description:
        "List available CC0 and CC BY LPC items for a body layout and idle or walk animation. Search by item name or category and use the returned IDs. Search body/body for the licensed stock body layer in male, female, teen or child layouts. Include its returned ID explicitly when a stock body is requested.",
      inputSchema: {
        ...selectors,
        search: z.string().max(80).default(""),
        offset: z.number().int().min(0).default(0),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ body, animation, search, offset }, { signal }) =>
      pixelToolResult(async () => {
        const query = search.toLowerCase();
        const parts = (await catalogue.list(body, animation)).filter(({ id, name }) =>
          (id + " " + name.toLowerCase()).includes(query),
        );
        signal.throwIfAborted();
        const end = offset + 40;
        return {
          kind: "parts" as const,
          items: parts.slice(offset, end).map(({ id, name }) => ({ id, name })),
          nextOffset: end < parts.length ? end : null,
          total: parts.length,
        };
      }),
  );

  server.registerTool(
    "build_character",
    {
      description:
        "Compose a transparent LPC character sprite sheet from licensed item IDs returned by list_parts for the same body layout and animation. Upstream z-order controls layering. Automatically writes character.json and CREDITS.md with each part's authors, source, licence and changes. Use a new asset name.",
      inputSchema: {
        ...selectors,
        name: assetName,
        parts: z.array(z.string().min(1).max(200)).min(1).max(16),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ body, animation, name, parts }, { signal }) =>
      pixelToolResult(async () => {
        const available = new Map(
          (await catalogue.list(body, animation)).map((part) => [part.id, part]),
        );
        const selected = [...new Set(parts)].map((id) => {
          const part = available.get(id);
          if (!part)
            throw Error(`No compatible LPC item with verified CC0 or CC BY credits: ${id}`);
          return part;
        });
        const layers = selected.flatMap((part) => part.layers).sort((a, b) => a.z - b.z);
        const { width, height } = lpcSheetGrid(animation);
        return publishPixelAsset(
          workspace,
          "lpc",
          name,
          signal,
          async (staged, relative, leaseSignal) => {
            const overlays = await Promise.all(
              layers.map(async ({ file }) => {
                const input = await catalogue.image(file);
                if (!(await lpcSheetMatchesGrid(input, animation)))
                  throw Error(`LPC layer does not match the ${animation} grid: ${file}`);
                return { input };
              }),
            );
            leaseSignal.throwIfAborted();
            await sharp({ create: { width, height, channels: 4, background: "transparent" } })
              .composite(overlays)
              .png()
              .toFile(path.join(staged, "character.png"));

            const credits = layers.flatMap((layer) =>
              layer.credits.map((credit) => ({
                ...credit,
                sprite: layer.file,
              })),
            );
            const lines = credits.map(
              ({ sprite, authors, licence, licenceUrl, urls, notes, licenceBasis }) => {
                const basis = licenceBasis
                  ? ` Distributed under this licence via [${licenceBasis.licence} section ${licenceBasis.section}](${licenceBasis.licenceUrl}).`
                  : "";
                return `- ${sprite} by ${authors.join(", ")}. [${licence}](${licenceUrl}).${basis} Source: ${urls.join(", ")}.${notes ? ` ${notes}` : ""}`;
              },
            );
            const cycle = animation === "walk" ? [1, 2, 3, 4, 5, 6, 7, 8] : [0, 0, 1];
            const manifest = {
              body,
              animation,
              frameSize,
              width,
              height,
              directions,
              cycle,
              items: selected.map(({ id }) => id),
              credits,
            };
            await Promise.all([
              writeFile(
                path.join(staged, "character.json"),
                JSON.stringify(manifest, null, 2) + "\n",
              ),
              writeFile(
                path.join(staged, "CREDITS.md"),
                [
                  "# LPC character credits",
                  "",
                  "Source: https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator",
                  "Changes: the source layers were composited into a transparent animation sheet.",
                  "",
                  ...lines,
                  "",
                ].join("\n"),
              ),
            ]);
            return {
              kind: "character" as const,
              image: `${relative}/character.png`,
              metadata: `${relative}/character.json`,
              credits: `${relative}/CREDITS.md`,
              frameSize,
              directions,
              cycle,
            };
          },
        );
      }),
  );
}
