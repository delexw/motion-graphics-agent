import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createBrowserFixtureServer } from "../fixtures/browser-fixture-server";
import { expect } from "@playwright/test";
import { test } from "../fixtures/playwright-test";
import { appRoot } from "../../src/server/runtime/config";

test("plays replacement stack clips with identical filenames and respects reduced motion", async ({
  page,
}) => {
  test.setTimeout(60000);
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "stack-playback-"));
  const server = await createBrowserFixtureServer({
    cacheDir,
    plugins: [
      {
        name: "stack-playback-fixture",
        configureServer(server) {
          server.middlewares.use(async (request, response, next) => {
            if (request.url !== "/stack-playback-test") return next();
            const html = await server.transformIndexHtml(
              request.url,
              `<style>.project-preview-frame { width: 640px; height: 400px; } video { width: 640px; height: 360px; }</style><div id="root"></div><script type="module">
          import { createElement } from 'react';
          import { createRoot } from 'react-dom/client';
          import { ProjectMediaStack } from '/src/client/components/project-media-stack.tsx';
          import { RequestSchema } from '/src/shared/contracts.ts';
          const project = {
            id: 'example-project', createdAt: '2026-01-01', phase: 'ready',
            request: RequestSchema.parse({ instructions: 'An original story' }), candidates: [],
            jobs: ['old', 'new'].map((id, index) => ({
              id, kind: 'full', phase: 'ready', createdAt: '2026-01-0' + (index + 2),
              runId: 'example-project', candidateId: id, outputType: 'video', duration: 90,
              model: 'example-model', workspace: '/tmp/example',
              video: 'renders/full.mp4', cardClip: location.hash === '#fallback' ? undefined : 'renders/card-3s.webm'
            }))
          };
          createRoot(document.getElementById('root')).render(
            createElement(ProjectMediaStack, { project, onOpen() { document.getElementById('root').dataset.opened = 'true'; } })
          );
        </script>`,
            );
            response.setHeader("Content-Type", "text/html");
            response.end(html);
          });
        },
      },
    ],
  });
  const clip = await readFile(path.join(appRoot, "assets/style-previews/style-001.webm"));
  try {
    await server.listen();
    const errors: string[] = [];
    page.on("pageerror", (error) =>
      errors.push(error instanceof Error ? error.message : String(error)),
    );
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.route("**/*", (route) => {
      if (route.request().url().includes("/api/artifacts/")) {
        return route.fulfill({ status: 200, contentType: "video/webm", body: clip });
      } else return route.fallback();
    });
    await page.goto(`${server.resolvedUrls!.local[0]}stack-playback-test`);
    await page.waitForSelector("video", { state: "attached", timeout: 10000 }).catch(async () => {
      throw new Error(
        `Stack did not mount: ${errors.join("; ")}; ${await page.evaluate(() => document.body.innerText)}`,
      );
    });
    for (const [index, id] of ["new", "old", "new"].entries()) {
      await page.waitForFunction(
        (jobId) => {
          const video = document.querySelector<HTMLVideoElement>(".project-card-clip");
          return (
            video?.currentSrc.includes(`/${jobId}/`) && !video.paused && video.currentTime > 0.1
          );
        },
        id,
        { timeout: 10000 },
      );
      if (index === 0) {
        await page.locator(".project-stack-previous").first().click();
      } else if (index === 1) await page.locator(".project-stack-next").first().click();
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await page.locator("video").first().waitFor({ state: "attached" });
    await page.waitForFunction(() => document.querySelector<HTMLVideoElement>("video")?.paused);
    expect(await page.locator("video").evaluateAll((videos) => videos.length)).toBe(1);
    expect(await page.locator(".project-card-play").evaluateAll((buttons) => buttons.length)).toBe(
      1,
    );
    await page.goto(`${server.resolvedUrls!.local[0]}stack-playback-test#fallback`);
    await page.reload();
    await page.locator(".project-card-play").first().waitFor({ state: "attached" });
    await expect(page.locator(".project-card-clip")).toHaveCount(0);
    expect(await page.locator(".project-card-play").evaluateAll((buttons) => buttons.length)).toBe(
      1,
    );
    await page.locator(".project-card-play").first().click();
    expect(
      await page
        .locator("#root")
        .first()
        .evaluate((root) => root.getAttribute("data-opened")),
    ).toBe("true");
  } finally {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});
