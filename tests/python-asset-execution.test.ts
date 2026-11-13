import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const execution = vi.hoisted(() => ({ used: true, fail: false, write: true }));
vi.mock("../src/server/runtime/process", () => ({
  isolatedCommand: vi.fn(async (_python: string, args: string[], workspace: string) => {
    if (execution.fail) throw Error("Python failed");
    const packages = JSON.parse(args[4]) as string[];
    if (execution.write)
      await writeFile(path.join(workspace, "assets/tile.png"), "new local fixture pixels");
    await writeFile(
      args[3],
      JSON.stringify({
        prefix: path.join(workspace, ".venv"),
        records: packages.map((pkg) => ({ package: pkg, version: "1.0.0", used: execution.used })),
      }),
    );
  }),
}));
import { runPythonAsset, technologyExecutionFile } from "../src/server/technology/python-execution";
import { projectTechnologyMonitor } from "../src/server/technology/project-monitor";
const folders: string[] = [];
afterEach(async () => {
  execution.used = true;
  execution.fail = false;
  execution.write = true;
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});
async function fixture() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "python-asset-"));
  folders.push(workspace);
  for (const folder of [".venv/bin", "scripts", "assets"])
    await mkdir(path.join(workspace, folder), { recursive: true });
  await writeFile(path.join(workspace, "scripts/asset.py"), "# Local fixture, never executed\n");
  await writeFile(path.join(workspace, ".venv/bin/python"), "");
  await writeFile(
    path.join(workspace, "PROJECT_TECHNOLOGIES.json"),
    JSON.stringify({
      updatedAt: "2026-01-01T00:00:00Z",
      fixedNpm: {},
      selected: [
        {
          id: "numpy",
          name: "NumPy",
          purpose: "Fixture pixels",
          runtimeDirectory: ".",
          pythonExecutable: ".venv/bin/python",
          ecosystem: "python",
          package: "numpy",
          version: "1.0.0",
        },
      ],
    }),
  );
  return workspace;
}
const request = {
  script: "scripts/asset.py",
  outputFiles: ["assets/tile.png"],
  technologyIds: ["numpy"],
};
it("records successful imported distributions and actual asset hashes, then invalidates changed outputs", async () => {
  const workspace = await fixture();
  const result = await runPythonAsset(workspace, request, new AbortController().signal);
  expect(result.technologies).toEqual([{ id: "numpy", package: "numpy", version: "1.0.0" }]);
  expect(result.outputs[0].sha256).toHaveLength(64);
  expect(
    JSON.parse(await readFile(path.join(workspace, technologyExecutionFile), "utf8")),
  ).toHaveLength(1);
  let report = await projectTechnologyMonitor({ id: "job", workspace });
  expect(report.entries.find((row) => row.id === "numpy")?.usageEvidence).toContain(
    "Python execution verified",
  );
  await writeFile(path.join(workspace, "assets/tile.png"), "changed");
  report = await projectTechnologyMonitor({ id: "job", workspace });
  expect(report.entries.find((row) => row.id === "numpy")?.usageEvidence).toEqual([]);
});
it("rejects unselected dependencies and path traversal before execution", async () => {
  const workspace = await fixture();
  await expect(
    runPythonAsset(
      workspace,
      { ...request, technologyIds: ["pillow"] },
      new AbortController().signal,
    ),
  ).rejects.toThrow("finalized");
  await expect(
    runPythonAsset(
      workspace,
      { ...request, script: "../outside.py" },
      new AbortController().signal,
    ),
  ).rejects.toThrow("project-relative");
});
it.each(["used", "fail"])("does not persist success when %s evidence fails", async (condition) => {
  const workspace = await fixture();
  if (condition === "used") execution.used = false;
  else execution.fail = true;
  await expect(runPythonAsset(workspace, request, new AbortController().signal)).rejects.toThrow();
  await expect(readFile(path.join(workspace, technologyExecutionFile))).rejects.toMatchObject({
    code: "ENOENT",
  });
});
