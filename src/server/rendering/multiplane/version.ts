import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { appRoot } from "../../runtime/config";

/** Report the installed dependency, so compatible upgrades do not need a source edit. */
export function readMultiplaneVersion(
  metadataPath = path.join(appRoot, "node_modules/multiplane/package.json"),
) {
  return z
    .object({ name: z.literal("multiplane"), version: z.string().min(1) })
    .parse(JSON.parse(readFileSync(metadataPath, "utf8"))).version;
}

export const multiplaneVersion = readMultiplaneVersion();
