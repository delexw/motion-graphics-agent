import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createBrowserFixtureServer } from "../fixtures/browser-fixture-server";
import { expect } from "@playwright/test";
import { test } from "../fixtures/playwright-test";
const fixture = `<!doctype html><div id="root"></div><script type="module">
import '/src/client/style.css';import '/src/client/room/room.css';
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{ProjectActivityPanel}from'/src/client/room/project-activity-panel.tsx';
import{RequestSchema}from'/src/shared/contracts.ts';
window.calls=[];window.streams=[];window.retries=[];window.holdActivity=true;
window.EventSource=class extends EventTarget{constructor(url){super();this.url=url;this.closed=false;window.streams.push(this);}close(){this.closed=true;}};
const node=(id,text,hasChildren=false)=>({id,scope:'project:job:',jobId:'job',kind:'notice',text,time:'2026-01-01T00:00:00Z',status:'complete',hasChildren});
window.fetch=async(url,options)=>{window.calls.push(String(url));if(window.holdActivity)await new Promise(resolve=>window.releaseActivity=()=>{window.holdActivity=false;resolve();});const query=new URL(String(url),'http://localhost').searchParams;const parents=query.get('path');const items=parents==='10.11'?[node(12,'Checking playback…')]:parents==='10'?[node(11,'Rendering your video…',true)]:[node(10,'Creating your video…',true),{...node(20,'Something interrupted this step. You can retry it.'),retryable:true,status:'stopped'}];if(!parents&&window.appendActivity)items.push(node(30,'New activity'));return new Response(JSON.stringify({items,lastEventId:501,retryItemId:20}),{headers:{'Content-Type':'application/json'}});};
const run={id:'project',createdAt:'2026-01-01',phase:'generating',request:RequestSchema.parse({instructions:'Explain an original topic'}),candidates:[{id:'direction',displayTitle:'Example',styleId:'example'}],jobs:[{id:'job',runId:'project',candidateId:'direction',kind:'full',phase:'failed',workspace:'/unused',model:'example',duration:20}]};
run.jobs.push({...run.jobs[0],id:'earlier-job',phase:'rendering'});
const preparationRun={...run,preparation:{fingerprint:'fixture',checkpoints:{inputs:{state:'completed',completedAt:'2026-01-01T00:00:00Z',output:{}},brief:{state:'completed',completedAt:'2026-01-01T00:00:01Z',output:{variant:'title-only',value:{subject:'An example topic'}}}}}};
function App(){const[active,setActive]=useState(false);const[preparation,setPreparation]=useState(false);return React.createElement(React.Fragment,null,React.createElement('button',{id:'preparation',onClick:()=>{setPreparation(true);setActive(true);}},'Preparation'),React.createElement('button',{id:'activity',onClick:()=>setActive(true)},'Activity'),React.createElement('button',{id:'conversation',onClick:()=>setActive(false)},'Conversation'),active&&React.createElement('div',{className:'room-project-scroll',style:{height:500,overflow:'auto'}},React.createElement(ProjectActivityPanel,{run:preparation?preparationRun:run,onRetry:id=>window.retries.push(id)})));}
createRoot(document.getElementById('root')).render(React.createElement(App));</script>`;
test("loads only visible activity pages, retries the right job and disposes streams on leaving", async ({
  page,
}) => {
  test.setTimeout(60000);
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "activity-page-"));
  const server = await createBrowserFixtureServer({
    cacheDir,

    plugins: [
      {
        name: "activity-page-fixture",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url !== "/activity-test") return next();
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
    await page.goto(`${server.resolvedUrls!.local[0]}activity-test`);
    await page.locator("#activity").first().waitFor({ state: "attached" });
    expect(await page.evaluate(() => Reflect.get(window, "calls").length)).toBe(0);
    await page.locator("#activity").first().click();
    await page
      .locator(".room-activity-list .ant-collapse-header")
      .first()
      .waitFor({ state: "attached" });
    expect(await page.evaluate(() => Reflect.get(window, "calls").length)).toBe(0);
    await expect(page.locator(".room-activity-list .ant-collapse-item-disabled")).toHaveCount(0);
    await page
      .locator(".room-activity-list > .ant-collapse-item:first-child > .ant-collapse-header")
      .click();
    await page
      .locator(".project-activity-panel .loading-status")
      .first()
      .waitFor({ state: "visible" });
    expect(
      await page
        .locator(".loading-status > span:last-child")
        .first()
        .evaluate((node) => node.textContent),
    ).toBe("Loading activity…");
    await expect(page.locator(".loading-status .ant-spin").first()).toBeAttached();
    await page.evaluate(() => Reflect.get(window, "releaseActivity")());
    await page.locator(".room-activity").first().waitFor({ state: "attached" });
    await page
      .locator(".project-activity-panel .loading-status")
      .first()
      .waitFor({ state: "hidden" });
    await page
      .locator('.activity-context-history[data-activity-branch="root"]')
      .first()
      .waitFor({ state: "attached" });
    expect(await page.evaluate(() => Reflect.get(window, "calls"))).toEqual([
      "/api/runs/project/activity/children?jobId=job&offset=0",
    ]);
    expect(
      await page
        .locator(".project-activity-panel")
        .first()
        .evaluate((node) => node.textContent),
    ).not.toMatch(/Older activity|Newer activity|Latest activity/);
    const nestedHeader =
      '.activity-context-history[data-activity-branch="root"] > div > .ant-collapse > .ant-collapse-item > .ant-collapse-header';
    await page.evaluate(() => Reflect.set(window, "holdActivity", true));
    await page.locator(nestedHeader).click();
    await page
      .locator('[data-activity-branch="10"] .activity-branch-loading')
      .first()
      .waitFor({ state: "visible" });
    expect(
      await page
        .locator('[data-activity-branch="10"] .activity-branch-loading')
        .first()
        .evaluate((node) => getComputedStyle(node).paddingInlineStart),
    ).toBe("28px");
    await page.evaluate(() => Reflect.get(window, "releaseActivity")());
    await page
      .locator('[data-activity-branch="10"] .activity-branch-loading')
      .first()
      .waitFor({ state: "hidden" });
    await expect.poll(() => page.evaluate(() => Reflect.get(window, "calls").length)).toBe(2);
    expect(await page.evaluate(() => Reflect.get(window, "calls")[1])).toContain("path=10");
    await page
      .locator(
        '[data-activity-branch="10"] > div > .ant-collapse > .ant-collapse-item > .ant-collapse-header',
      )
      .click();
    await page.locator('[data-activity-branch="10.11"]').first().waitFor({ state: "attached" });
    await expect.poll(() => page.evaluate(() => Reflect.get(window, "calls").length)).toBe(3);
    expect(await page.evaluate(() => Reflect.get(window, "calls")[2])).toContain("path=10.11");
    await page.waitForFunction(() =>
      document
        .querySelector('[data-activity-branch="10.11"]')
        ?.textContent.includes("Checking playback"),
    );
    const indents = await page.evaluate(() =>
      ["root", "10", "10.11"].map((path) => {
        const branch = document.querySelector(`[data-activity-branch="${path}"]`);
        const node = branch?.querySelector(".ant-thought-chain-node-title");
        if (!node) throw Error(`Missing activity row at ${path}`);
        return node.getBoundingClientRect().left;
      }),
    );
    expect(indents[1] - indents[0]).toBeCloseTo(28, 0);
    expect(indents[2] - indents[1]).toBeCloseTo(28, 0);

    await page.locator(nestedHeader).click();
    await page.waitForFunction(() => !document.querySelector('[data-activity-branch="10"]'));
    await expect(page.locator('[data-activity-branch="10.11"]')).toHaveCount(0);
    await page.locator(".room-activity-retry").click();
    await page.waitForFunction(() => Reflect.get(window, "retries").length > 0);
    expect(await page.evaluate(() => Reflect.get(window, "retries"))).toEqual(["job"]);
    const otherHeader =
      ".room-activity-list > .ant-collapse-item:nth-child(2) > .ant-collapse-header";
    await page.locator(otherHeader).click();
    await page.waitForFunction(() => Reflect.get(window, "streams").length === 1);
    expect(await page.evaluate(() => Reflect.get(window, "calls").at(-1))).toContain(
      "jobId=earlier-job",
    );
    const activeBranch =
      '.room-activity-list > .ant-collapse-item:nth-child(2) [data-activity-branch="root"]';
    await page.locator(`${activeBranch}[aria-busy="false"]`).first().waitFor({ state: "attached" });
    const existingRow = await page.$(`${activeBranch} .ant-collapse`);
    await page.evaluate(() => {
      Reflect.set(window, "holdActivity", true);
      Reflect.set(window, "appendActivity", true);
      Reflect.get(window, "streams")[0].onmessage({
        data: JSON.stringify({
          id: 502,
          runId: "project",
          jobId: "earlier-job",
          type: "phase",
          message: "Rendering",
          time: "2026-01-01T00:01:00Z",
        }),
      });
    });
    await page.locator(`${activeBranch}[aria-busy="true"]`).first().waitFor({ state: "attached" });
    await expect(page.locator(`${activeBranch} .loading-status`)).toHaveCount(0);
    expect(await existingRow!.evaluate((node) => node.isConnected)).toBe(true);
    await page.evaluate(() => Reflect.get(window, "releaseActivity")());
    await page.locator(`${activeBranch}[aria-busy="false"]`).first().waitFor({ state: "attached" });
    await page.waitForFunction(
      (selector) => document.querySelector(selector)?.textContent.includes("New activity"),
      activeBranch,
      {},
    );
    expect(await existingRow!.evaluate((node) => node.isConnected)).toBe(true);
    await expect(page.locator(`${activeBranch} .loading-status`)).toHaveCount(0);
    await page.locator(otherHeader).click();
    await page.waitForFunction(() => Reflect.get(window, "streams")[0].closed);
    await page.locator("#conversation").first().click();
    await page.waitForFunction(() => !document.querySelector(".activity-context-history"));
    const previousCalls = await page.evaluate(() => Reflect.get(window, "calls").length);
    await page.locator("#preparation").first().click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".room-activity-heading")].find((el) =>
        el.textContent?.includes("Project preparation"),
      ),
    );
    await page.evaluate(() => {
      const element = [...document.querySelectorAll(".room-activity-heading")].find((el) =>
        el.textContent?.includes("Project preparation"),
      );
      if (!(element instanceof HTMLElement)) throw Error("Preparation header not found");
      element.click();
    });
    await page.waitForFunction(() =>
      document.querySelector(".room-activity-detail")?.textContent?.includes("Project title"),
    );
    const preparationText = await page
      .locator(".room-activity-detail")
      .first()
      .evaluate((el) => el.textContent!);
    expect(preparationText).toContain("Reference material");
    expect(preparationText).toContain("Project title");
    expect(preparationText).not.toContain("No activity has been recorded yet.");
    expect(await page.evaluate(() => Reflect.get(window, "calls").length)).toBe(previousCalls);
    expect(errors).toEqual([]);
  } finally {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});
