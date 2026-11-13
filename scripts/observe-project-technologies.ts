import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { readFile, realpath, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderInputRoot } from "../src/server/runtime/workspace";
import { technologyObservationFile } from "../src/server/technology/project-monitor";

const workspace = await realpath(process.argv[2]);
const entry = process.argv[3];
const root = await realpath(renderInputRoot(workspace));
const resources: Record<string, string> = {};
const errors: string[] = [];
let runtimeLibraries: Record<string, string> = {};
let native = { html_css: false, svg: false, webgl: false };
const browser = await chromium.launch({
  executablePath: process.env.HYPERFRAMES_BROWSER_PATH || undefined,
  headless: true,
});
try {
  const context = await browser.newContext();
  await context.route("**/*", async (route) => {
    try {
      const url = new URL(route.request().url());
      if (url.origin !== "http://project.local")
        throw Error("Remote request blocked during technology observation");
      const file = await realpath(path.resolve(root, "." + decodeURIComponent(url.pathname)));
      if (!file.startsWith(root + path.sep) || file.split(path.sep).includes("node_modules"))
        throw Error("Resource outside project render inputs");
      const body = await readFile(file);
      const key = path.relative(workspace, file).split(path.sep).join("/");
      resources[key] = createHash("sha256").update(body).digest("hex");
      const contentType =
        (
          {
            ".html": "text/html",
            ".js": "text/javascript",
            ".mjs": "text/javascript",
            ".css": "text/css",
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".jpg": "image/jpeg",
          } as Record<string, string>
        )[path.extname(file)] ?? "application/octet-stream";
      await route.fulfill({ body, contentType });
    } catch (error) {
      errors.push(String(error));
      await route.abort();
    }
  });
  await context.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      options?: unknown,
    ) {
      const value = Reflect.apply(original, this, [type, options]) as RenderingContext | null;
      if (value && ["webgl", "webgl2", "experimental-webgl"].includes(type))
        (window as Window & { __kitevaWebglObserved?: boolean }).__kitevaWebglObserved = true;
      return value;
    } as typeof original;
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  const relative = path.relative(root, path.resolve(workspace, entry)).split(path.sep).join("/");
  if (relative.startsWith("../") || !relative.endsWith(".html"))
    throw Error("Browser observation supports local HTML entries only");
  await page.goto(`http://project.local/${relative}`, { waitUntil: "networkidle", timeout: 30000 });
  // Exercise ordinary deterministic timeline entry points without claiming per-API visual correctness.
  await page.evaluate(() => {
    const timelines = (
      window as Window & { __timelines?: Record<string, { seek?: (time: number) => void }> }
    ).__timelines;
    for (const timeline of Object.values(timelines ?? {})) timeline.seek?.(0.5);
  });
  native = await page.evaluate(() => ({
    html_css: document.readyState === "complete" && document.styleSheets.length > 0,
    svg: [...document.querySelectorAll("svg")].some(
      (element) =>
        element.getBoundingClientRect().width > 0 &&
        element.getBoundingClientRect().height > 0 &&
        getComputedStyle(element).display !== "none",
    ),
    webgl: Boolean((window as Window & { __kitevaWebglObserved?: boolean }).__kitevaWebglObserved),
  }));
  runtimeLibraries = await page.evaluate(() => {
    const host = window as Window & { __THREE__?: string | number; paper?: { version?: string } };
    return { three_js: String(host.__THREE__ ?? ""), paper_js: host.paper?.version ?? "" };
  });
} catch (error) {
  errors.push(String(error));
} finally {
  await browser.close();
  await mkdir(path.dirname(path.join(workspace, technologyObservationFile)), { recursive: true });
  // With script errors a resource response is not sufficient evidence of successful evaluation.
  await writeFile(
    path.join(workspace, technologyObservationFile),
    JSON.stringify(
      {
        observedAt: new Date().toISOString(),
        resources: errors.length ? {} : resources,
        native: errors.length ? undefined : native,
        runtimeLibraries: errors.length ? undefined : runtimeLibraries,
        errors,
      },
      null,
      2,
    ),
  );
}
