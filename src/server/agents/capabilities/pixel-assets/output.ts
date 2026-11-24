import { lstat, mkdir, mkdtemp, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";
import { acquireFileLease } from "../../../runtime/file-lease";
import { renderSourcePath, workspacePaths } from "../../../runtime/workspace";

export async function publishPixelAsset<T>(
  workspace: string,
  category: "lpc" | "pixelfx",
  name: string,
  signal: AbortSignal,
  build: (staged: string, relative: string, signal: AbortSignal) => Promise<T>,
) {
  signal.throwIfAborted();
  workspace = await realpath(workspace);
  const relative = path.posix.join(workspacePaths(workspace).assets, category);
  const parent = renderSourcePath(workspace, relative);
  const assets = path.dirname(parent);
  if ((await realpath(path.dirname(assets))) !== path.dirname(assets))
    throw Error("Pixel outputs require a project-owned render input directory.");
  await mkdir(assets, { recursive: true });
  if ((await realpath(assets)) !== assets)
    throw Error("Pixel outputs require a project-owned assets directory.");
  await mkdir(parent, { recursive: true });
  if ((await realpath(parent)) !== parent)
    throw Error("Pixel outputs require a project-owned directory.");
  const destination = path.join(parent, name);
  const lease = await acquireFileLease(destination, signal);
  const ensureAbsent = async () => {
    try {
      await lstat(destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    throw Error("This pixel asset already exists. Use a new asset name.");
  };
  try {
    await ensureAbsent();
    const staged = await mkdtemp(path.join(parent, ".build-"));
    try {
      const result = await build(staged, path.posix.join(relative, name), lease.signal);
      lease.signal.throwIfAborted();
      if ((await realpath(staged)) !== staged || (await realpath(parent)) !== parent)
        throw Error("Pixel output directories must stay inside the project.");
      await ensureAbsent();
      await rename(staged, destination);
      return result;
    } finally {
      if ((await realpath(parent).catch(() => "")) === parent)
        await rm(staged, { force: true, recursive: true });
    }
  } finally {
    await lease.release();
  }
}
