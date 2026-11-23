import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect } from "@playwright/test";
import { test } from "../fixtures/playwright-test";
import { createBrowserFixtureServer } from "../fixtures/browser-fixture-server";

test("produces identical browser pixels after forward, backward and fresh direct seeks", async ({
  page,
}) => {
  test.setTimeout(60000);
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "visual-stage-"));
  const server = await createBrowserFixtureServer({
    cacheDir,

    logLevel: "silent",
  });
  await server.listen();
  try {
    await page.setViewportSize({ width: 320, height: 220 });
    const url = `${server.resolvedUrls!.local[0]}tests/fixtures/multiplane/visual-stage.html`;
    await page.goto(url);
    await page.waitForFunction("typeof window.seekVisualStage === 'function'");
    const seek = (time: number) =>
      page.evaluate(
        (time) =>
          (
            window as unknown as {
              seekVisualStage: (t: number) => { canvas: number; caption: number };
            }
          ).seekVisualStage(time),
        time,
      );
    expect(await seek(0)).toEqual({ canvas: 1, caption: 1 });
    expect(await seek(0)).toEqual({ canvas: 1, caption: 1 });
    await seek(0.5);
    const original = await page.screenshot();
    expect(await seek(2)).toEqual({ canvas: 3, caption: 2 });
    await seek(0.5);
    expect(Buffer.from(await page.screenshot()).equals(Buffer.from(original))).toBe(true);
    await page.goto(url);
    await page.waitForFunction("typeof window.seekVisualStage === 'function'");
    expect(await seek(0.5)).toEqual({ canvas: 1, caption: 1 });
    expect(Buffer.from(await page.screenshot()).equals(Buffer.from(original))).toBe(true);
  } finally {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});
