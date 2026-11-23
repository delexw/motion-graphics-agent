import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createBrowserFixtureServer } from "../fixtures/browser-fixture-server";
import { expect } from "@playwright/test";
import { test } from "../fixtures/playwright-test";

test("updates the subtitle cue count and progress bar in one activity row", async ({ page }) => {
  test.setTimeout(60000);
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "subtitle-cues-"));
  const server = await createBrowserFixtureServer({
    cacheDir,

    plugins: [
      {
        name: "subtitle-cues-fixture",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url !== "/subtitle-cues-test") return next();
            res.setHeader("Content-Type", "text/html");
            res.end(
              await server.transformIndexHtml(
                req.url,
                `<div id="root"></div><script type="module">
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{ActivityRow}from'/src/client/agent-activity.tsx';import{activityItems}from'/src/client/agent-activity-model.ts';import{displayActivityItems}from'/src/client/activity-display.ts';import'/src/client/style.css';
const event=(completed,id)=>({id,runId:'example',jobId:'job',type:'subtitle_progress',message:'Subtitle progress',time:'2026-01-01T00:00:00Z',data:{subtitleProgress:{language:'en',completed,total:30,status:'running'}}});
function App(){const[events,setEvents]=useState([event(0,1),event(18,2)]);return React.createElement(React.Fragment,null,displayActivityItems(activityItems(events)).map(item=>React.createElement(ActivityRow,{item,key:item.id})),React.createElement('button',{id:'next',onClick:()=>setEvents(p=>[...p,event(19,3)])},'Next cue'));}createRoot(document.getElementById('root')).render(React.createElement(App));</script>`,
              ),
            );
          });
        },
      },
    ],
  });
  try {
    await server.listen();
    await page.goto(server.resolvedUrls!.local[0] + "subtitle-cues-test");
    await page
      .locator('[role="progressbar"][aria-valuenow="60"]')
      .first()
      .waitFor({ state: "attached" });
    expect(
      await page
        .locator(".activity-work-title")
        .first()
        .evaluate((node) => node.textContent),
    ).toContain("Generating English subtitles… 18/30 cues");
    await page.locator("#next").first().click();
    await page
      .locator('[role="progressbar"][aria-valuenow="63"]')
      .first()
      .waitFor({ state: "attached" });
    expect(
      await page
        .locator(".activity-work-title")
        .first()
        .evaluate((node) => node.textContent),
    ).toContain("19/30 cues");
    await expect(page.locator(".activity-item")).toHaveCount(1);
    await page.screenshot({ path: path.join(cacheDir, "subtitle-cues-progress.png") });
  } finally {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});
