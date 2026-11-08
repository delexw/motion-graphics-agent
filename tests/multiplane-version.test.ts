import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { expect, it } from "vitest";
import { readMultiplaneVersion } from "../src/server/rendering/multiplane/version";

it("reads upgraded installed metadata instead of a frozen source version", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "renderer-version-"));
  const file = path.join(folder, "package.json");
  try {
    for (const version of ["0.3.13", "0.3.99"]) {
      await writeFile(file, JSON.stringify({ name: "multiplane", version }));
      expect(readMultiplaneVersion(file)).toBe(version);
    }
    await writeFile(file, JSON.stringify({ name: "another-package", version: "0.3.99" }));
    expect(() => readMultiplaneVersion(file)).toThrow();
    await writeFile(file, "invalid JSON");
    expect(() => readMultiplaneVersion(file)).toThrow();
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
