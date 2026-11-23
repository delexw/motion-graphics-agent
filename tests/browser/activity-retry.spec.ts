import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createBrowserFixtureServer } from "../fixtures/browser-fixture-server";
import { expect } from "@playwright/test";
import { test } from "../fixtures/playwright-test";

test("retries the interrupted job from its left icon and hides the action after recovery", async ({
  page,
}) => {
  test.setTimeout(60000);
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "activity-retry-"));
  const server = await createBrowserFixtureServer({
    cacheDir,

    plugins: [
      {
        name: "activity-retry-fixture",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url !== "/activity-retry-test") return next();
            res.setHeader("Content-Type", "text/html");
            res.end(
              await server.transformIndexHtml(
                req.url,
                `<!doctype html><div id="root"></div><script type="module">
import '/src/client/style.css';import '/src/client/room/room.css';
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{RoomActivity}from'/src/client/room/room-activity.tsx';import{RequestSchema}from'/src/shared/contracts.ts';
const events=[{id:1,runId:'project',jobId:'preview-job',type:'error',message:'Resource failed',time:'2026-01-01T10:00:00Z'}];
const initial={id:'project',createdAt:'2026-01-01',phase:'failed',request:RequestSchema.parse({instructions:'Tell a visual story'}),candidates:[{id:'candidate',displayTitle:'Example'}],jobs:[{id:'preview-job',runId:'project',candidateId:'candidate',kind:'preview',phase:'failed',duration:3,workspace:'/unused',model:'example'}]};
let finish;function App(){const[run,setRun]=useState(initial);const[calls,setCalls]=useState([]);return React.createElement(React.Fragment,null,React.createElement(RoomActivity,{run,events,onRetry:async jobId=>{setCalls(p=>[...p,jobId]);await new Promise(resolve=>{finish=resolve});setRun(p=>({...p,phase:'ready',jobs:p.jobs.map(j=>({...j,phase:'ready'}))}));}}),React.createElement('button',{id:'finish',onClick:()=>finish()},'Finish retry'),React.createElement('output',{id:'calls'},JSON.stringify(calls)));}createRoot(document.getElementById('root')).render(React.createElement(App));</script>`,
              ),
            );
          });
        },
      },
    ],
  });
  try {
    await server.listen();
    await page.setViewportSize({ width: 900, height: 550 });
    await page.goto(`${server.resolvedUrls!.local[0]}activity-retry-test`);
    const headers = await page.$$(".ant-collapse-header");
    for (const header of headers)
      if ((await header.evaluate((el) => el.textContent))?.includes("Example"))
        await header.click();
    const retry = await page.waitForSelector('button[aria-label="Retry"]', { state: "attached" });
    await page.waitForFunction(() => {
      const button = document.querySelector('button[aria-label="Retry"]');
      if (!button) return false;
      const rect = button.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return Boolean(hit && (hit === button || button.contains(hit)));
    });
    const buttonBounds = await retry!.boundingBox();
    const title = await page
      .locator(".ant-thought-chain-node-title")
      .evaluateAll((elements) =>
        elements
          .filter((el) => el.textContent?.includes("Something interrupted this step"))
          .map((el) => ({ left: el.getBoundingClientRect().left })),
      );
    expect(title).toHaveLength(1);
    expect(buttonBounds!.x + buttonBounds!.width).toBeLessThanOrEqual(title[0].left);
    await page.screenshot({ path: path.join(cacheDir, "activity-retry.png"), fullPage: true });
    await retry!.click();
    expect(
      await page
        .locator("#calls")
        .first()
        .evaluate((el) => el.textContent),
    ).toBe('["preview-job"]');
    expect(await retry!.evaluate((el) => (el as HTMLButtonElement).disabled)).toBe(true);
    await page.locator("#finish").first().click();
    await page.waitForFunction(() => !document.querySelector('button[aria-label="Retry"]'));
    expect(
      await page
        .locator("#calls")
        .first()
        .evaluate((el) => el.textContent),
    ).toBe('["preview-job"]');
  } finally {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});
