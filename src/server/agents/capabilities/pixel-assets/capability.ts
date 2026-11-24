import path from "node:path";
import { pathToFileURL } from "node:url";
import { appRoot } from "../../../runtime/paths";
import { lpcAuthoring, lpcTools } from "../lpc/metadata";
import { pixelFxAuthoring, pixelFxTools } from "../pixel-fx/metadata";
import { installedPixelAssetSource, pixelAssetSourceAvailable, pixelAssetSources } from "./sources";
import type { AgentMcpCapability } from "../shared/types";

export const pixelAssetResources = [lpcAuthoring, pixelFxAuthoring];

const installations = {
  lpc: {
    tools: lpcTools,
    guidance:
      "Read authoringResources in style-context.json. When LPC is selected or selection is unavailable, use lpc.list_parts to find compatible licensed layers, then lpc.build_character. Include the generated CREDITS.md when sharing the sprites or publishing the film (for example, in the video description or accompanying credits). Use the sheet grid in character.json to sample frames at composition time.",
  },
  pixel_fx: {
    tools: pixelFxTools,
    guidance:
      "Read authoringResources in style-context.json. When PixelFX is selected or selection is unavailable, use pixel_fx.list_effects and pixel_fx.render_effect for suitable pixel-art ambience. Composite the transparent sheet using its frame timings and loop flag. Read the pivot and frame bounds from the JSON. Keep the included notices with the source assets.",
  },
};

export type PixelAssetCapabilityId = keyof typeof installations;

function installationRoot(id: PixelAssetCapabilityId) {
  const source = pixelAssetSources[id];
  const external = process.env[source.variable];
  if (!external) return installedPixelAssetSource(source);
  const root = path.resolve(external);
  return pixelAssetSourceAvailable(source, root) ? root : undefined;
}

export function availablePixelAssetResources() {
  return pixelAssetResources.filter(({ id }) => installationRoot(id));
}

export function pixelAssetCapabilities(workspace: string) {
  const servers: Record<string, AgentMcpCapability> = {};
  const guidance: string[] = [];
  for (const { id, name } of pixelAssetResources) {
    const root = installationRoot(id);
    if (!root) continue;
    const installation = installations[id];
    servers[id] = {
      command: process.execPath,
      args: [
        "--import",
        pathToFileURL(path.join(appRoot, "node_modules/tsx/dist/loader.mjs")).href,
        path.join(appRoot, "src/server/agents/capabilities/pixel-assets/server.ts"),
        JSON.stringify({ workspace, root, id }),
      ],
      env: {},
      enabledTools: installation.tools,
      toolTimeoutSeconds: 75,
    };
    guidance.push(`### ${name}\n\n${installation.guidance}`);
  }
  return { servers, guidance };
}
