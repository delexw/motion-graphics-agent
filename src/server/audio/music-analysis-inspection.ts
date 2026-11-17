import { readFile, stat } from "node:fs/promises";
import { MusicAnalysisSchema, type MusicAnalysisInspection } from "../../shared/music-analysis";
import { musicAnalysisFiles, musicSourceFingerprint } from "./music-analysis-files";

/** Read and verify a saved map; never run the analyzer or modify project files. */
export async function inspectMusicAnalysis(
  workspace: string,
  file: string,
  signal: AbortSignal,
): Promise<MusicAnalysisInspection> {
  signal.throwIfAborted();
  let files: Awaited<ReturnType<typeof musicAnalysisFiles>>;
  try {
    files = await musicAnalysisFiles(workspace, { file });
  } catch {
    signal.throwIfAborted();
    return { status: "unavailable" };
  }
  try {
    const info = await stat(files.output);
    if (!info.isFile() || info.size > 2 * 1024 * 1024) return { status: "invalid" };
  } catch (error) {
    signal.throwIfAborted();
    return {
      status: (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "unavailable",
    };
  }
  let analysis;
  try {
    analysis = MusicAnalysisSchema.parse(
      JSON.parse(await readFile(files.output, { encoding: "utf8", signal })),
    );
  } catch {
    signal.throwIfAborted();
    return { status: "invalid" };
  }
  if (analysis.sourceFile !== files.sourceFile) return { status: "stale" };
  try {
    if ((await musicSourceFingerprint(files.source, signal)) !== analysis.sourceSha256)
      return { status: "stale" };
    signal.throwIfAborted();
    return { status: "ready", analysisFile: files.analysisFile, analysis };
  } catch {
    signal.throwIfAborted();
    return { status: "unavailable" };
  }
}
