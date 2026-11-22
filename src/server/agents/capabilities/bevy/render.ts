import { constants } from "node:fs";
import { access, lstat, mkdir, mkdtemp, readdir, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  BevyRenderInputSchema,
  type BevyRenderInput,
  type BevyRenderResult,
} from "../../../../shared/bevy-render";
import { isolatedCommand } from "../../../runtime/process";
import { renderSourcePath, workspacePaths } from "../../../runtime/workspace";
import { acquireFileLease } from "../../../runtime/file-lease";

async function ensureAbsent(directory: string) {
  const existing = await lstat(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
  if (existing) throw Error("This Bevy shot already exists. Use a new shot name.");
}

export async function renderBevyFrames(
  workspace: string,
  input: BevyRenderInput,
  signal: AbortSignal,
): Promise<Extract<BevyRenderResult, { kind: "frames" }>> {
  const { executable, shot, width, height, fps, frames } = BevyRenderInputSchema.parse(input);
  signal.throwIfAborted();
  workspace = await realpath(workspace);
  if (path.isAbsolute(executable) || executable.split(/[\\/]/).includes(".."))
    throw Error("Use a project-relative Bevy executable inside render inputs.");
  const binary = renderSourcePath(workspace, executable);
  if (!(await lstat(binary)).isFile())
    throw Error("Build a project-local Bevy executable file first.");
  await access(binary, constants.X_OK);

  const relative = path.posix.join(workspacePaths(workspace).assets, "bevy");
  const parent = renderSourcePath(workspace, relative);
  if ((await realpath(path.dirname(parent))) !== path.dirname(parent))
    throw Error("Bevy outputs require a project-owned assets directory.");
  await mkdir(parent).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
  if ((await realpath(parent)) !== parent || !(await lstat(parent)).isDirectory())
    throw Error("Bevy outputs require a project-owned directory.");
  const destination = path.join(parent, shot);
  const lease = await acquireFileLease(destination, signal);
  try {
    await ensureAbsent(destination);
    const staged = await mkdtemp(path.join(parent, ".render-"));
    try {
      await isolatedCommand(
        binary,
        [
          "--output-dir",
          staged,
          "--width",
          String(width),
          "--height",
          String(height),
          "--fps",
          String(fps),
          "--frames",
          String(frames),
        ],
        workspace,
        lease.signal,
        undefined,
        180_000,
      );
      if ((await realpath(staged)) !== staged || (await realpath(parent)) !== parent)
        throw Error("Bevy output directories must stay inside the project.");
      const names = (await readdir(staged)).sort();
      if (names.length !== frames) throw Error("Bevy returned the wrong number of frames.");
      for (const [index, name] of names.entries()) {
        lease.signal.throwIfAborted();
        if (name !== `frame-${String(index).padStart(6, "0")}.png`)
          throw Error("Bevy must write numbered PNG frames starting at frame-000000.png.");
        const file = path.join(staged, name);
        const stat = await lstat(file);
        if (!stat.isFile() || stat.size > 32 * 1024 * 1024)
          throw Error("Each Bevy frame must be a regular PNG file up to 32 MiB.");
        const image = await sharp(file, { limitInputPixels: width * height }).metadata();
        if (image.format !== "png" || image.width !== width || image.height !== height)
          throw Error("Bevy frame format or dimensions do not match the request.");
      }
      lease.signal.throwIfAborted();
      await ensureAbsent(destination);
      await rename(staged, destination);
      return {
        kind: "frames",
        directory: path.posix.join(relative, shot),
        filenamePattern: "frame-%06d.png",
        startNumber: 0,
        width,
        height,
        fps,
        frames,
      };
    } finally {
      if ((await realpath(parent).catch(() => "")) === parent)
        await rm(staged, { recursive: true, force: true });
    }
  } finally {
    await lease.release();
  }
}
