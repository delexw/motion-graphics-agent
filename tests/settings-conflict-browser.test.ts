import { newBrowserPage } from "./fixtures/browser-page";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { expect, it, vi } from "vitest";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { appRoot } from "../src/server/runtime/config";
import { browserAliases, browserDependencyScan } from "../vite.resolve";

it("shows grounded conflict rows, routes editing actions, clears stale evidence and reports unchecked failures in both languages", async () => {
  const executablePath = browserExecutablePath();
  expect(executablePath).toBeTruthy();
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "settings-notice-"));
  const server = await createServer({
    configFile: false,
    cacheDir,
    root: appRoot,
    optimizeDeps: browserDependencyScan,
    resolve: { alias: browserAliases },
    server: { host: "127.0.0.1", port: 0, watch: { ignored: ["**/.data/**"] } },
    plugins: [
      react(),
      {
        name: "settings-notice-fixture",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (
              !["/settings-notice", "/settings-onboarding", "/settings-governance"].includes(
                req.url || "",
              )
            )
              return next();
            const html = await server.transformIndexHtml(
              req.url || "/settings-notice",
              req.url === "/settings-governance"
                ? `<!doctype html><html><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';
import{SettingsChecks}from'/src/client/governance/settings-checks.tsx';
createRoot(document.getElementById('root')).render(React.createElement(SettingsChecks,{records:[{id:'11111111-1111-4111-8111-111111111111',draftId:'example-draft',requestHash:'a'.repeat(64),startedAt:'2026-01-01T00:00:00Z',finishedAt:'2026-01-01T00:00:01Z',model:'jev-1.14.0',status:'conflict',review:{requestHash:'a'.repeat(64),model:'jev-1.14.0',conflicts:[{setting:'frameRate',value:60,source:{field:'instructions',label:'Main idea'}}]},events:[{type:'usage',message:'Recorded fixture response',data:{usage:{input_tokens:10}}}]}]}));</script></body></html>`
                : req.url === "/settings-onboarding"
                  ? `<!doctype html><html><body><div id="root"></div><script type="module">
import '/src/client/style.css';
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{RoomOnboarding}from'/src/client/room/room-onboarding.tsx';
function App(){const[draft,setDraft]=useState({step:8,stepLayout:'separate-video',request:{instructions:'Use 24 fps for a short story.',outputType:'video',candidateCount:1,frameRate:60,aspectRatio:'16:9',speech:{mode:'off'},subtitles:{mode:'off'}},assets:[]});const[saved,setSaved]=useState(0);const[created,setCreated]=useState(false);return React.createElement(React.Fragment,null,React.createElement(RoomOnboarding,{draft,onChange:setDraft,materials:[],styles:[],examples:[],onBeforeStart:async()=>setSaved(n=>n+1),onCreated:()=>setCreated(true),onUpload:async()=>[]}),React.createElement('output',{id:'saved'},saved),React.createElement('output',{id:'created'},String(created)),React.createElement('output',{id:'draft'},JSON.stringify(draft)));}
createRoot(document.getElementById('root')).render(React.createElement(App));</script></body></html>`
                  : `<!doctype html><html><body><div id="root"></div><script type="module">
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{SettingsConflictNotice}from'/src/client/components/settings-conflict-notice.tsx';
import{SettingsConflictError}from'/src/shared/request-settings-review.ts';
import{CodedError}from'/src/shared/errors.ts';
import{uiLanguage}from'/src/client/i18n/service.ts';
import{focusSettingControl}from'/src/client/lib/settings-conflict-navigation.ts';
const details={requestHash:'a'.repeat(64),model:'jev-1.14.0',conflicts:[{setting:'frameRate',value:60,source:{field:'instructions',label:'Main idea'}},{setting:'aspectRatio',value:'16:9',source:{field:'requirements.images.instructions',label:'Image notes'}}]};
const conflict=new SettingsConflictError(details);const unavailable=new CodedError('SETTINGS_CHECK_UNAVAILABLE','Unchecked',503);
function App(){const[stale,setStale]=useState(false);const[down,setDown]=useState(false);const[action,setAction]=useState('');return React.createElement('main',{style:{maxWidth:760,margin:'24px auto',fontFamily:'sans-serif'}},React.createElement(SettingsConflictNotice,{error:down?unavailable:conflict,stale,onEditSetting:k=>setAction('setting:'+k),onEditSource:k=>{setAction('source:'+k);focusSettingControl(document.getElementById('fixture-controls'),'Image requirements')}}),React.createElement('button',{id:'stale',onClick:()=>setStale(true)},'Edit draft'),React.createElement('button',{id:'restore',onClick:()=>setStale(false)},'Restore'),React.createElement('button',{id:'zh',onClick:()=>uiLanguage.change('zh-CN')},'中文'),React.createElement('button',{id:'down',onClick:()=>{setStale(false);setDown(true)}},'Unavailable'),React.createElement('details',{id:'fixture-controls'},React.createElement('summary',null,'Notes'),React.createElement('section',{'aria-label':'Image requirements'},React.createElement('textarea',{id:'image-note','aria-label':'Image requirements'}))),React.createElement('output',{id:'action'},action));}
createRoot(document.getElementById('root')).render(React.createElement(App));</script></body></html>`,
            );
            res.setHeader("Content-Type", "text/html");
            res.end(html);
          });
        },
      },
    ],
  });
  const browser = await puppeteer.launch({ executablePath, headless: "shell", pipe: true });
  try {
    await server.listen();
    const page = await newBrowserPage(browser);
    await page.setViewport({ width: 1000, height: 700 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(`${server.resolvedUrls!.local[0]}settings-notice`);
    await page.waitForSelector('[role="alert"] li');
    expect(await page.$$eval('[role="alert"] li', (nodes) => nodes.length)).toBe(2);
    expect(await page.$eval('[role="alert"]', (node) => node.textContent)).toContain("60 fps");
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("H3");
    await page.locator('button[aria-label="Change setting: Frame rate"]').click();
    expect(await page.$eval("#action", (node) => node.textContent)).toBe("setting:frameRate");
    await page.locator('button[aria-label="Edit brief: Image notes"]').click();
    expect(await page.$eval("#action", (node) => node.textContent)).toBe(
      "source:requirements.images.instructions",
    );
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("image-note");
    expect(await page.$eval("#fixture-controls", (node) => (node as HTMLDetailsElement).open)).toBe(
      true,
    );
    const output = path.join(appRoot, "work/settings-conflict-preview");
    await mkdir(output, { recursive: true });
    await page.screenshot({ path: path.join(output, "notice-en.png") });
    await (await page.$('[role="alert"]'))!.screenshot({
      path: path.join(output, "notice-en-card.png"),
    });
    await page.locator("#stale").click();
    await page.waitForFunction(() => document.querySelectorAll('[role="alert"] li').length === 0);
    expect(await page.$eval('[role="alert"]', (node) => node.textContent)).toContain(
      "Create again",
    );
    await page.locator("#restore").click();
    await page.locator("#zh").click();
    await page.waitForFunction(() =>
      document.querySelector('[role="alert"]')?.textContent?.includes("项目尚未开始"),
    );
    expect(await page.$eval('[role="alert"]', (node) => node.textContent)).toContain("修改设置");
    await page.screenshot({ path: path.join(output, "notice-zh.png") });
    await (await page.$('[role="alert"]'))!.screenshot({
      path: path.join(output, "notice-zh-card.png"),
    });
    await page.locator("#down").click();
    await page.waitForFunction(() => document.querySelectorAll('[role="alert"] li').length === 0);
    expect(await page.$eval('[role="alert"]', (node) => node.textContent)).toContain(
      "暂时无法核对",
    );
    await page.setRequestInterception(true);
    let submissions = 0;
    let answer: (() => Promise<void>) | undefined;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/runs" && request.method() === "POST") {
        submissions++;
        expect(JSON.parse(request.postData() || "{}").frameRate).toBe(60);
        answer = () =>
          request.respond({
            status: 409,
            contentType: "application/json",
            body: JSON.stringify({
              code: "SETTINGS_CONFLICT",
              error: "Review the conflict",
              details: {
                requestHash: "a".repeat(64),
                model: "jev-1.14.0",
                conflicts: [
                  {
                    setting: "frameRate",
                    value: 60,
                    source: { field: "instructions", label: "Main idea" },
                  },
                ],
              },
            }),
          });
      } else if (new URL(request.url()).pathname === "/api/setup")
        void request.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            speechSupported: true,
            scriptItemsSupported: true,
            generatedScriptItemsSupported: true,
            speechStartSupported: true,
            videoLanguageSupported: true,
          }),
        });
      else void request.continue();
    });
    await page.goto(`${server.resolvedUrls!.local[0]}settings-onboarding`);
    await page.waitForSelector(".room-onboarding-actions button.ant-btn-primary");
    await page.locator(".room-onboarding-actions button.ant-btn-primary").click();
    await vi.waitFor(() => expect(answer).toBeDefined());
    expect(await page.$eval("#saved", (node) => node.textContent)).toBe("1");
    expect(await page.$eval(".room-onboarding", (node) => node.hasAttribute("inert"))).toBe(true);
    expect(await page.$eval('[role="status"]', (node) => node.textContent)).toContain(
      "Checking your brief",
    );
    await page.$eval(".room-onboarding-actions button.ant-btn-primary", (node) =>
      (node as HTMLButtonElement).click(),
    );
    expect(submissions).toBe(1);
    await answer!();
    await page.waitForSelector('[role="alert"] li');
    expect(await page.$eval("#created", (node) => node.textContent)).toBe("false");
    expect(await page.$eval("#draft", (node) => node.textContent)).toContain("Use 24 fps");
    expect(await page.$eval(".room-onboarding", (node) => node.hasAttribute("inert"))).toBe(false);
    await page.screenshot({ path: path.join(output, "onboarding-blocked.png") });
    await page.locator('button[aria-label="Change setting: Frame rate"]').click();
    expect(await page.$eval('[aria-current="step"]', (node) => node.textContent)).toBe("Settings");
    await page.locator('button[aria-label="Edit brief: Main idea"]').click();
    expect(await page.$eval('[aria-current="step"]', (node) => node.textContent)).toBe("Idea");
    await page.goto(`${server.resolvedUrls!.local[0]}settings-governance`);
    await page.waitForSelector(".ant-table-row");
    expect(await page.$eval("body", (node) => node.textContent)).toContain("Conflicts found");
    await page.locator(".ant-table-row-expand-icon").click();
    await page.waitForSelector(".ant-table-expanded-row pre");
    expect(await page.$eval(".ant-table-expanded-row", (node) => node.textContent)).toContain(
      "60 fps",
    );
    expect(await page.$eval(".ant-table-expanded-row pre", (node) => node.textContent)).toContain(
      "input_tokens",
    );
    await page.screenshot({ path: path.join(output, "governance-settings-check.png") });
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
}, 45000);
