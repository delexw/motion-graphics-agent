import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { dataRoot } from "../../../runtime/paths";

export const pixelAssetSources = {
  lpc: {
    name: "LPC",
    folder: "lpc",
    variable: "KITEVA_LPC_ROOT",
    url: "https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator.git",
    revision: "86a3719ee4a7e2e9fb27c7c152e29a741d3e930a",
    required: [
      "sheet_definitions/body/body.json",
      "spritesheets/body/bodies/teen/walk.png",
      "CREDITS.csv",
      "LICENSE",
    ],
    markers: ["sheet_definitions", "spritesheets"],
  },
  pixel_fx: {
    name: "PixelFX",
    folder: "pixelfx",
    variable: "KITEVA_PIXELFX_ROOT",
    url: "https://github.com/patch-gg/pixelfx.git",
    revision: "5294518ce7c72e48b6100a744596e0acf57f2826",
    required: [
      "tools/render.mjs",
      "tools/lib/fxlib.mjs",
      "src/fx/weather/fireflies.js",
      "LICENSE",
      "NOTICE.md",
    ],
    markers: ["tools/render.mjs", "src/fx/weather", "LICENSE", "NOTICE.md"],
  },
} as const;

export type PixelAssetSource = (typeof pixelAssetSources)[keyof typeof pixelAssetSources];
export const pixelAssetRoot = path.join(dataRoot, "pixel-assets");

export function pixelAssetSourceAvailable(source: PixelAssetSource, directory: string) {
  return source.markers.every((file) => existsSync(path.join(directory, file)));
}

export function managedPixelAssetDirectory(source: PixelAssetSource, root: string) {
  return path.join(root, "managed", source.folder);
}

export function installedPixelAssetSource(source: PixelAssetSource, root = pixelAssetRoot) {
  const managed = managedPixelAssetDirectory(source, root);
  try {
    const current = readFileSync(path.join(managed, "current"), "utf8").trim();
    if (/^[a-f0-9]{40}-[a-f0-9-]{36}$/.test(current)) {
      const directory = path.join(managed, current);
      if (source.required.every((file) => existsSync(path.join(directory, file)))) return directory;
    }
  } catch {
    // A manual checkout may still be present.
  }
  const legacy = path.join(root, source.folder);
  return pixelAssetSourceAvailable(source, legacy) ? legacy : undefined;
}
