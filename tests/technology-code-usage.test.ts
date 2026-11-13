import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { technologyCodeUsage } from "../src/server/technology/evidence/source-code";
import { collectTechnologyUsage } from "../src/server/technology/evidence/registry";
import type { TechnologyEvidenceContext } from "../src/server/technology/evidence/contracts";
import { ProjectTechnologies } from "../src/client/governance/project-technologies";

function fixture(
  source: string,
  options: { file?: string; loaded?: boolean; current?: boolean } = {},
): TechnologyEvidenceContext {
  const file = options.file ?? "artifacts/scripts/main.js";
  return {
    job: { id: "example-job", workspace: "/example" },
    id: "gsap",
    moduleFiles: ["artifacts/technology-gsap-fixture/index.js"],
    browserLoaded: options.loaded ?? true,
    observation: {
      observedAt: "2026-01-01T00:00:00Z",
      resources: { [file]: createHash("sha256").update(source).digest("hex") },
      errors: [],
    },
    executions: [],
    observationUnchanged: vi.fn(async () => options.current ?? true),
    readFile: vi.fn(async () => source),
    hashFile: vi.fn(async () => ""),
  };
}

it("attributes actual API calls through namespace/default imports and constant aliases", async () => {
  const context = fixture(`import {technology as lib} from '../technology-gsap-fixture/index.js';
const tween = lib.gsap || lib.default;
const {to: move} = tween;
move('.shape', {x: 10});
const timeline = tween.timeline();
timeline.to('.shape', {y: 5});`);
  const calls = await technologyCodeUsage(context);
  expect(calls.map((call) => call.expression)).toEqual(["move", "tween.timeline", "timeline.to"]);
  expect(calls[0]).toMatchObject({ file: "artifacts/scripts/main.js", line: 4, column: 1 });
  const codeUsage = calls;
  expect(await collectTechnologyUsage({ ...context, codeUsage })).toEqual([
    "Code API usage found",
    "Browser loaded",
  ]);
});

it("handles optional API calls and bindings whose initializer path has no node", async () => {
  const context = fixture(`import {technology as lib} from '../technology-gsap-fixture/index.js';
let unused;
unused?.to?.('.shape', {});
lib?.gsap?.to?.('.shape', {x: 10});`);
  expect((await technologyCodeUsage(context)).map((call) => call.expression)).toEqual([
    "lib?.gsap?.to",
  ]);
});

it.each([
  ["import-only", `import {technology as lib} from '../technology-gsap-fixture/index.js';`],
  ["comments and strings", `// gsap.to('.shape', {});\nconst text="gsap.to('.shape', {})";`],
  ["version read", `console.log(gsap.version);`],
  ["shadowed parameter", `function draw(gsap) { gsap.to('.shape', {}); }`],
  ["shadowed local", `const gsap={to(){}};gsap.to('.shape', {});`],
  [
    "reassigned import alias",
    `import {technology as lib} from '../technology-gsap-fixture/index.js'; let gsap=lib; gsap={to(){}}; gsap.to('.shape', {});`,
  ],
  ["unrelated module", `import gsap from '../other/index.js'; gsap.to('.shape', {});`],
  ["vendor implementation", `gsap.to('.shape', {});`, "artifacts/vendor/library.js"],
  ["prepared bundle", `gsap.to('.shape', {});`, "artifacts/technology-gsap-fixture/index.js"],
  ["malformed source", `gsap.to(`],
])("does not count %s as authored package usage", async (_, source, file = undefined) => {
  expect(await technologyCodeUsage(fixture(source, { file }))).toEqual([]);
});

it("counts loaded known globals but not unknown or locally shadowed window globals", async () => {
  const source = `gsap.to('.shape', {}); window.gsap.timeline();
function draw(window){window.gsap.to('.shape', {});}`;
  expect((await technologyCodeUsage(fixture(source))).map((call) => call.expression)).toEqual([
    "gsap.to",
    "window.gsap.timeline",
  ]);
  expect(await technologyCodeUsage(fixture(source, { loaded: false }))).toEqual([]);
});

it("reports inline HTML source locations and ignores non-JavaScript script data", async () => {
  const source = `<!doctype html>\n<script type="application/json">{"text":"gsap.to()"}</script>\n<script>gsap.to('.shape', {});</script>`;
  expect(await technologyCodeUsage(fixture(source, { file: "artifacts/index.html" }))).toEqual([
    { file: "artifacts/index.html", line: 3, column: 9, expression: "gsap.to" },
  ]);
});

it("keeps static source calls distinct from runtime execution, even in an unexecuted branch", async () => {
  expect((await technologyCodeUsage(fixture(`if(false) gsap.to('.shape', {});`))).length).toBe(1);
});

it("does not reuse evidence after source changes and does not read files for stale observations", async () => {
  const context = fixture(`gsap.to('.shape', {});`, { current: false });
  expect(await technologyCodeUsage(context)).toEqual([]);
  expect(context.readFile).not.toHaveBeenCalled();
});

it("shows code locations separately from neutral loading/version badges", () => {
  const html = renderToStaticMarkup(
    createElement(ProjectTechnologies, {
      jobs: [
        {
          jobId: "example-job",
          updatedAt: "2026-01-01",
          entries: [
            {
              id: "gsap",
              name: "GSAP",
              selected: true,
              prepared: true,
              browserLoaded: true,
              usageEvidence: ["Browser loaded", "Runtime version observed", "Code API usage found"],
              codeUsage: [{ file: "artifacts/main.js", line: 4, column: 1, expression: "gsap.to" }],
            },
          ],
        },
      ],
    }),
  );
  expect(html).toContain("Code locations");
  expect(html).toContain("artifacts/main.js");
  expect(html).toContain("gsap.to");
  expect(html).toContain("not proof that those branches executed");
  expect(html).not.toContain("ant-tag-green");
  expect(html).toContain("ant-tag-blue");
});

it("does not mark loaded-only npm packages as code-verified", () => {
  const html = renderToStaticMarkup(
    createElement(ProjectTechnologies, {
      jobs: [
        {
          jobId: "example-job",
          updatedAt: "2026-01-01",
          entries: [
            {
              id: "gsap",
              name: "GSAP",
              selected: true,
              ecosystem: "npm",
              prepared: true,
              browserLoaded: true,
              usageEvidence: ["Browser loaded"],
              codeUsage: [],
            },
          ],
        },
      ],
    }),
  );
  expect(html).toContain("Code usage unverified");
  expect(html).not.toContain("Code API usage found");
  expect(html).not.toContain("ant-tag-green");
});
