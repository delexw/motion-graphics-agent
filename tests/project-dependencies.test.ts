import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const metadata = vi.hoisted(() => ({ prefix: "", version: "2.0.0" }));
vi.mock("node:child_process", async (original) => {
  const actual = await original<typeof import("node:child_process")>();
  const execute = vi.fn();
  Object.assign(execute, {
    [Symbol.for("nodejs.util.promisify.custom")]: async () => ({
      stdout: JSON.stringify(metadata),
      stderr: "",
    }),
  });
  return { ...actual, execFile: execute };
});
vi.mock("../src/server/technology/availability", () => ({
  technologyEnvironment: () => ({
    inspect: async (id: string) => ({
      status: "available",
      package: (
        {
          gsap: "gsap",
          three_js: "three",
          chroma_js: "chroma-js",
          rough_js: "roughjs",
          paper_js: "paper",
          motion: "motion",
        } as Record<string, string>
      )[id],
    }),
  }),
}));
import {
  setupProjectDependencies,
  selectProjectTechnologies,
  validateProjectDependencySelection,
} from "../src/server/technology/project-dependencies";
import { RequestSchema } from "../src/shared/contracts";
const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});
async function fixture(
  type: "page" | "video" = "page",
  renderer: "hyperframes" | "multiplane" = "hyperframes",
) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "project-dependencies-"));
  folders.push(workspace);
  await mkdir(path.join(workspace, "vendor"));
  await setupProjectDependencies(
    workspace,
    RequestSchema.parse({ instructions: "An example", outputType: type, renderer }),
  );
  return workspace;
}
it.each(["hyperframes", "multiplane"] as const)(
  "bootstraps only fixed runtime packages for %s",
  async (renderer) => {
    const workspace = await fixture("video", renderer);
    const pkg = JSON.parse(await readFile(path.join(workspace, "package.json"), "utf8"));
    expect(Object.keys(pkg.dependencies).sort()).toEqual(
      renderer === "hyperframes" ? ["gsap", "hyperframes"] : [],
    );
    await expect(readFile(path.join(workspace, "vendor/three.module.js"))).rejects.toThrow();
    await expect(readFile(path.join(workspace, "vendor/pica.min.js"))).rejects.toThrow();
  },
);
it("writes six selected npm packages and two Python distributions to their actual manifests", async () => {
  const workspace = await fixture();
  const packages = {
    gsap: "gsap",
    three_js: "three",
    chroma_js: "chroma-js",
    rough_js: "roughjs",
    paper_js: "paper",
    motion: "motion",
  };
  for (const name of Object.values(packages)) {
    const root = path.join(workspace, "runtime/node_modules", name);
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, "package.json"), JSON.stringify({ name, version: "1.0.0" }));
  }
  await mkdir(path.join(workspace, "python/bin"), { recursive: true });
  metadata.prefix = path.join(workspace, "python");
  const selected = await selectProjectTechnologies(
    workspace,
    [
      ...Object.keys(packages).map((id) => ({
        id,
        purpose: "Required visual layer",
        runtimeDirectory: "runtime",
      })),
      ...["pillow", "numpy"].map((id) => ({
        id,
        purpose: "Asset processing",
        runtimeDirectory: ".",
        pythonExecutable: "python/bin/python",
      })),
      { id: "svg", purpose: "Native icons", runtimeDirectory: "." },
    ],
    new AbortController().signal,
  );
  expect(selected.selected).toHaveLength(9);
  expect(
    JSON.parse(await readFile(path.join(workspace, "package.json"), "utf8")).dependencies,
  ).toEqual(Object.fromEntries(Object.values(packages).map((name) => [name, "1.0.0"])));
  expect(await readFile(path.join(workspace, "requirements.txt"), "utf8")).toBe(
    "Pillow==2.0.0\nnumpy==2.0.0\n",
  );
  await validateProjectDependencySelection(workspace);
  await setupProjectDependencies(
    workspace,
    RequestSchema.parse({ instructions: "Example project", outputType: "page" }),
  );
  await validateProjectDependencySelection(workspace);
  await selectProjectTechnologies(workspace, [], new AbortController().signal);
  expect(
    JSON.parse(await readFile(path.join(workspace, "package.json"), "utf8")).dependencies,
  ).toEqual({});
  expect(await readFile(path.join(workspace, "requirements.txt"), "utf8")).toBe("");
});
it("requires final declaration for new projects and rejects manifest drift", async () => {
  const workspace = await fixture();
  await expect(validateProjectDependencySelection(workspace)).rejects.toThrow(
    "select_project_technologies",
  );
  await selectProjectTechnologies(workspace, [], new AbortController().signal);
  await writeFile(path.join(workspace, "package.json"), '{"dependencies":{"three":"1.0.0"}}');
  await expect(validateProjectDependencySelection(workspace)).rejects.toThrow("package.json");
});
it("rejects duplicate, unknown and out-of-project choices without changing package dependencies", async () => {
  const workspace = await fixture();
  const before = await readFile(path.join(workspace, "package.json"), "utf8");
  for (const selections of [
    [{ id: "unknown", purpose: "Example", runtimeDirectory: "." }],
    [{ id: "svg", purpose: "Example", runtimeDirectory: "../" }],
    [
      { id: "svg", purpose: "Example", runtimeDirectory: "." },
      { id: "svg", purpose: "Duplicate", runtimeDirectory: "." },
    ],
  ])
    await expect(
      selectProjectTechnologies(workspace, selections, new AbortController().signal),
    ).rejects.toThrow();
  expect(await readFile(path.join(workspace, "package.json"), "utf8")).toBe(before);
});
