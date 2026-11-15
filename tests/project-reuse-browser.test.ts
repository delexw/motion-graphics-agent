import { mkdtemp, rm, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import puppeteer from "puppeteer-core";
import { expect, it } from "vitest";
import { browserAliases, browserDependencyScan } from "../vite.resolve";
import { appRoot } from "../src/server/runtime/config";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { newBrowserPage } from "./fixtures/browser-page";

it("previews without writes, then explicitly creates a draft without starting generation", async () => {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "project-reuse-"));
  const writes: string[] = [];
  let sourceReads = 0;
  let sourceUnavailable = false;
  let createdRequest: unknown;
  const server = await createServer({
    configFile: false,
    root: appRoot,
    cacheDir,
    resolve: { alias: browserAliases },
    optimizeDeps: browserDependencyScan,
    server: { host: "127.0.0.1", port: 0, watch: null },
    plugins: [
      react(),
      {
        name: "reuse-fixture",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.method !== "GET") {
              writes.push(req.method + " " + req.url);
              res.setHeader("Content-Type", "application/json");
              if (req.url === "/api/project-reuse") {
                let body = "";
                for await (const chunk of req) body += chunk;
                createdRequest = JSON.parse(body);
                res.end(JSON.stringify({ draftId: "example-created-draft", revision: 1 }));
                return;
              }
              res.statusCode = 400;
              res.end("{}");
              return;
            }
            if (req.url === "/api/project-reuse/example-project/full/characters") {
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  characters: [
                    {
                      id: "guide",
                      name: "Scout",
                      appearance: "Cream puppy with a red cap.",
                      personality: "Friendly.",
                      role: "Educational guide.",
                      evidence: "Reviewed source design.",
                    },
                  ],
                }),
              );
              return;
            }
            if (req.url === "/api/runs/example-source") {
              sourceReads++;
              res.setHeader("Content-Type", "application/json");
              if (sourceUnavailable) {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: "Source project not found" }));
                return;
              }
              res.end(
                JSON.stringify({
                  id: "example-source",
                  request: { outputType: "video", instructions: "Original example topic" },
                  brief: { subject: "Example source project" },
                  candidates: [],
                  jobs: [
                    {
                      id: "example-source-full",
                      runId: "example-source",
                      kind: "full",
                      phase: "ready",
                      video: "original.mp4",
                      version: 2,
                    },
                  ],
                }),
              );
              return;
            }
            if (req.url !== "/reuse-test") return next();
            res.setHeader("Content-Type", "text/html");
            res.end(
              await server.transformIndexHtml(
                req.url,
                `<div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{ConfigProvider}from'antd';
import{BrowserRouter,Routes,Route}from'react-router-dom';
import{ProjectReuseButton}from'/src/client/components/project-reuse/button.tsx';import{RequestSchema}from'/src/shared/contracts.ts';
import{ProjectSettings}from'/src/client/components/project-settings.tsx';
import{roomTheme,roomCssVariables}from'/src/client/theme.ts';import{uiLanguage}from'/src/client/i18n';
import'/src/client/style.css';import'/src/client/room/room.css';
const request=RequestSchema.parse({instructions:'Explain the community bookshop',selectedStyleIds:['style-001']});
const run={id:'example-project',phase:'ready',createdAt:'2026-01-01',request,candidates:[{id:'direction',primaryStyleId:'style-001',supportingStyleIds:[]}],jobs:[{id:'full',runId:'example-project',candidateId:'direction',kind:'full',phase:'ready',video:'final.mp4',version:3,duration:20,workspace:'/unused',model:'example-model'}]};
const reusedRequest=RequestSchema.parse({...request,projectReuse:{projectId:'example-source',jobId:'example-source-full',version:2,operationId:'example-reuse',choices:{},styles:[]}});
Object.assign(document.body.style,roomCssVariables);document.body.className='creative-room';
window.documentBoot=crypto.randomUUID();
const content=React.createElement(React.Fragment,null,React.createElement(ProjectSettings,{run:{...run,request:reusedRequest},styles:[{id:'style-001',name_en:'Example visual direction'}]}),React.createElement(ProjectReuseButton,{run,job:run.jobs[0],styles:[{id:'style-001',name_en:'Example visual direction'}],onCreated:id=>{window.createdDraft=id}}));
await uiLanguage.change('zh-CN');createRoot(document.getElementById('root')).render(React.createElement(ConfigProvider,{theme:{...roomTheme,token:{...roomTheme.token,motion:false}}},React.createElement(BrowserRouter,null,React.createElement(Routes,null,React.createElement(Route,{path:'/reuse-test',element:content}),React.createElement(Route,{path:'/projects/example-source',element:React.createElement('h1',null,'Example source project')})))));
</script>`,
              ),
            );
          });
        },
      },
    ],
  });
  const browser = await puppeteer.launch({
    executablePath: browserExecutablePath(),
    headless: "shell",
    pipe: true,
  });
  try {
    await server.listen();
    const page = await newBrowserPage(browser);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.setRequestInterception(true);
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (
        ["127.0.0.1", "localhost"].includes(u.hostname) ||
        ["data:", "blob:"].includes(u.protocol)
      )
        void r.continue();
      else void r.abort();
    });
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(server.resolvedUrls!.local[0] + "reuse-test");
    await page.waitForSelector('.project-selected-settings button[aria-label="来源项目"]');
    expect(
      await page.$eval(
        '.project-selected-settings button[aria-label="来源项目"]',
        (n) => n.textContent,
      ),
    ).toBe("来源项目 · 版本 2");
    expect(sourceReads).toBe(0);
    const sourceTrigger = '.project-selected-settings button[aria-label="来源项目"]';
    const styleTrigger =
      '.project-selected-settings button.media-preview-link:not([aria-label="来源项目"])';
    expect(
      await page.$$eval(".project-selected-settings .media-preview-link", (ns) =>
        ns.every((n) => n.tagName === "BUTTON"),
      ),
    ).toBe(true);
    for (const selector of [sourceTrigger, styleTrigger]) {
      await page.hover(selector);
      expect(
        await page.$eval(selector, (n) => ({
          line: getComputedStyle(n).textDecorationLine,
          style: getComputedStyle(n).textDecorationStyle,
        })),
      ).toEqual({ line: "underline", style: "dotted" });
      await page.mouse.move(1, 1);
      await page.waitForSelector(".ant-popover:not(.ant-popover-hidden)", { hidden: true });
    }
    expect(
      await page.$eval(
        '.project-selected-settings button[aria-label="来源项目"]',
        (n) => getComputedStyle(n).textDecorationStyle,
      ),
    ).toBe("dotted");
    await page.hover('.project-selected-settings button[aria-label="来源项目"]');
    await page.waitForSelector(
      '.ant-popover video[src="/api/artifacts/example-source/example-source-full/original.mp4"]',
    );
    expect(await page.$eval(".ant-popover strong", (n) => n.textContent)).toBe(
      "Example source project",
    );
    expect(await page.$eval(".ant-popover video", (n) => (n as HTMLVideoElement).muted)).toBe(true);
    expect(sourceReads).toBeGreaterThan(0);
    await page.mouse.move(1, 1);
    await page.waitForSelector(".ant-popover:not(.ant-popover-hidden)", { hidden: true });
    sourceUnavailable = true;
    await page.hover('.project-selected-settings button[aria-label="来源项目"]');
    await page.waitForFunction(
      () =>
        document.querySelector('.ant-popover [role="status"]')?.textContent === "来源预览不可用",
    );
    const documentBoot = await page.evaluate(() => Reflect.get(window, "documentBoot"));
    await page.focus('.project-selected-settings button[aria-label="来源项目"]');
    await page.keyboard.press("Enter");
    await page.waitForSelector("h1");
    expect(await page.$eval("h1", (n) => n.textContent)).toBe("Example source project");
    expect(await page.evaluate(() => Reflect.get(window, "documentBoot"))).toBe(documentBoot);
    await page.goto(server.resolvedUrls!.local[0] + "reuse-test");
    await page.locator('button[aria-label="以此风格新建项目"]').click();
    await page.waitForSelector(".ant-modal");
    expect(await page.$eval(".dialog-body", (n) => getComputedStyle(n).scrollbarWidth)).toBe(
      "thin",
    );
    expect(await page.$eval(".dialog-body", (n) => getComputedStyle(n).scrollbarColor)).not.toBe(
      "auto",
    );
    expect(await page.$eval(".ant-modal", (n) => n.textContent)).toContain(
      "Example visual direction",
    );
    expect(await page.$eval(".ant-modal", (n) => n.textContent)).toContain("版本 3");
    expect(await page.$eval(".ant-modal", (n) => n.textContent)).toContain("没有独立设计快照");
    await page.locator('textarea[aria-label="新项目主题"]').fill("New topic, source unchanged");
    await page.$eval('[aria-label="配色"]', (n) => {
      const input = n.querySelectorAll("input")[1] as HTMLInputElement;
      input.click();
    });
    expect(await page.$eval('.ant-modal-footer [role="status"]', (n) => n.textContent)).toContain(
      "保留 7 项",
    );
    expect(
      await page.$eval(
        ".ant-modal-footer .ant-btn-primary",
        (n) => (n as HTMLButtonElement).disabled,
      ),
    ).toBe(false);
    const output = path.join(appRoot, "work/project-reuse-ui");
    await mkdir(output, { recursive: true });
    await page.screenshot({ path: path.join(output, "in-app-fixture.png") });
    await page.setViewport({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.mouse.move(1, 1);
    await page.waitForSelector(".ant-tooltip:not(.ant-tooltip-hidden)", { hidden: true });
    await page.focus(".ant-modal-close");
    await page.keyboard.press("Enter");
    await page.waitForSelector(".ant-modal", { hidden: true });
    expect(writes).toEqual([]);
    await page.locator('button[aria-label="以此风格新建项目"]').click();
    await page
      .locator('textarea[aria-label="新项目主题"]')
      .fill("A deeper new topic for the reused project");
    await page.waitForSelector('[aria-label="继承角色／吉祥物"] input:not([disabled])');
    expect(
      await page.$eval(
        '[aria-label="继承角色／吉祥物"] input',
        (n) => (n as HTMLInputElement).checked,
      ),
    ).toBe(true);
    await page.$eval('[aria-label="继承角色／吉祥物"] input', (n) =>
      (n as HTMLInputElement).click(),
    );
    expect(await page.$eval(".ant-modal", (n) => n.textContent)).toContain("Scout");
    expect(await page.$eval(".ant-modal", (n) => n.textContent)).toContain("外观");
    expect(await page.$eval(".ant-modal", (n) => n.textContent)).toContain(
      "Cream puppy with a red cap.",
    );
    await page.locator(".ant-modal-footer .ant-btn-primary").click();
    await page.waitForSelector(".ant-modal", { hidden: true });
    expect(await page.evaluate(() => Reflect.get(window, "createdDraft"))).toBe(
      "example-created-draft",
    );
    expect(writes).toEqual(["POST /api/project-reuse"]);
    expect(createdRequest).toMatchObject({
      choices: { characters: true, content: false },
      selectedCharacterIds: ["guide"],
    });
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
}, 60000);
