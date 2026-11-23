import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, writeFile, symlink, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const fixture = vi.hoisted(() => ({ root: "" }));

vi.mock("../../src/server/runtime/process", () => ({ command: vi.fn() }));
vi.mock("../../src/server/runtime/config", () => ({
  appRoot: path.resolve("."),
  get dataRoot() {
    return fixture.root;
  },
}));
vi.mock("../../src/server/audio/providers/kokoro", () => ({ kokoroSpeechProvider: {} }));
vi.mock("../../src/server/audio/providers/pocket-tts/chinese", () => ({
  pocketZhModelDirectory: "models",
  pocketZhSpeechProvider: {},
  pocketZhVoiceReference: vi.fn(),
}));
import { command } from "../../src/server/runtime/process";

beforeEach(async () => {
  fixture.root = await mkdtemp(path.join(os.tmpdir(), "speech-setup-test-"));
  vi.resetModules();
  vi.mocked(command).mockReset().mockRejectedValue(Error("stop after venv command"));
});
afterEach(() => rm(fixture.root, { recursive: true, force: true }));

it.each(["missing", "working", "broken"])(
  "only clears an existing broken Python environment (%s)",
  async (state) => {
    const environment = path.join(fixture.root, "pocket-tts-zh-venv");
    const python = path.join(
      environment,
      process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
    );
    if (state !== "missing") {
      await mkdir(path.dirname(python), { recursive: true });
      if (state === "working") await writeFile(python, "existing interpreter");
      else await symlink(path.join(fixture.root, "removed-python"), python);
    }
    await expect(import("../../scripts/setup-pocket-tts-zh")).rejects.toThrow(
      "stop after venv command",
    );
    expect(vi.mocked(command).mock.calls[0][1]).toEqual([
      "-m",
      "venv",
      ...(state === "broken" ? ["--clear"] : []),
      environment,
    ]);
  },
);
