import { readFile, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { projectTechnologyRoot } from "./project-runtime";

/** Hash exact declared entry files so a copied local module can be verified without trusting its name. */
export async function browserPackageSources(
  workspace: string,
  runtimeDirectory: string,
  name: string,
  expectedVersion: string,
) {
  const root = await projectTechnologyRoot(workspace, runtimeDirectory);
  const packageRoot = await realpath(path.join(root, "node_modules", name));
  if (!packageRoot.startsWith((await realpath(root)) + path.sep))
    throw Error("Package is outside its project runtime");
  const meta = z
    .object({
      name: z.string(),
      version: z.string(),
      main: z.string().optional(),
      module: z.string().optional(),
      browser: z.unknown().optional(),
    })
    .parse(JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8")));
  if (meta.name !== name || meta.version !== expectedVersion)
    throw Error("Package provenance version mismatch");
  const hashes: Record<string, string> = {};
  for (const entry of [
    meta.module,
    meta.main,
    typeof meta.browser === "string" ? meta.browser : undefined,
  ]) {
    if (!entry) continue;
    try {
      const file = await realpath(path.resolve(packageRoot, entry));
      if (!file.startsWith(packageRoot + path.sep)) continue;
      hashes[path.relative(packageRoot, file).split(path.sep).join("/")] = createHash("sha256")
        .update(await readFile(file))
        .digest("hex");
    } catch {
      /* Optional entry points can be absent; never infer provenance from a filename. */
    }
  }
  return hashes;
}
