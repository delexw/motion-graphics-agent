import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { installPixelAssetSources } from "../../src/server/agents/capabilities/pixel-assets/installation";
import {
  installedPixelAssetSource,
  managedPixelAssetDirectory,
  pixelAssetSources,
  type PixelAssetSource,
} from "../../src/server/agents/capabilities/pixel-assets/sources";

async function fixture(run: (root: string, signal: AbortSignal) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "pixel-source-install-"));
  try {
    await run(root, new AbortController().signal);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

async function sourceFiles(source: PixelAssetSource, directory: string) {
  for (const name of source.required) {
    const file = path.join(directory, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, "fixture");
  }
}

it("installs both pinned sources once and reuses them on concurrent setup and launch", async () => {
  await fixture(async (root, signal) => {
    const fetched = new Map<string, PixelAssetSource>();
    const sources = Object.values(pixelAssetSources);
    const runGit = vi.fn(async (args: string[]) => {
      const directory = args[1];
      if (args.includes("fetch")) {
        const source = sources.find(({ url }) => args.includes(url));
        expect(source).toBeDefined();
        expect(args.at(-1)).toBe(source?.revision);
        fetched.set(directory, source!);
        await sourceFiles(source!, directory);
      }
      if (args.includes("rev-parse"))
        return path.basename(directory).slice(0, 40).startsWith(".install-")
          ? fetched.get(directory)!.revision
          : path.basename(directory).slice(0, 40);
      return "";
    });
    const options = { root, signal, runGit, environment: {}, installIfMissing: true };
    const results = (
      await Promise.all([installPixelAssetSources(options), installPixelAssetSources(options)])
    ).flat();
    expect(results.map(({ status }) => status).sort()).toEqual([
      "current",
      "current",
      "installed",
      "installed",
    ]);
    for (const source of sources) {
      const directory = installedPixelAssetSource(source, root);
      expect(path.basename(directory!)).toMatch(new RegExp(`^${source.revision}-`));
      expect(await readFile(path.join(directory!, source.required[0]), "utf8")).toBe("fixture");
    }
    expect(await installPixelAssetSources({ ...options, installIfMissing: false })).toEqual(
      sources.map(({ name, revision }) => ({ name, status: "current", detail: revision })),
    );
    expect(fetched.size).toBe(2);
  });
});

it("retains a verified previous source on failed upgrade and respects an external directory", async () => {
  await fixture(async (root, signal) => {
    const older = "a".repeat(40);
    const activeName = `${older}-00000000-0000-0000-0000-000000000000`;
    const source = pixelAssetSources.lpc;
    const managed = managedPixelAssetDirectory(source, root);
    const current = path.join(managed, activeName);
    await sourceFiles(source, current);
    await writeFile(path.join(managed, "current"), activeName);
    const external = path.join(root, "external");
    await sourceFiles(pixelAssetSources.pixel_fx, external);
    const runGit = vi.fn(async (args: string[]) => {
      if (args.includes("rev-parse")) return older;
      if (args.includes("fetch")) throw Error("fixture fetch failed");
      return "";
    });
    expect(
      await installPixelAssetSources({
        root,
        signal,
        runGit,
        environment: { KITEVA_PIXELFX_ROOT: external },
        installIfMissing: false,
      }),
    ).toMatchObject([
      { name: "LPC", status: "fallback" },
      { name: "PixelFX", status: "external" },
    ]);
    expect(installedPixelAssetSource(source, root)).toBe(current);
    expect((await readdir(managed)).sort()).toEqual([activeName, "current"].sort());
    expect(
      runGit.mock.calls.every(([args]) => !args.includes(pixelAssetSources.pixel_fx.url)),
    ).toBe(true);
  });
});

it("keeps launch offline if neither source is installed and discards an incomplete first checkout", async () => {
  await fixture(async (root, signal) => {
    const runGit = vi.fn(async (args: string[]) => {
      if (args.includes("rev-parse")) {
        return args[1].includes(path.join("managed", "lpc"))
          ? pixelAssetSources.lpc.revision
          : pixelAssetSources.pixel_fx.revision;
      }
      return "";
    });
    const options = { root, signal, runGit, environment: {} };
    expect(await installPixelAssetSources({ ...options, installIfMissing: false })).toMatchObject([
      { status: "skipped" },
      { status: "skipped" },
    ]);
    expect(runGit).not.toHaveBeenCalled();
    expect(await installPixelAssetSources({ ...options, installIfMissing: true })).toMatchObject([
      { status: "unavailable" },
      { status: "unavailable" },
    ]);
    for (const source of Object.values(pixelAssetSources)) {
      expect(installedPixelAssetSource(source, root)).toBeUndefined();
      expect(await readdir(managedPixelAssetDirectory(source, root))).toEqual([]);
    }
  });
});

it("cleans staged files before reporting cancellation", async () => {
  await fixture(async (root) => {
    const controller = new AbortController();
    const external = path.join(root, "external");
    await sourceFiles(pixelAssetSources.pixel_fx, external);
    const runGit = vi.fn(async (args: string[]) => {
      if (args.includes("fetch")) {
        await sourceFiles(pixelAssetSources.lpc, args[1]);
        controller.abort(Error("cancelled fixture"));
      }
      return "";
    });
    await expect(
      installPixelAssetSources({
        root,
        signal: controller.signal,
        runGit,
        environment: { KITEVA_PIXELFX_ROOT: external },
        installIfMissing: true,
      }),
    ).rejects.toThrow("cancelled fixture");
    expect(installedPixelAssetSource(pixelAssetSources.lpc, root)).toBeUndefined();
    expect(await readdir(managedPixelAssetDirectory(pixelAssetSources.lpc, root))).toEqual([]);
  });
});
