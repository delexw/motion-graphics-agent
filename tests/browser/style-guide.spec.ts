import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect } from "@playwright/test";
import { loadCatalog } from "../../src/server/catalog/catalog";
import { styleGuideSectionNames } from "../../src/shared/agents/schemas/combined-style-guide";
import { createBrowserFixtureServer } from "../fixtures/browser-fixture-server";
import { test } from "../fixtures/playwright-test";

test("opens the complete style guide without showing suggested combinations", async ({ page }) => {
  const { styles } = await loadCatalog();
  const pixel = styles.find((style) => style.id === "style-166")!;
  const other = styles.find((style) => style.id === "style-057")!;
  expect(pixel.suggested_combinations?.selection_guidance).toBeTruthy();
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "style-guide-"));
  const server = await createBrowserFixtureServer({ cacheDir });
  try {
    await server.listen();
    await page.route("**/api/**", (route) => {
      const pathname = new URL(route.request().url()).pathname;
      const fixtures: Record<string, unknown> = {
        "/api/styles": { styles: [pixel, other] },
        "/api/styles/style-166": pixel,
        "/api/setup": { motionCount: 55 },
        "/api/runs": [],
        "/api/motions": [],
        "/api/examples": { examples: [] },
        "/api/room/library": [],
        "/api/room/wallpapers": [],
      };
      return route.fulfill({ json: fixtures[pathname] ?? {} });
    });
    await page.goto(new URL("/styles", server.resolvedUrls!.local[0]).href);
    await page.getByRole("textbox", { name: "Search Motion Graphics" }).fill("2.5D Pixel Art");
    await expect(page.getByText("2.5D Pixel Art", { exact: true })).toBeVisible();
    await expect(page.getByText("Pixel Art", { exact: true })).toHaveCount(0);
    await page.getByText("2.5D Pixel Art", { exact: true }).click();
    const dialog = page.getByRole("dialog");
    const palette = dialog.locator(".swatches");
    await expect(palette.getByText("#FFD27A", { exact: true })).toBeVisible();
    await expect(palette.getByText("#5FC3EE", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Style guide" }).click();
    const headings = dialog.getByRole("heading", { level: 4 });
    await expect(headings).toHaveText([...styleGuideSectionNames]);
    const summary = pixel.executable_prompt_template.split("\n", 1)[0].slice(2);
    await expect(dialog.getByText(summary, { exact: true })).toBeVisible();
    const guideText = await dialog.locator("p, h4").allTextContents();
    expect(guideText).toContain(summary);
    expect(guideText.indexOf(summary)).toBeLessThan(guideText.indexOf("Visual identity"));
    await expect(dialog.getByText("Original executable prompt")).toHaveCount(0);
    await expect(dialog.getByText(/Example palette\. blue-black ambient #0B1520/)).toBeVisible();
    await dialog.getByRole("button", { name: "Recommended stack" }).click();
    for (const width of [1200, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await expect(dialog.getByRole("heading", { name: "Project choices" })).toBeVisible();
      await expect(dialog.getByRole("heading", { name: "Suggested combinations" })).toHaveCount(0);
      await expect(dialog.getByRole("button", { name: "Recommended stack" })).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Motion references" })).toBeVisible();
      await expect(dialog.getByRole("link", { name: "Aseprite", exact: true })).toBeVisible();
      await expect(dialog.getByRole("link", { name: "PixiJS", exact: true })).toBeVisible();
      await expect(dialog.getByText(pixel.tech.implementation, { exact: true })).toBeVisible();
      expect(
        await headings.evaluateAll((nodes) =>
          nodes.every((node) => node.getBoundingClientRect().right <= window.innerWidth),
        ),
      ).toBe(true);
    }
  } finally {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});
