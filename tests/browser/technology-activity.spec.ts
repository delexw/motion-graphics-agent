import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createBrowserFixtureServer } from "../fixtures/browser-fixture-server";
import { expect } from "@playwright/test";
import { test } from "../fixtures/playwright-test";

test("renders distinct setup activities in the video group", async ({ page }) => {
  test.setTimeout(60000);
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "technology-activity-"));
  const server = await createBrowserFixtureServer({
    cacheDir,

    plugins: [
      {
        name: "technology-activity-fixture",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url !== "/technology-activity-test") return next();
            res.setHeader("Content-Type", "text/html");
            res.end(
              await server.transformIndexHtml(
                req.url,
                `<!doctype html><div id="root"></div><script type="module">
import '/src/client/style.css';
import React from 'react';import {createRoot} from 'react-dom/client';
import {AgentActivity} from '/src/client/agent-activity.tsx';
const tools=['mcp__creative_pool__inspect_technologies','Bash','mcp__creative_pool__prepare_technology','mcp__creative_pool__prepare_technology_stylesheet','mcp__music_analysis__analyze_music'];
const events=tools.map((toolName,index)=>({id:index+1,runId:'example',jobId:'build',type:'tool',message:toolName,time:'2026-01-01T10:00:00Z',data:{toolName,itemId:'tool-'+index,purpose:'full video generation',invocationId:'build',state:'item.completed',...(index===1?{activity:'dependencies'}:{})}}));
const codexEvents=events.map(event=>({...event,type:'mcp_tool_call',data:{...event.data,toolName:event.data.toolName.replace('mcp__creative_pool__','creative_pool: ').replace('mcp__music_analysis__','music_analysis: ')}}));
const planningEvents=['plan_ready','storyboard_ready','capture_plan_ready'].map((type,index)=>({id:20+index,runId:'example',jobId:'plan',type,message:['Plan ready','Storyboard ready','Capture plan ready'][index],time:'2026-01-01T10:00:00Z',data:{purpose:'Full video planning',videoBuildPlanning:true,audience:'internal'}}));
createRoot(document.getElementById('root')).render(React.createElement(React.Fragment,null,React.createElement('section',{id:'claude'},React.createElement(AgentActivity,{events})),React.createElement('section',{id:'codex'},React.createElement(AgentActivity,{events:codexEvents})),React.createElement('section',{id:'planning'},React.createElement(AgentActivity,{events:planningEvents}))));
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
    const errors: string[] = [];
    page.on("pageerror", (error) =>
      errors.push(error instanceof Error ? error.message : String(error)),
    );
    await page.goto(`${server.resolvedUrls!.local[0]}technology-activity-test`);
    await page.waitForFunction(() =>
      document.body.textContent?.includes("Bundling stylesheets and assets…"),
    );
    const text = await page
      .locator("body")
      .first()
      .evaluate((body) => body.textContent);
    for (const label of [
      "Creating your video…",
      "Checking tool availability…",
      "Installing project dependencies…",
      "Bundling browser dependencies…",
      "Bundling stylesheets and assets…",
      "Analyzing music beats…",
    ])
      expect(text).toContain(label);
    expect(
      await page
        .locator("#claude")
        .first()
        .evaluate((section) => section.textContent),
    ).toBe(
      await page
        .locator("#codex")
        .first()
        .evaluate((section) => section.textContent),
    );
    expect(text).not.toContain("Recording video details");
    const planning = await page
      .locator("#planning")
      .first()
      .evaluate((section) => section.textContent);
    for (const label of ["Plan ready", "Storyboard ready", "Capture plan ready"])
      expect(planning).toContain(label);
    await expect(page.locator("#planning .activity-notice")).toHaveCount(3);
    expect(errors).toEqual([]);
  } finally {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});
