import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createBrowserFixtureServer } from "../fixtures/browser-fixture-server";
import { expect } from "@playwright/test";
import { test } from "../fixtures/playwright-test";
import { loadCatalog } from "../../src/server/catalog/catalog";
import { styleMetadataMarkdown } from "../../src/shared/style-metadata";

test("copies displayed style metadata and offers selectable text when clipboard access fails", async ({
  page,
}) => {
  test.setTimeout(45000);
  const style = (await loadCatalog()).styles.find((item) => item.id === "style-007")!;
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "style-copy-"));
  const server = await createBrowserFixtureServer({
    cacheDir,

    plugins: [
      {
        name: "style-copy-fixture",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url !== "/copy") return next();
            res.setHeader("content-type", "text/html");
            res.end(
              await server.transformIndexHtml(
                req.url,
                `<div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{StyleDetailActions}from'/src/client/components/style-detail-actions.tsx';import{Dialog}from'/src/client/dialog.tsx';import'/src/client/style.css';import'/src/client/framework.css';
Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{if(window.rejectCopy)throw Error('denied');window.copiedMetadata=text;}}});
const style=${JSON.stringify(style).replaceAll("<", "\\u003c")};createRoot(document.getElementById('root')).render(React.createElement(Dialog,{title:style.name_en,onClose:()=>{},footer:React.createElement(StyleDetailActions,{style,onUse:()=>{}})},React.createElement('p',null,'Style metadata')));</script>`,
              ),
            );
          });
        },
      },
    ],
  });
  try {
    await server.listen();
    await page.goto(`${server.resolvedUrls!.local[0]}copy`);
    await page.locator('[aria-label="Copy style metadata"]').first().waitFor({ state: "attached" });
    for (const width of [1200, 390, 320]) {
      await page.setViewportSize({ width, height: 800 });
      const sizes = await page.locator(".style-detail-actions button").evaluateAll((buttons) =>
        buttons.map((button) => {
          const rect = button.getBoundingClientRect();
          return {
            height: rect.height,
            top: rect.top,
            right: rect.right,
            fontSize: getComputedStyle(button).fontSize,
          };
        }),
      );
      expect(sizes).toHaveLength(2);
      expect(sizes[0].height).toBeCloseTo(sizes[1].height, 0);
      expect(sizes[0].fontSize).toBe(sizes[1].fontSize);
      if (width === 1200) expect(sizes[0].top).toBeCloseTo(sizes[1].top, 0);
      for (const size of sizes) expect(size.right).toBeLessThanOrEqual(width);
    }
    await page.locator('[aria-label="Copy style metadata"]').first().click();
    await page.waitForFunction(
      () => document.querySelector('[aria-label="Copy style metadata"]')?.textContent === "Copied",
    );
    expect(
      await page.evaluate(() => (window as unknown as { copiedMetadata: string }).copiedMetadata),
    ).toBe(styleMetadataMarkdown(style));
    await page.evaluate(() => {
      (window as unknown as { rejectCopy: boolean }).rejectCopy = true;
    });
    await page.locator('[aria-label="Copy style metadata"]').first().click();
    await page
      .locator('[aria-label="Style metadata to copy"]')
      .first()
      .waitFor({ state: "attached" });
    expect(
      await page
        .locator('[aria-label="Style metadata to copy"]')
        .first()
        .evaluate((element) => (element as HTMLTextAreaElement).value),
    ).toBe(styleMetadataMarkdown(style));
    expect(
      await page
        .locator('[aria-label="Copy style metadata"]')
        .first()
        .evaluate((element) => element.textContent),
    ).toBe("Copy");
  } finally {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});
