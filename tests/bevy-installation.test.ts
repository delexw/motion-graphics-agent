import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
  managedBevyRuntime,
  refreshBevy,
} from "../src/server/agents/capabilities/bevy/installation";
import { command } from "../src/server/runtime/process";
import { nativeExecutable } from "../src/server/runtime/platform";

vi.mock("../src/server/runtime/process", () => ({ command: vi.fn() }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.mocked(command).mockReset();
});

it("provisions one verified Bevy bundle, keeps older releases and falls back on a failed update", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "managed-bevy-"));
  try {
    const bin = path.join(root, "bin");
    await mkdir(bin);
    await writeFile(path.join(bin, nativeExecutable("cargo")), "fixture", { mode: 0o700 });
    vi.stubEnv("PATH", bin);
    const release = vi.fn(async () => Response.json({ crate: { max_stable_version: "1.2.3" } }));
    vi.stubGlobal("fetch", release);
    vi.mocked(command).mockResolvedValue("");
    const update = () => refreshBevy({ root, signal: new AbortController().signal });

    const results = await Promise.all([update(), update()]);
    expect(results.map(({ status }) => status).sort()).toEqual(["current", "installed"]);
    const saved = managedBevyRuntime(root)!;
    expect(saved.version).toBe("1.2.3");
    expect(await readFile(path.join(saved.directory, "Cargo.toml"), "utf8")).toContain(
      'bevy = "=1.2.3"',
    );
    expect(await readFile(saved.config, "utf8")).toContain("replace-with");
    expect(vi.mocked(command).mock.calls.map(([, args]) => args[0])).toEqual([
      "generate-lockfile",
      "vendor",
      "metadata",
      "metadata",
    ]);

    release.mockResolvedValueOnce(Response.json({ crate: { max_stable_version: "1.2.4" } }));
    vi.mocked(command).mockRejectedValueOnce(Error("Public registry temporarily unavailable"));
    expect(await update()).toMatchObject({ status: "fallback", version: "1.2.3" });
    expect(managedBevyRuntime(root)).toEqual(saved);

    release.mockResolvedValueOnce(Response.json({ crate: { max_stable_version: "1.2.4" } }));
    expect(await update()).toEqual({ status: "installed", version: "1.2.4" });
    expect(managedBevyRuntime(root)?.directory).not.toBe(saved.directory);
    expect(await readFile(saved.config, "utf8")).toContain("replace-with");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("cancels without starting public release lookup or package setup", async () => {
  const controller = new AbortController();
  controller.abort(Error("Cancelled"));
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(refreshBevy({ signal: controller.signal })).rejects.toThrow("Cancelled");
  expect(fetch).not.toHaveBeenCalled();
  expect(command).not.toHaveBeenCalled();
});
