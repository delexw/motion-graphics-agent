import { expect } from "@playwright/test";
import { test } from "../fixtures/playwright-test";
import { createBrowserFixtureServer } from "../fixtures/browser-fixture-server";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { appRoot } from "../../src/server/runtime/config";
import { buildApplicationDemoRoutePrompt } from "../../src/server/domains/video/route-prompts/application-demo";
import { applicationDemoCapturePrompt } from "../../src/server/domains/video/route-prompts/application-demo/capture";

test("parses and renders all stage workflow diagrams with Mermaid", async ({ page }) => {
  test.setTimeout(60000);
  const prompts = [
    buildApplicationDemoRoutePrompt("hyperframes", "planning"),
    applicationDemoCapturePrompt,
    buildApplicationDemoRoutePrompt("multiplane", "assembly"),
    await readFile(path.join(appRoot, "docs/chapter-capture-timing.md"), "utf8"),
    await readFile(path.join(appRoot, "docs/build-routes-and-creative-approaches.md"), "utf8"),
  ];
  const diagrams = prompts.map((prompt) => {
    const matches = [...prompt.matchAll(/```mermaid\n([\s\S]*?)```/g)];
    expect(matches).toHaveLength(1);
    return matches[0][1];
  });
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "prompt-mermaid-"));
  const server = await createBrowserFixtureServer({
    cacheDir,

    plugins: [
      {
        name: "prompt-diagrams",
        configureServer(server) {
          server.middlewares.use(async (request, response, next) => {
            if (request.url !== "/prompt-diagrams") return next();
            response.setHeader("Content-Type", "text/html");
            response.end(
              await server.transformIndexHtml(
                request.url,
                `<!doctype html><body><script type="module">
import mermaid from 'mermaid';
mermaid.initialize({startOnLoad:false});
try {
  const diagrams = ${JSON.stringify(diagrams)};
  for (const [index, source] of diagrams.entries()) {
    await mermaid.parse(source);
    const {svg} = await mermaid.render('workflow'+index, source);
    const panel=document.createElement('section'); panel.innerHTML=svg; document.body.append(panel);
  }
  window.diagramResult={count:document.querySelectorAll('section svg').length};
} catch(error) { window.diagramResult={error:String(error)}; }
</script>`,
              ),
            );
          });
        },
      },
    ],
  });
  try {
    await server.listen();
    await page.goto(server.resolvedUrls!.local[0] + "prompt-diagrams", { waitUntil: "commit" });
    await page.waitForFunction(
      () => Boolean((window as unknown as { diagramResult?: unknown }).diagramResult),
      undefined,
      { timeout: 30_000 },
    );
    expect(
      await page.evaluate(() => (window as unknown as { diagramResult: unknown }).diagramResult),
    ).toEqual({ count: diagrams.length });
  } finally {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});
