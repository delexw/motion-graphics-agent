import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { AnalyzeMusicInputSchema } from "../../shared/music-analysis";
import { renderSourcePath } from "../runtime/workspace";

export async function musicAnalysisFiles(workspace: string, input: unknown) {
  const { file } = AnalyzeMusicInputSchema.parse(input);
  if (path.isAbsolute(file) || file.split(/[\\/]/).includes(".."))
    throw Error("Use a workspace-relative music file without traversal");
  workspace = await realpath(workspace);
  const source = await realpath(renderSourcePath(workspace, file));
  if (!/\.(wav|mp3|flac|ogg|m4a|aac|aiff?|opus)$/i.test(source))
    throw Error("Unsupported music format; use WAV, MP3, FLAC, OGG, M4A, AAC, AIFF or Opus");
  const info = await stat(source);
  if (!info.isFile() || info.size > 256 * 1024 * 1024)
    throw Error("Music input must be a regular file up to 256 MiB");
  const sourceFile = path.relative(workspace, source).split(path.sep).join("/");
  const analysisFile = `${sourceFile}.beats.json`;
  const output = renderSourcePath(workspace, analysisFile);
  return { workspace, source, sourceFile, analysisFile, output };
}

export async function musicSourceFingerprint(source: string, signal: AbortSignal) {
  return createHash("sha256")
    .update(await readFile(source, { signal }))
    .digest("hex");
}
