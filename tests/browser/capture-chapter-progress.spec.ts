import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createBrowserFixtureServer } from "../fixtures/browser-fixture-server";
import { expect } from "@playwright/test";
import { test } from "../fixtures/playwright-test";

test("shows chapter progress inline in the shared Ant Design X activity group", async ({
  page,
}) => {
  test.setTimeout(60000);
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "capture-progress-browser-"));
  const server = await createBrowserFixtureServer({
    cacheDir,

    plugins: [
      {
        name: "capture-chapter-progress",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url !== "/capture-progress-test") return next();
            res.setHeader("Content-Type", "text/html");
            res.end(
              await server.transformIndexHtml(
                req.url,
                `<!doctype html><div id="root"></div><script type="module">
import '/src/client/style.css';import '/src/client/room/room.css';
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{ThoughtChain}from'@ant-design/x';
import{roomActivityStep}from'/src/client/room/room-activity.tsx';import{activityItems}from'/src/client/agent-activity-model.ts';import{displayActivityItems}from'/src/client/activity-display.ts';
const entry=(id,completed,index,chapterId,title,status)=>({id,runId:'example',jobId:'job',time:new Date(Date.UTC(2026,0,1,10,0,id)).toISOString(),type:'capture_progress',message:'Capturing footage…',data:{captureProgress:{completed,total:2,index,chapterId,title,status}}});
const initial=[entry(1,0,1,'create','Create a video','running'),entry(2,1,1,'create','Create a video','complete'),entry(3,1,2,'review','Review the result','running')];
const context={purpose:'Footage chapter capture',invocationId:'capture',captureChapter:{chapterId:'review',title:'Review the result',index:2,total:2}};
const tool=(id,type,itemId,failed)=>({id,runId:'example',jobId:'job',time:'2026-01-01T10:00:0'+id+'Z',type,message:type==='tool'?'mcp__reference_browser__click_control':'Result',data:type==='tool'?{...context,itemId,toolName:'mcp__reference_browser__click_control'}:{...context,results:[{itemId,failed,output:'Result'}]}});
initial.push(tool(4,'tool','first'),tool(5,'tool_result','first',true),tool(6,'tool','retry'),tool(7,'tool_result','retry',false));
const timing=(id,phase,status,actual)=>({id,runId:'example',jobId:'job',time:new Date(Date.UTC(2026,0,1,10,0,id)).toISOString(),type:'capture_timing',message:'Timing',data:{captureTiming:{chapterId:'review',title:'Review the result',index:2,total:2,phase,status,targetDurationSeconds:10,actualDurationSeconds:actual}}});
initial.push(timing(9,'review','running'));
function App(){const[events,setEvents]=useState(initial);return React.createElement('main',{style:{padding:32,maxWidth:900}},React.createElement(ThoughtChain,{items:displayActivityItems(activityItems(events)).map(item=>roomActivityStep(item)),line:'dashed'}),React.createElement('button',{id:'finish',onClick:()=>setEvents(p=>[...p,timing(10,'review','complete'),timing(11,'accepted','complete',9.9),entry(12,2,2,'review','Review the result','complete')])},'Complete next chapter'));}createRoot(document.getElementById('root')).render(React.createElement(App));</script>`,
              ),
            );
          });
        },
      },
    ],
  });
  try {
    await server.listen();
    await page.setViewportSize({ width: 1000, height: 550 });
    await page.goto(server.resolvedUrls!.local[0] + "capture-progress-test");
    await page.waitForFunction(() => document.body.innerText.includes("50%"));
    expect(await page.locator(".ant-progress").evaluateAll((nodes) => nodes.length)).toBe(1);
    expect(
      await page
        .locator("main")
        .first()
        .evaluate((node) => node.textContent),
    ).toContain("Create a video");
    expect(
      await page
        .locator("main")
        .first()
        .evaluate((node) => node.textContent),
    ).toContain("Review the result");
    expect(
      await page.locator(".ant-thought-chain-status-error").evaluateAll((nodes) => nodes.length),
    ).toBe(0);
    expect(
      await page
        .locator("main")
        .first()
        .evaluate(
          (node) => (node.textContent || "").split("Exploring your website reference…").length - 1,
        ),
    ).toBe(1);
    const operation = await page
      .locator("main")
      .first()
      .evaluate((node) => {
        const title = Array.from(node.querySelectorAll(".ant-thought-chain-node-title")).find(
          (el) => el.textContent === "Exploring your website reference…",
        );
        const chapter = title
          ?.closest(".ant-thought-chain-node")
          ?.parentElement?.closest(".ant-thought-chain-node");
        return chapter?.textContent;
      });
    expect(operation).toContain("Review the result");
    const inline = await page
      .locator(".activity-work-title")
      .first()
      .evaluate((node) => {
        const progress = node.querySelector(".ant-progress")!;
        return Math.abs(node.getBoundingClientRect().y - progress.getBoundingClientRect().y) < 20;
      });
    expect(inline).toBe(true);
    await page.screenshot({ path: path.join(cacheDir, "half.png") });
    await page.locator("#finish").first().click();
    await page.waitForFunction(() => document.body.innerText.includes("100%"));
    expect(
      await page
        .locator("main")
        .first()
        .evaluate((node) => node.textContent),
    ).toContain("Capture accepted · 9.9s / 10s");
    expect(
      await page.locator(".ant-thought-chain-status-error").evaluateAll((nodes) => nodes.length),
    ).toBe(0);
    await page.locator(".ant-progress-status-success").first().waitFor({ state: "attached" });
    await page.screenshot({ path: path.join(cacheDir, "complete.png") });
  } finally {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});
