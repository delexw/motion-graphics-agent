import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createBrowserFixtureServer } from "../fixtures/browser-fixture-server";
import { expect } from "@playwright/test";
import { test } from "../fixtures/playwright-test";

test("shows the backend's installed renderer version and does not invent one when unavailable", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "renderer-choice-"));
  const fixture = `<!doctype html><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';
import{RendererChoice}from'/src/client/room/renderer-choice.tsx';
window.fetch=async()=>Response.json(location.search.includes('unavailable')?{error:'Fixture renderer unavailable'}:{multiplane:{available:true,version:'0.3.99'}},{status:location.search.includes('unavailable')?503:200});
createRoot(document.getElementById('root')).render(React.createElement(RendererChoice,{value:'multiplane',onChange:()=>{}}));</script>`;
  const server = await createBrowserFixtureServer({
    cacheDir,

    plugins: [
      {
        name: "renderer-choice-fixture",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (!req.url?.startsWith("/renderer-test")) return next();
            res.setHeader("Content-Type", "text/html");
            res.end(await server.transformIndexHtml(req.url, fixture));
          });
        },
      },
    ],
  });
  try {
    await server.listen();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(`${server.resolvedUrls!.local[0]}renderer-test`);
    await page.waitForFunction(() =>
      document.body.textContent?.includes("Trying Multiplane 0.3.99"),
    );
    await page.goto(`${server.resolvedUrls!.local[0]}renderer-test?unavailable`);
    await page.waitForFunction(() =>
      document.body.textContent?.includes("Fixture renderer unavailable"),
    );
    expect(await page.evaluate(() => document.body.textContent)).not.toContain(
      "Trying Multiplane 0.3.99",
    );
    expect(errors).toEqual([]);
  } finally {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});
