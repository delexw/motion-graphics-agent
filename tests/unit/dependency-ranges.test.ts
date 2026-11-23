import { readFile } from "node:fs/promises";
import { globSync } from "node:fs";
import { expect, it } from "vitest";

it("declares every Python requirement as a range up to the next major version, never an exact pin", async () => {
  const files = globSync("{src,scripts}/**/*requirements*.txt");
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const requirements = (await readFile(file, "utf8"))
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    for (const line of requirements) {
      expect(line, file).not.toMatch(/===?/);
      expect(line, file).toMatch(/>=[^,]+,<[^,]+$/);
    }
  }
});

it("declares every npm dependency as an upgradeable range, never an exact version", async () => {
  const manifest = JSON.parse(await readFile("package.json", "utf8"));
  for (const group of ["dependencies", "devDependencies", "optionalDependencies"]) {
    for (const [name, version] of Object.entries<string>(manifest[group] ?? {}))
      expect(version, `${group} ${name}`).not.toMatch(/^=?\d/);
  }
});
