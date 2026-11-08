import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { installedSkill } from "../src/server/agents/bundled-skills/installation";
import { img2threejsSkill } from "../src/server/agents/bundled-skills/img2threejs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";
import sharp from "sharp";
import { expect, it } from "vitest";
import { browserExecutablePath } from "../src/server/runtime/browser";

for (const source of ["local", "installed-upstream"] as const)
  it(`renders ${source} Three.js pixels repeatably across seeks, cameras and reloads`, async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "procedural-browser-"));
    let browser;
    try {
      let entry =
        'import {createFixtureModel, mountProceduralModelFixture} from "./tests/fixtures/procedural-model-browser"; mountProceduralModelFixture(createFixtureModel());';
      if (source === "installed-upstream") {
        const { directory: installed } = await installedSkill(img2threejsSkill);
        // The upstream's own shallow fixture is explicitly non-production, not a bypass for real assets.
        const generated = path.join(workspace, "generated-fixture.ts");
        await promisify(execFile)(
          "python3",
          [
            path.join(installed, "forge/stage3_build/generate_threejs_factory.py"),
            path.join(installed, "forge/tests/fixtures/subdivision_cage.json"),
            "--out",
            generated,
            "--allow-nonstrict",
          ],
          { timeout: 10_000 },
        );
        entry = `import {mountProceduralModelFixture} from "./tests/fixtures/procedural-model-browser"; import {createSubdivisionCageModel} from ${JSON.stringify(generated)}; mountProceduralModelFixture(createSubdivisionCageModel());`;
      }
      const result = await build({
        stdin: { contents: entry, resolveDir: process.cwd(), loader: "ts" },
        nodePaths: [path.join(process.cwd(), "node_modules")],
        bundle: true,
        write: false,
        format: "iife",
      });
      const html = path.join(workspace, "scene.html");
      await writeFile(
        html,
        `<!doctype html><body><script>${result.outputFiles[0].text.replaceAll("</script", "<\\/script")}</script></body>`,
      );
      browser = await puppeteer.launch({
        executablePath: browserExecutablePath(),
        headless: true,
        args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
      });
      const page = await browser.newPage();
      await page.setViewport({ width: 480, height: 320, deviceScaleFactor: 1 });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      await page.goto(pathToFileURL(html).href);
      expect(errors).toEqual([]);
      await page.waitForFunction("window.__IMG2THREEJS_READY__ === true", { timeout: 5000 });
      async function frame(time: number) {
        await page.evaluate((t) => (window as unknown as { seek(t: number): void }).seek(t), time);
        return Buffer.from(await page.screenshot());
      }
      const first = await frame(0.5);
      expect(first.equals(await frame(1.5))).toBe(false);
      expect(first.equals(await frame(0.5))).toBe(true);
      await frame(0);
      expect(first.equals(await frame(0.5))).toBe(true);
      const pixels = await sharp(first).stats();
      expect(pixels.channels.some((c) => c.stdev > 10)).toBe(true);
      await page.evaluate(
        `window.__IMG2THREEJS_CAPTURE__.setCamera({...window.hero, azimuthDegrees: 90})`,
      );
      expect(first.equals(Buffer.from(await page.screenshot()))).toBe(false);
      await page.evaluate("window.__IMG2THREEJS_CAPTURE__.setCamera(window.hero)");
      expect(first.equals(Buffer.from(await page.screenshot()))).toBe(true);
      await page.reload();
      expect(errors).toEqual([]);
      await page.waitForFunction("window.__IMG2THREEJS_READY__ === true", { timeout: 5000 });
      expect(first.equals(await frame(0.5))).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await browser?.close();
      await rm(workspace, { recursive: true, force: true });
    }
  }, 30_000);
