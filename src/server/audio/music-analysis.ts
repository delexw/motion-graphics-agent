import { randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  MusicBeatAnalysisSchema,
  type MusicAnalysis,
  type MusicAnalysisToolResult,
} from "../../shared/music-analysis";
import { rendererCliPath } from "../rendering/execution";
import { hyperframesMetadata } from "../rendering/hyperframes/metadata";
import { isolatedCommand } from "../runtime/process";
import { musicAnalysisFiles, musicSourceFingerprint } from "./music-analysis-files";

/** Analyze prepared music with the installed CLI; never install, generate audio or change renderers. */
export async function analyzeMusic(
  workspace: string,
  input: unknown,
  signal: AbortSignal,
): Promise<Extract<MusicAnalysisToolResult, { kind: "music_analysis" }>> {
  signal.throwIfAborted();
  const files = await musicAnalysisFiles(workspace, input);
  const { source, sourceFile, analysisFile, output } = files;
  workspace = files.workspace;
  const fingerprint = () => musicSourceFingerprint(source, signal);
  const sourceSha256 = await fingerprint();
  let stdout = "";
  await isolatedCommand(
    process.execPath,
    [rendererCliPath(hyperframesMetadata), "beats", source, "--json"],
    workspace,
    signal,
    undefined,
    180000,
    (text) => {
      stdout += text;
      if (stdout.length > 2 * 1024 * 1024) throw Error("Music analysis response exceeds 2 MiB");
    },
  );
  const measured = MusicBeatAnalysisSchema.parse(JSON.parse(stdout));
  if (path.resolve(measured.file) !== source)
    throw Error("Music analysis refers to a different source");
  if ((await fingerprint()) !== sourceSha256)
    throw Error("Music changed during analysis; analyze the prepared file again");
  const analysis: MusicAnalysis = {
    version: 1,
    analyzer: "hyperframes beats",
    sourceFile,
    sourceSha256,
    count: measured.count,
    bpm: measured.bpm,
    beatTimes: measured.beatTimes,
  };
  const temporary = `${output}.${randomUUID()}.tmp`;
  try {
    signal.throwIfAborted();
    await writeFile(temporary, JSON.stringify(analysis, null, 2) + "\n", { flag: "wx", signal });
    signal.throwIfAborted();
    await rename(temporary, output);
  } finally {
    await rm(temporary, { force: true });
  }
  return { kind: "music_analysis", analysisFile, analysis };
}
