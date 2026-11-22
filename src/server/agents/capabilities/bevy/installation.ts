import { constants, readFileSync } from "node:fs";
import { access, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { dataRoot, safeMessage } from "../../../runtime/config";
import { acquireFileLease } from "../../../runtime/file-lease";
import { nativeExecutable, userHome } from "../../../runtime/platform";
import { command } from "../../../runtime/process";

const stableVersion = z.string().regex(/^\d+\.\d+\.\d+$/);
const pointerSchema = z.object({
  version: stableVersion,
  release: z.string().regex(/^release-[a-zA-Z0-9-]+$/),
});
const defaultRoot = path.join(dataRoot, "bevy-installations");

export function managedBevyRuntime(root = defaultRoot) {
  try {
    const pointer = pointerSchema.parse(
      JSON.parse(readFileSync(path.join(root, "current.json"), "utf8")),
    );
    const directory = path.join(root, pointer.release);
    return { ...pointer, directory, config: path.join(directory, "vendor.toml") };
  } catch {
    return undefined;
  }
}

async function latestBevy(signal: AbortSignal) {
  const response = await fetch("https://crates.io/api/v1/crates/bevy", {
    headers: { "User-Agent": "Kiteva (local Bevy dependency maintenance)" },
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
  });
  if (!response.ok) throw Error(`Bevy release lookup returned HTTP ${response.status}`);
  return z
    .object({ crate: z.object({ max_stable_version: stableVersion }) })
    .parse(await response.json()).crate.max_stable_version;
}

async function cargoExecutable() {
  const name = nativeExecutable("cargo");
  const locations = [
    ...(process.env.PATH ?? "").split(path.delimiter).filter(Boolean),
    path.join(userHome(), ".cargo", "bin"),
  ];
  for (const directory of locations) {
    const candidate = path.resolve(directory, name);
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try the next Cargo location.
    }
  }
  throw Error("Install Rust and Cargo to enable Bevy.");
}

export async function refreshBevy({
  signal,
  root = defaultRoot,
}: {
  signal: AbortSignal;
  root?: string;
}) {
  signal.throwIfAborted();
  const cargo = await cargoExecutable();
  await mkdir(root, { recursive: true });
  const lease = await acquireFileLease(path.join(root, "update"), signal);
  const env = {
    CARGO_HOME: path.join(root, "cargo-cache"),
    RUSTUP_HOME: process.env.RUSTUP_HOME ?? path.join(userHome(), ".rustup"),
  };
  const run = (args: string[], cwd: string) =>
    command(cargo, args, cwd, lease.signal, undefined, 300_000, false, undefined, env);
  const verify = (runtime: NonNullable<ReturnType<typeof managedBevyRuntime>>) =>
    run(
      ["metadata", "--format-version", "1", "--frozen", "--config", runtime.config],
      runtime.directory,
    );
  try {
    const previous = managedBevyRuntime(root);
    try {
      const version = await latestBevy(lease.signal);
      if (previous?.version === version) {
        try {
          await verify(previous);
          return { status: "current" as const, version };
        } catch {
          lease.signal.throwIfAborted();
          // A damaged cache can be rebuilt without changing the published release in place.
        }
      }

      const directory = await mkdtemp(path.join(root, "release-"));
      let published = false;
      try {
        await mkdir(path.join(directory, "src"));
        await writeFile(path.join(directory, "src/main.rs"), "fn main() {}\n");
        await writeFile(
          path.join(directory, "Cargo.toml"),
          `[package]\nname = "kiteva-bevy-scene"\nversion = "0.1.0"\nedition = "2024"\n\n[dependencies]\nbevy = "=${version}"\ncrossbeam-channel = "0.5"\n`,
        );
        await run(["generate-lockfile"], directory);
        await run(["vendor", "--locked", "--versioned-dirs", "vendor"], directory);
        const config = path.join(directory, "vendor.toml");
        await writeFile(
          config,
          `[source.crates-io]\nreplace-with = "kiteva-bevy"\n[source.kiteva-bevy]\ndirectory = ${JSON.stringify(path.join(directory, "vendor"))}\n`,
        );
        const release = path.basename(directory);
        await verify({ version, directory, release, config });
        lease.signal.throwIfAborted();
        const next = path.join(directory, "next.json");
        await writeFile(next, JSON.stringify({ version, release }) + "\n");
        await rename(next, path.join(root, "current.json"));
        published = true;
        return { status: "installed" as const, version };
      } finally {
        if (!published) await rm(directory, { recursive: true, force: true });
      }
    } catch (error) {
      lease.signal.throwIfAborted();
      if (!previous) throw error;
      await verify(previous);
      return {
        status: "fallback" as const,
        version: previous.version,
        limitation: safeMessage(error),
      };
    }
  } finally {
    await lease.release();
  }
}
