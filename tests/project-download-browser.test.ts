import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { expect, it } from "vitest";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { appRoot } from "../src/server/runtime/config";
import { browserAliases, browserDependencyScan } from "../vite.resolve";

it.skipIf(!browserExecutablePath())(
  "opens Downloads with one preset menu and keeps one job per preset",
  async () => {
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
    const server = await createServer({
      configFile: false,
      cacheDir,
      root: appRoot,
      optimizeDeps: browserDependencyScan,
      resolve: { alias: browserAliases },
      plugins: [
        react(),
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
      server: { host: "127.0.0.1", port: 0 },
    });
    const browser = await puppeteer.launch({
      executablePath: browserExecutablePath()!,
      headless: true,
      args: ["--no-sandbox"],
    });
    try {
      await server.listen();
      const page = await browser.newPage();
      await page.setViewport({ width: 900, height: 740 });
      const address = server.httpServer!.address();
      if (!address || typeof address === "string") throw Error("No fixture port");
      await page.goto(`http://127.0.0.1:${address.port}/download-test`);
      const open = () => page.click('button[aria-label="Downloads"]');
      const presetButton = 'button[aria-label="Compression presets"]';
      const openPresets = () => page.click(presetButton);
      async function presetItem(name: string) {
        const item = await page.waitForSelector(`::-p-aria([name="${name}"][role="menuitem"])`, {
          visible: true,
        });
        if (!item) throw Error(`Missing preset ${name}`);
        return item;
      }
      await open();
      await page.waitForSelector('a[download="example-film-v7.zip"]');
      expect(await page.$eval('[role="dialog"]', (dialog) => dialog.textContent)).not.toContain(
        "Make a smaller MP4 at the original resolution.",
      );
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
      expect(await page.$('a[href="/original.mp4"]')).not.toBeNull();
      expect(await page.$('a[href="/en.srt"]')).not.toBeNull();
      const actions = await page.$$eval(
        '[role="dialog"] a[download]:not([hidden]), button[aria-label="Compression presets"]',
        (elements) =>
          elements.map((element) => ({
            label: element.getAttribute("aria-label"),
            text: element.textContent?.trim(),
            icon: Boolean(element.querySelector("svg")),
          })),
      );
      expect(actions.length).toBeGreaterThanOrEqual(5);
      expect(actions.filter(({ label }) => label === "Compression presets")).toHaveLength(1);
      expect(await page.$('[role="menu"]')).toBeNull();
      for (const action of actions) {
        expect(action.label).toBeTruthy();
        expect(action.text).toBe("");
        expect(action.icon).toBe(true);
      }
      const geometry = () =>
        page.$eval(presetButton, (button) => {
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
      await page.focus(presetButton);
      await page.keyboard.press("Enter");
      const higherQuality = await presetItem("50% rate");
      await presetItem("90% rate");
      expect(starts + limitedStarts).toBe(0);
      await higherQuality.evaluate((item) => {
        (item as HTMLElement).click();
        (item as HTMLElement).click();
      });
      await page.waitForSelector(presetButton + '[aria-expanded="false"]');
      await page.waitForSelector('[role="progressbar"][aria-valuenow="37"]');
      expect(starts).toBe(1);
      await page.keyboard.press("Escape");
      await page.waitForSelector('[role="dialog"]', { hidden: true });
      await page.waitForFunction(
        () => document.activeElement?.getAttribute("aria-label") === "Downloads",
      );
      await page.setViewport({ width: 360, height: 640 });
      await open();
      await page.waitForSelector('[role="progressbar"][aria-valuenow="37"]');
      expect(starts).toBe(1);
      expect(
        await page.$eval('[role="dialog"]', (dialog) => {
          const { left, right } = dialog.getBoundingClientRect();
          return left >= 0 && right <= innerWidth;
        }),
      ).toBe(true);
      compactStatus = { status: "ready", bytes: 10, originalBytes: 100 };
      await page.waitForFunction(() =>
        document.querySelector('[role="dialog"]')?.textContent?.includes("50% rate · 90%"),
      );
      expect(starts).toBe(1);
      const session = await page.createCDPSession();
      await session.send("Browser.setDownloadBehavior", {
        behavior: "allow",
        downloadPath: cacheDir,
      });
      await page.click('a[download="example-film-v7.zip"]');
      await expect
        .poll(async () => {
          try {
            return await readFile(path.join(cacheDir, "example-film-v7.zip"), "utf8");
          } catch {
            return "";
          }
        })
        .toBe("local archive fixture");
      await openPresets();
      await (await presetItem("50% rate")).click();
      await expect
        .poll(async () => readFile(path.join(cacheDir, "compact.mp4"), "utf8").catch(() => ""))
        .toBe("local compact video fixture");
      await openPresets();
      await (await presetItem("90% rate")).click();
      await expect
        .poll(async () => readFile(path.join(cacheDir, "compact-10mb.mp4"), "utf8").catch(() => ""))
        .toBe("local size-limited fixture");
      expect(starts).toBe(1);
      expect(limitedStarts).toBe(1);
      available = false;
      await page.reload();
      await open();
      await page.waitForSelector('a[href="/original.mp4"]');
      expect(await page.$('a[download="example-film-v7.zip"]')).toBeNull();
    } finally {
      await browser.close();
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  },
  30000,
);
