import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createBrowserFixtureServer } from "../fixtures/browser-fixture-server";
import { expect, type Locator } from "@playwright/test";
import { test } from "../fixtures/playwright-test";

test("opens Downloads with one preset menu and keeps one job per preset", async ({ page }) => {
  test.setTimeout(60000);
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "project-download-"));
  let available = true;
  let compactStatus = { status: "idle" } as {
    status: string;
    percent?: number;
    bytes?: number;
    originalBytes?: number;
  };
  let starts = 0;
  let limitedStarts = 0;
  const server = await createBrowserFixtureServer({
    cacheDir,

    plugins: [
      {
        name: "download-fixture",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url === "/api/projects/run/job/compact-video?preset=10mb") {
              if (req.method === "POST") limitedStarts += 1;
              res.setHeader("content-type", "application/json");
              res.end(
                JSON.stringify(
                  limitedStarts
                    ? { status: "ready", bytes: 10, originalBytes: 100 }
                    : { status: "idle" },
                ),
              );
              return;
            }
            if (req.url === "/api/projects/run/job/compact-video/file?preset=10mb") {
              res.setHeader("Content-Type", "video/mp4");
              res.setHeader("Content-Disposition", 'attachment; filename="compact-10mb.mp4"');
              res.end("local size-limited fixture");
              return;
            }
            if (req.url === "/api/projects/run/job/compact-video") {
              if (req.method === "POST") {
                starts += 1;
                compactStatus = { status: "compressing", percent: 37 };
              }
              res.setHeader("content-type", "application/json");
              res.end(JSON.stringify(compactStatus));
              return;
            }
            if (req.url === "/api/projects/run/job/compact-video/file") {
              res.setHeader("Content-Type", "video/mp4");
              res.setHeader("Content-Disposition", 'attachment; filename="compact.mp4"');
              res.end("local compact video fixture");
              return;
            }
            if (req.url === "/api/projects/run/job/availability") {
              res.setHeader("content-type", "application/json");
              res.end(JSON.stringify({ available }));
              return;
            }
            if (req.url === "/api/projects/run/job") {
              res.setHeader("Content-Type", "application/zip");
              res.end("local archive fixture");
              return;
            }
            if (req.url !== "/download-test") return next();
            res.setHeader("content-type", "text/html");
            res.end(
              await server.transformIndexHtml(
                req.url,
                `<div id="root"></div><script type="module">
import React from 'react';
import {createRoot} from 'react-dom/client';
import {ResultDownloads} from '/src/client/components/result-downloads.tsx';
const job = {id:'job', candidateId:'direction', kind:'full', phase:'ready', outputType:'video', version:7};
const run = {id:'run', candidates:[{id:'direction',displayTitle:'Example film'}], jobs:[job]};
const media = {narration:[],subtitles:[{language:'en',srt:'/en.srt',vtt:'/en.vtt'}],musicVideo:'/original.mp4'};
createRoot(document.getElementById('root')).render(React.createElement(ResultDownloads,{run,job,media,originalUrl:'/original.mp4',downloadName:'example-film-v7'}));
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
    await page.setViewportSize({ width: 900, height: 740 });
    const address = server.httpServer!.address();
    if (!address || typeof address === "string") throw Error("No fixture port");
    await page.goto(`http://127.0.0.1:${address.port}/download-test`);
    const open = () => page.locator('button[aria-label="Downloads"]').click();
    const presetButton = 'button[aria-label="Compression presets"]';
    const openPresets = () => page.locator(presetButton + '[aria-expanded="false"]').click();
    const presetItem = (name: string) => page.getByRole("menuitem", { name, exact: true });
    const checkDownload = async (trigger: Locator, name: string, contents: string) => {
      const [download] = await Promise.all([page.waitForEvent("download"), trigger.click()]);
      expect(download.suggestedFilename()).toBe(name);
      const file = await download.path();
      expect(await readFile(file, "utf8")).toBe(contents);
    };
    const dialog = page.getByRole("dialog", { name: "Downloads" });
    const downloadButton = page.getByRole("button", { name: "Downloads", exact: true });
    await open();
    await page.locator('a[download="example-film-v7.zip"]').first().waitFor({ state: "attached" });
    expect(
      await page
        .locator('[role="dialog"]')
        .first()
        .evaluate((dialog) => dialog.textContent),
    ).not.toContain("Make a smaller MP4 at the original resolution.");
    await page.waitForFunction(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return false;
      const { x, y, width, height } = dialog.getBoundingClientRect();
      return (
        width > 0 &&
        width < innerWidth * 0.75 &&
        Math.abs(x + width / 2 - innerWidth / 2) < 16 &&
        Math.abs(y + height / 2 - innerHeight / 2) < 24
      );
    });
    await expect(page.locator('a[href="/original.mp4"]').first()).toBeAttached();
    await expect(page.locator('a[href="/en.srt"]').first()).toBeAttached();
    const actions = await page
      .locator(
        '[role="dialog"] a[download]:not([hidden]), button[aria-label="Compression presets"]',
      )
      .evaluateAll((elements) =>
        elements.map((element) => ({
          label: element.getAttribute("aria-label"),
          text: element.textContent?.trim(),
          icon: Boolean(element.querySelector("svg")),
        })),
      );
    await dialog.locator(".ant-modal-title").hover();
    await dialog.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(downloadButton).toBeFocused();
    await open();
    await expect(dialog).toBeVisible();
    await expect(dialog).not.toHaveClass(/ant-zoom-appear/);
    expect(actions.length).toBeGreaterThanOrEqual(5);
    expect(actions.filter(({ label }) => label === "Compression presets")).toHaveLength(1);
    await expect(page.locator('[role="menu"]')).toHaveCount(0);
    for (const action of actions) {
      expect(action.label).toBeTruthy();
      expect(action.text).toBe("");
      expect(action.icon).toBe(true);
    }
    const geometry = () =>
      page
        .locator(presetButton)
        .first()
        .evaluate((button) => {
          const trigger = button.getBoundingClientRect();
          const original = document
            .querySelector('a[href="/original.mp4"]')!
            .getBoundingClientRect();
          const icons = [...button.querySelectorAll("svg")].map((icon) =>
            icon.getBoundingClientRect(),
          );
          return {
            aligned: Math.abs(trigger.top - original.top) < 2,
            padded:
              icons.length === 2 &&
              icons.every(
                (icon) => icon.left >= trigger.left + 4 && icon.right <= trigger.right - 4,
              ),
          };
        });
    await expect.poll(geometry).toEqual({ aligned: true, padded: true });
    await page.locator(presetButton).first().focus();
    await page.keyboard.press("Enter");
    const higherQuality = presetItem("50% rate");
    await expect(higherQuality).toBeVisible();
    await expect(presetItem("90% rate")).toBeVisible();
    await expect
      .poll(() => page.getByRole("menu").evaluate((menu) => menu.contains(document.activeElement)))
      .toBe(true);
    expect(starts + limitedStarts).toBe(0);
    await higherQuality.evaluate((item) => {
      (item as HTMLElement).click();
      (item as HTMLElement).click();
    });
    await page
      .locator(presetButton + '[aria-expanded="false"]')
      .first()
      .waitFor({ state: "attached" });
    await page
      .locator('[role="progressbar"][aria-valuenow="37"]')
      .first()
      .waitFor({ state: "attached" });
    expect(starts).toBe(1);
    await expect(
      dialog.getByRole("button", { name: "Compression presets", exact: true }),
    ).toBeFocused();
    await dialog.getByRole("button", { name: "Close", exact: true }).press("Enter");
    await expect(dialog).toBeHidden();
    await expect(downloadButton).toBeFocused();
    await page.setViewportSize({ width: 360, height: 640 });
    await open();
    await page
      .locator('[role="progressbar"][aria-valuenow="37"]')
      .first()
      .waitFor({ state: "attached" });
    expect(starts).toBe(1);
    expect(
      await page
        .locator('[role="dialog"]')
        .first()
        .evaluate((dialog) => {
          const { left, right } = dialog.getBoundingClientRect();
          return left >= 0 && right <= innerWidth;
        }),
    ).toBe(true);
    compactStatus = { status: "ready", bytes: 10, originalBytes: 100 };
    await page.waitForFunction(() =>
      document.querySelector('[role="dialog"]')?.textContent?.includes("50% rate · 90%"),
    );
    expect(starts).toBe(1);
    await checkDownload(
      page.locator('a[download="example-film-v7.zip"]'),
      "example-film-v7.zip",
      "local archive fixture",
    );
    await openPresets();
    await checkDownload(presetItem("50% rate"), "compact.mp4", "local compact video fixture");
    await openPresets();
    await checkDownload(presetItem("90% rate"), "compact-10mb.mp4", "local size-limited fixture");
    expect(starts).toBe(1);
    expect(limitedStarts).toBe(1);
    available = false;
    await page.reload();
    await open();
    await page.locator('a[href="/original.mp4"]').first().waitFor({ state: "attached" });
    await expect(page.locator('a[download="example-film-v7.zip"]')).toHaveCount(0);
  } finally {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});
