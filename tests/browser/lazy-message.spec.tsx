import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createBrowserFixtureServer } from "../fixtures/browser-fixture-server";
import { expect } from "@playwright/test";
import { test } from "../fixtures/playwright-test";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageResponse } from "../../src/client/components/ai-elements/message";

test("keeps message text and basic formatting visible during server rendering", () => {
  const html = renderToStaticMarkup(<MessageResponse>{"**An original idea**"}</MessageResponse>);
  expect(html).toContain('data-streamdown="strong">An original idea');
});

test("loads rich rendering on demand without losing math, diagrams or highlighting", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "rich-message-"));
  const server = await createBrowserFixtureServer({
    cacheDir,

    plugins: [
      {
        name: "rich-message-fixture",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url !== "/message-test") return next();
            const html = await server.transformIndexHtml(
              req.url,
              `<!doctype html><div id="root"></div><script type="module">
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{MessageResponse}from'/src/client/components/ai-elements/message.tsx';
const text=${JSON.stringify("**An original idea**\n\nPalette #87E64B and **#191919**.\n\n```javascript\nconst greeting = 'hello';\n```\n\n$$\nx^2 + y^2\n$$\n\n```mermaid\ngraph TD; A[Idea]-->B[Film];\n```")};
function App(){const[show,setShow]=useState(false);return React.createElement('main',null,React.createElement('button',{onClick:()=>setShow(true)},'Show message'),show&&React.createElement(MessageResponse,{isAnimating:false},text));}
createRoot(document.getElementById('root')).render(React.createElement(App));</script>`,
            );
            res.setHeader("Content-Type", "text/html");
            res.end(html);
          });
        },
      },
    ],
  });
  try {
    await server.listen();
    const requests: string[] = [];
    const errors: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(`${server.resolvedUrls!.local[0]}message-test`);
    await page.locator("button").first().waitFor({ state: "attached" });
    expect(requests.some((url) => url.includes("rich-message-response"))).toBe(false);
    await page.locator("button").first().click();
    await page.locator(".katex").first().waitFor({ state: "attached" });
    await page.locator('[data-streamdown="mermaid"] svg').first().waitFor({ state: "attached" });
    await page
      .locator('[data-language="javascript"] code span[style*="--sdm-c"]')
      .first()
      .waitFor({ state: "attached" });
    expect(
      await page
        .locator('[data-streamdown="strong"]')
        .first()
        .evaluate((element) => element.textContent),
    ).toBe("An original idea");
    expect(requests.some((url) => url.includes("rich-message-response"))).toBe(true);
    expect(await page.locator(".prompt-color-swatch").evaluateAll((nodes) => nodes.length)).toBe(2);
    expect(
      await page
        .locator(".prompt-color-swatch")
        .first()
        .evaluate((node) => getComputedStyle(node).backgroundColor),
    ).toBe("rgb(135, 230, 75)");
    await page.screenshot({ path: path.join(cacheDir, "message-color-chips.png") });
    expect(errors).toEqual([]);
  } finally {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});
