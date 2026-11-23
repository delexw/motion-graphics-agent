import { mkdtemp, rm, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createBrowserFixtureServer } from "../fixtures/browser-fixture-server";
import { expect } from "@playwright/test";
import { test } from "../fixtures/playwright-test";

test("previews without writes, then explicitly creates a draft without starting generation", async ({
  page,
}) => {
  test.setTimeout(60000);
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "project-reuse-"));
  const writes: string[] = [];
  let sourceReads = 0;
  let sourceUnavailable = false;
  let createdRequest: unknown;
  const server = await createBrowserFixtureServer({
    cacheDir,

    plugins: [
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
  try {
    await server.listen();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.route("**/*", (route) => {
      const u = new URL(route.request().url());
      if (
        ["127.0.0.1", "localhost"].includes(u.hostname) ||
        ["data:", "blob:"].includes(u.protocol)
      )
        return route.fallback();
      else return route.abort();
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(server.resolvedUrls!.local[0] + "reuse-test");
    await page
      .locator('.project-selected-settings button[aria-label="来源项目"]')
      .first()
      .waitFor({ state: "attached" });
    expect(
      await page
        .locator('.project-selected-settings button[aria-label="来源项目"]')
        .first()
        .evaluate((n) => n.textContent),
    ).toBe("来源项目 · 版本 2");
    expect(sourceReads).toBe(0);
    const sourceTrigger = '.project-selected-settings button[aria-label="来源项目"]';
    const styleTrigger =
      '.project-selected-settings button.media-preview-link:not([aria-label="来源项目"])';
    expect(
      await page
        .locator(".project-selected-settings .media-preview-link")
        .evaluateAll((ns) => ns.every((n) => n.tagName === "BUTTON")),
    ).toBe(true);
    for (const selector of [sourceTrigger, styleTrigger]) {
      await page.locator(selector).first().hover();
      expect(
        await page
          .locator(selector)
          .first()
          .evaluate((n) => ({
            line: getComputedStyle(n).textDecorationLine,
            style: getComputedStyle(n).textDecorationStyle,
          })),
      ).toEqual({ line: "underline", style: "dotted" });
      await page.mouse.move(1, 1);
      await page
        .locator(".ant-popover:not(.ant-popover-hidden)")
        .first()
        .waitFor({ state: "hidden" });
    }
    expect(
      await page
        .locator('.project-selected-settings button[aria-label="来源项目"]')
        .first()
        .evaluate((n) => getComputedStyle(n).textDecorationStyle),
    ).toBe("dotted");
    await page.locator('.project-selected-settings button[aria-label="来源项目"]').first().hover();
    await page
      .locator(
        '.ant-popover video[src="/api/artifacts/example-source/example-source-full/original.mp4"]',
      )
      .first()
      .waitFor({ state: "attached" });
    expect(
      await page
        .locator(".ant-popover strong")
        .first()
        .evaluate((n) => n.textContent),
    ).toBe("Example source project");
    expect(
      await page
        .locator(".ant-popover video")
        .first()
        .evaluate((n) => (n as HTMLVideoElement).muted),
    ).toBe(true);
    expect(sourceReads).toBeGreaterThan(0);
    await page.mouse.move(1, 1);
    await page
      .locator(".ant-popover:not(.ant-popover-hidden)")
      .first()
      .waitFor({ state: "hidden" });
    sourceUnavailable = true;
    await page.locator('.project-selected-settings button[aria-label="来源项目"]').first().hover();
    await page.waitForFunction(
      () =>
        document.querySelector('.ant-popover [role="status"]')?.textContent === "来源预览不可用",
    );
    const documentBoot = await page.evaluate(() => Reflect.get(window, "documentBoot"));
    await page.locator('.project-selected-settings button[aria-label="来源项目"]').first().focus();
    await page.keyboard.press("Enter");
    await page.locator("h1").first().waitFor({ state: "attached" });
    expect(
      await page
        .locator("h1")
        .first()
        .evaluate((n) => n.textContent),
    ).toBe("Example source project");
    expect(await page.evaluate(() => Reflect.get(window, "documentBoot"))).toBe(documentBoot);
    await page.goto(server.resolvedUrls!.local[0] + "reuse-test");
    await page.locator('button[aria-label="以此风格新建项目"]').click();
    await page.locator(".ant-modal").first().waitFor({ state: "attached" });
    expect(
      await page
        .locator(".dialog-body")
        .first()
        .evaluate((n) => getComputedStyle(n).scrollbarWidth),
    ).toBe("thin");
    expect(
      await page
        .locator(".dialog-body")
        .first()
        .evaluate((n) => getComputedStyle(n).scrollbarColor),
    ).not.toBe("auto");
    expect(
      await page
        .locator(".ant-modal")
        .first()
        .evaluate((n) => n.textContent),
    ).toContain("Example visual direction");
    expect(
      await page
        .locator(".ant-modal")
        .first()
        .evaluate((n) => n.textContent),
    ).toContain("版本 3");
    expect(
      await page
        .locator(".ant-modal")
        .first()
        .evaluate((n) => n.textContent),
    ).toContain("没有独立设计快照");
    await page.locator('textarea[aria-label="新项目主题"]').fill("New topic, source unchanged");
    await page
      .locator('[aria-label="配色"]')
      .first()
      .evaluate((n) => {
        const input = n.querySelectorAll("input")[1] as HTMLInputElement;
        input.click();
      });
    expect(
      await page
        .locator('.ant-modal-footer [role="status"]')
        .first()
        .evaluate((n) => n.textContent),
    ).toContain("保留 7 项");
    expect(
      await page
        .locator(".ant-modal-footer .ant-btn-primary")
        .first()
        .evaluate((n) => (n as HTMLButtonElement).disabled),
    ).toBe(false);
    const output = path.join(cacheDir, "screenshots");
    await mkdir(output, { recursive: true });
    await page.screenshot({ path: path.join(output, "in-app-fixture.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.mouse.move(1, 1);
    await page
      .locator(".ant-tooltip:not(.ant-tooltip-hidden)")
      .first()
      .waitFor({ state: "hidden" });
    await page.locator(".ant-modal-close").first().focus();
    await page.keyboard.press("Enter");
    await page.locator(".ant-modal").first().waitFor({ state: "hidden" });
    expect(writes).toEqual([]);
    await page.locator('button[aria-label="以此风格新建项目"]').click();
    await page
      .locator('textarea[aria-label="新项目主题"]')
      .fill("A deeper new topic for the reused project");
    await page
      .locator('[aria-label="继承角色／吉祥物"] input:not([disabled])')
      .first()
      .waitFor({ state: "attached" });
    expect(
      await page
        .locator('[aria-label="继承角色／吉祥物"] input')
        .first()
        .evaluate((n) => (n as HTMLInputElement).checked),
    ).toBe(true);
    await page
      .locator('[aria-label="继承角色／吉祥物"] input')
      .first()
      .evaluate((n) => (n as HTMLInputElement).click());
    expect(
      await page
        .locator(".ant-modal")
        .first()
        .evaluate((n) => n.textContent),
    ).toContain("Scout");
    expect(
      await page
        .locator(".ant-modal")
        .first()
        .evaluate((n) => n.textContent),
    ).toContain("外观");
    expect(
      await page
        .locator(".ant-modal")
        .first()
        .evaluate((n) => n.textContent),
    ).toContain("Cream puppy with a red cap.");
    await page.locator(".ant-modal-footer .ant-btn-primary").click();
    await page.locator(".ant-modal").first().waitFor({ state: "hidden" });
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
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});
