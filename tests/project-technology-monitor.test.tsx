import { expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { projectTechnologyMonitor } from "../src/server/technology/project-monitor";
import { ProjectTechnologies } from "../src/client/governance/project-technologies";

it("distinguishes selected, prepared, browser-loaded and unselected technologies and invalidates changed output", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "technology-monitor-"));
  try {
    const unknown = await projectTechnologyMonitor({ id: "job", workspace });
    expect(unknown.entries.every((entry) => entry.selected === null)).toBe(true);
    const folder = path.join(workspace, "technology-three_js-fixture");
    await mkdir(folder);
    await mkdir(path.join(workspace, "diagnostics"));
    const code = "export class Mesh {}";
    const authored =
      'import * as scene from "./technology-three_js-fixture/index.js"; new scene.Mesh();';
    await writeFile(
      path.join(workspace, "index.html"),
      `<script type="module">${authored}</script>`,
    );
    await writeFile(path.join(folder, "index.js"), code);
    await writeFile(
      path.join(folder, "technology.json"),
      JSON.stringify({ id: "three_js", modulePath: "technology-three_js-fixture/index.js" }),
    );
    await writeFile(
      path.join(workspace, "PROJECT_TECHNOLOGIES.json"),
      JSON.stringify({
        updatedAt: "2026-01-01T00:00:00Z",
        fixedNpm: {},
        selected: [
          {
            id: "three_js",
            name: "Three.js",
            purpose: "Visible geometry",
            runtimeDirectory: ".",
            ecosystem: "npm",
            package: "three",
            version: "1.0.0",
          },
        ],
      }),
    );
    await writeFile(
      path.join(workspace, "diagnostics/technology-loads.json"),
      JSON.stringify({
        observedAt: "2026-01-01T00:00:01Z",
        resources: {
          "index.html": createHash("sha256")
            .update(`<script type="module">${authored}</script>`)
            .digest("hex"),
          "technology-three_js-fixture/index.js": createHash("sha256").update(code).digest("hex"),
        },
        errors: [],
      }),
    );
    const report = await projectTechnologyMonitor({ id: "job", workspace });
    expect(report.entries.find((entry) => entry.id === "three_js")).toMatchObject({
      selected: true,
      prepared: true,
      browserLoaded: true,
    });
    expect(report.entries.find((entry) => entry.id === "three_js")?.usageEvidence).toContain(
      "Code API usage found",
    );
    expect(report.entries.find((entry) => entry.id === "three_js")?.codeUsage?.[0]).toMatchObject({
      file: "index.html",
      expression: "scene.Mesh",
    });
    expect(report.entries.find((entry) => entry.id === "pillow")).toMatchObject({
      selected: false,
      browserLoaded: false,
    });
    const html = renderToStaticMarkup(<ProjectTechnologies jobs={[report]} />);
    expect(html).toContain("Project technologies");
    expect(html).toContain("Browser loaded");
    expect(html).toContain("Not selected");
    await writeFile(path.join(folder, "index.js"), "export const value = 2;");
    const changed = await projectTechnologyMonitor({ id: "job", workspace });
    expect(changed.entries.find((entry) => entry.id === "three_js")?.browserLoaded).toBe(false);
    expect(changed.entries.find((entry) => entry.id === "three_js")?.codeUsage).toEqual([]);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

it("shows unknown final selections distinctly and avoids duplicate headings when embedded", () => {
  const html = renderToStaticMarkup(
    <ProjectTechnologies
      embedded
      jobs={[
        {
          jobId: "pending",
          entries: [
            {
              id: "example",
              name: "Example",
              selected: null,
              prepared: true,
              browserLoaded: false,
            },
          ],
        },
      ]}
    />,
  );
  expect(html).toContain("Selection not recorded yet");
  expect(html).toContain("Not recorded");
  expect(html).not.toContain("<h4");
  const complete = renderToStaticMarkup(
    <ProjectTechnologies
      jobs={[{ jobId: "complete", updatedAt: "2026-01-01T00:00:00Z", entries: [] }]}
    />,
  );
  expect(complete).not.toContain("Selection not recorded yet");
});

it("separates native browser observations from installation and validates an actual renderer result", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "native-evidence-"));
  try {
    await mkdir(path.join(workspace, "diagnostics"));
    await mkdir(path.join(workspace, "renders"));
    const source = "<!doctype html><svg></svg>";
    const hash = createHash("sha256").update(source).digest("hex");
    await writeFile(path.join(workspace, "index.html"), source);
    await writeFile(path.join(workspace, "renders/full.mp4"), "local mock video fixture");
    await writeFile(
      path.join(workspace, "PROJECT_TECHNOLOGIES.json"),
      JSON.stringify({
        updatedAt: "2026-01-01T00:00:00Z",
        fixedNpm: { hyperframes: "1.0.0" },
        selected: ["html_css", "svg", "webgl"].map((id) => ({
          id,
          name: id,
          purpose: "Fixture",
          runtimeDirectory: ".",
          ecosystem: "native",
        })),
      }),
    );
    await writeFile(
      path.join(workspace, "diagnostics/technology-loads.json"),
      JSON.stringify({
        observedAt: new Date().toISOString(),
        resources: { "index.html": hash },
        errors: [],
        native: { html_css: true, svg: true, webgl: true },
      }),
    );
    await writeFile(
      path.join(workspace, "renders/validation.json"),
      JSON.stringify({
        verifiedAt: new Date().toISOString(),
        production: { pipeline: "HyperFrames", sourceFile: "index.html" },
        probe: { streams: [{ codec_type: "video", width: 1920, height: 1080 }] },
      }),
    );
    const report = await projectTechnologyMonitor({
      id: "job",
      workspace,
      phase: "ready",
      outputType: "video",
      video: "renders/full.mp4",
    });
    expect(report.entries.find((row) => row.id === "html_css")).toMatchObject({
      dependencyApplicable: false,
      usageEvidence: ["HTML/CSS observed"],
    });
    expect(report.entries.find((row) => row.id === "svg")?.usageEvidence).toEqual([
      "SVG elements observed",
    ]);
    expect(report.entries.find((row) => row.id === "webgl")?.usageEvidence).toEqual([
      "WebGL context created",
    ]);
    expect(report.entries.find((row) => row.id === "hyperframes")?.usageEvidence).toEqual([
      "Render validated",
    ]);
    for (const pipeline of ["hyperframes", "HYPERFRAMES"]) {
      await writeFile(
        path.join(workspace, "renders/validation.json"),
        JSON.stringify({
          verifiedAt: new Date().toISOString(),
          production: { pipeline, sourceFile: "index.html" },
          probe: { streams: [{ codec_type: "video", width: 1920, height: 1080 }] },
        }),
      );
      const variant = await projectTechnologyMonitor({
        id: "job",
        workspace,
        phase: "ready",
        outputType: "video",
        video: "renders/full.mp4",
      });
      expect(variant.entries.find((row) => row.id === "hyperframes")?.usageEvidence).toContain(
        "Render validated",
      );
    }

    await writeFile(path.join(workspace, "index.html"), "Changed source");
    const changed = await projectTechnologyMonitor({ id: "job", workspace });
    expect(changed.entries.find((row) => row.id === "svg")?.usageEvidence).toEqual([]);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
