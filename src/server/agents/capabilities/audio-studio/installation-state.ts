import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { dataRoot } from "../../../runtime/config";

export const audioStudioRepository = "https://github.com/kanaworksai-hue/audio-studio-mcp.git";
export const audioStudioInstallationRoot = path.join(dataRoot, "audio-studio-installations");
const relativeFile = z
  .string()
  .min(1)
  .refine(
    (file) =>
      !file.includes("\\") &&
      !file.includes(":") &&
      !file.startsWith("/") &&
      file.split("/").every((part) => part && part !== "." && part !== ".."),
  );
export const AudioStudioInstallationSchema = z.object({
  repository: z.literal(audioStudioRepository),
  revision: z.string().regex(/^[a-f0-9]{40}$/),
  directory: z.string().regex(/^[a-f0-9]{40}-[a-f0-9-]{36}$/),
  platform: z.enum(["darwin", "win32"]),
  arch: z.string(),
  version: z.string().min(1),
  installedAt: z.string(),
  executableHash: z.string().regex(/^[a-f0-9]{64}$/),
  files: z.record(relativeFile, z.string().regex(/^[a-f0-9]{64}$/)),
});
export type AudioStudioInstallation = z.infer<typeof AudioStudioInstallationSchema>;
export function audioStudioExecutable(directory: string, platform: string) {
  return path.join(
    directory,
    ".venv",
    platform === "win32" ? "Scripts" : "bin",
    platform === "win32" ? "audio-studio-mcp.exe" : "audio-studio-mcp",
  );
}
export function audioStudioFileHash(file: string) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}
/** Fail closed on linked source paths, changed source or a pointer outside the managed root. */
export function verifyAudioStudioInstallation(root: string, value: unknown) {
  const manifest = AudioStudioInstallationSchema.parse(value);
  if (!manifest.directory.startsWith(`${manifest.revision}-`))
    throw Error("Audio Studio revision mismatch");
  const directory = path.join(root, manifest.directory);
  if (!lstatSync(root).isDirectory() || !lstatSync(directory).isDirectory())
    throw Error("Audio Studio installation must not be linked");
  for (const [file, hash] of Object.entries(manifest.files)) {
    let target = directory;
    for (const part of file.split("/")) {
      target = path.join(target, part);
      if (lstatSync(target).isSymbolicLink()) throw Error("Audio Studio source must not be linked");
    }
    if (!lstatSync(target).isFile() || audioStudioFileHash(target) !== hash)
      throw Error("Audio Studio source integrity check failed");
  }
  if (
    !manifest.files["pyproject.toml"] ||
    !manifest.files.LICENSE ||
    !manifest.files["uv.lock"] ||
    !Object.keys(manifest.files).some((file) => file.startsWith("src/"))
  )
    throw Error("Audio Studio installation evidence is incomplete");
  const executable = audioStudioExecutable(directory, manifest.platform);
  if (
    !lstatSync(path.join(directory, ".venv")).isDirectory() ||
    !lstatSync(path.dirname(executable)).isDirectory() ||
    !lstatSync(executable).isFile()
  )
    throw Error("Audio Studio executable is unavailable or linked");
  if (audioStudioFileHash(executable) !== manifest.executableHash)
    throw Error("Audio Studio executable integrity check failed");
  return { manifest, directory, executable };
}
export function installedAudioStudio(
  root = audioStudioInstallationRoot,
  platform: string = process.platform,
  arch: string = process.arch,
) {
  const pointer = path.join(root, "current.json");
  if (!existsSync(pointer)) return;
  if (!lstatSync(pointer).isFile()) throw Error("Audio Studio pointer must not be linked");
  const result = verifyAudioStudioInstallation(root, JSON.parse(readFileSync(pointer, "utf8")));
  if (result.manifest.platform !== platform || result.manifest.arch !== arch)
    throw Error("Audio Studio installation belongs to another platform");
  return result;
}
