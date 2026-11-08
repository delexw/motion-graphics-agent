import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { appRoot } from "../../runtime/config";
import { projectArtifactPath } from "../../runtime/workspace";

/** App-owned browser helper; never modifies the upstream skill or follows workspace links. */
export async function stageProceduralModelRuntime(workspace: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const relative = projectArtifactPath(workspace, "vendor", "procedural-model.ts");
  let destination = path.resolve(workspace);
  for (const segment of relative.split("/").slice(0, -1)) {
    destination = path.join(destination, segment);
    await mkdir(destination, { recursive: true });
    if (!(await lstat(destination)).isDirectory())
      throw Error("Authoring runtime directory must not be a link");
  }
  const file = path.join(destination, "procedural-model.ts");
  const existing = await lstat(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
  if (existing && !existing.isFile()) throw Error("Authoring runtime file must not be a link");
  const source = await readFile(path.join(appRoot, "src/authoring/procedural-model.ts"));
  await writeFile(file, source, { signal });
  return relative;
}
