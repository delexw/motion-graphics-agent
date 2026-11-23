import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createBrowserFixtureServer } from "../fixtures/browser-fixture-server";
import { expect } from "@playwright/test";
import { test } from "../fixtures/playwright-test";

test("virtualizes nested history while preserving retry, scrolling and live appends", async ({
  page,
}) => {
  test.setTimeout(60000);
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "virtual-activity-"));
  const server = await createBrowserFixtureServer({
    cacheDir,

    plugins: [
      {
        name: "virtual-activity-fixture",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url !== "/activity-test") return next();
            res.setHeader("Content-Type", "text/html");
            res.end(
              await server.transformIndexHtml(
                req.url,
                `<!doctype html><style>.room-project-scroll{height:400px;overflow:auto;border:1px solid}.room-activity-steps{font-size:14px}</style><div id="root"></div><script type="module">
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{RoomActivity}from'/src/client/room/room-activity.tsx';import'/src/client/room/room.css';
const run={id:'project',phase:'failed',createdAt:'2026-01-01',request:{instructions:'Example'},jobs:[{id:'build',kind:'full',phase:'failed'}],candidates:[]};
const item=i=>({id:i+1,jobId:'build',scope:'project:build',kind:'tool',text:'Recorded work '+i,time:new Date(Date.UTC(2026,0,1,0,0,i)).toISOString(),status:'complete',purpose:'full video generation',invocationId:'build',itemId:'item-'+i});
const initial=Array.from({length:6000},(_,i)=>item(i));initial.push({...item(6000),kind:'notice',text:'Something interrupted this step. You can retry it.',retryable:true,status:'stopped'});
function App(){const[items,setItems]=useState(initial);return React.createElement(React.Fragment,null,React.createElement('button',{id:'append',onClick:()=>setItems(prev=>[...prev,item(prev.length)])},'Append'),React.createElement('div',{className:'room-project-scroll'},React.createElement(RoomActivity,{run,events:[],contexts:[{key:'build',label:'Full film example',status:'abort',summary:'Stopped',items,checkpoints:[]}],onRetry:()=>{window.retryCount=(window.retryCount||0)+1}})))}
createRoot(document.getElementById('root')).render(React.createElement(App));</script>`,
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
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(server.resolvedUrls!.local[0] + "activity-test");
    await page.locator(".ant-collapse-header").first().waitFor({ state: "attached" });
    await expect(page.locator(".room-virtual-activity")).toHaveCount(0);
    await page.locator(".ant-collapse-header").click();
    await page.waitForFunction(
      () =>
        Number(document.querySelector(".room-virtual-activity")?.getAttribute("data-row-count")) >
        6000,
    );
    await page.locator('button[aria-label="Retry"]').first().waitFor({ state: "visible" });
    const mounted = await page.$$("[data-activity-row]");
    expect(mounted.length).toBeGreaterThan(0);
    expect(mounted.length).toBeLessThan(80);
    await page.locator('button[aria-label="Retry"]').click();
    expect(await page.evaluate(() => Reflect.get(window, "retryCount"))).toBe(1);
    await page.locator(".room-project-scroll").first().hover();
    await page.mouse.wheel(0, -1000000);
    await page.waitForFunction(
      () => document.querySelector(".room-project-scroll")!.scrollTop < 100,
    );
    await page.waitForFunction(() =>
      document.querySelector(".room-virtual-activity")?.textContent?.includes("Recorded work 0"),
    );
    await page.locator("#append").first().click();
    await page.waitForFunction(
      () =>
        Number(document.querySelector(".room-virtual-activity")?.getAttribute("data-row-count")) >
        6001,
    );
    expect(
      await page
        .locator(".room-project-scroll")
        .first()
        .evaluate((node) => node.scrollTop),
    ).toBeLessThan(100);
    expect((await page.$$("[data-activity-row]")).length).toBeLessThan(80);
    await page
      .locator(".room-project-scroll")
      .first()
      .evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
    await page.waitForFunction(() =>
      document.querySelector(".room-virtual-activity")?.textContent?.includes("Recorded work 6001"),
    );
    await page.locator("#append").first().click();
    await page.waitForFunction(() =>
      document.querySelector(".room-virtual-activity")?.textContent?.includes("Recorded work 6002"),
    );
    expect((await page.$$("[data-activity-row]")).length).toBeLessThan(80);
    await page.locator(".room-project-scroll").first().hover();
    await page.mouse.wheel(0, -1000000);
    await page.waitForFunction(() => {
      const container = document.querySelector(".room-project-scroll")!;
      return container.scrollTop < 100;
    });
    await page.locator(".ant-collapse-header").click();
    await page
      .locator('.ant-collapse-header[aria-expanded="false"]')
      .first()
      .waitFor({ state: "attached" });
    await page.locator(".ant-collapse-header").click();
    await page
      .locator(".room-virtual-activity [data-activity-row]")
      .first()
      .waitFor({ state: "visible" });
    expect(errors).toEqual([]);
  } finally {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});
