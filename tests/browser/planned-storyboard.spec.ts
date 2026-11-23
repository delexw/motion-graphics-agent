import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createBrowserFixtureServer } from "../fixtures/browser-fixture-server";
import { expect } from "@playwright/test";
import { test } from "../fixtures/playwright-test";
import { validStoryboard } from "../fixtures/storyboard";

test("opens, plays and closes the storyboard inline without navigating or creating a tab", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "planned-storyboard-browser-"));
  const storyboard = validStoryboard(30);
  const server = await createBrowserFixtureServer({
    cacheDir,

    plugins: [
      {
        name: "planned-storyboard-fixture",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url === "/api/runs/example/authentication") {
              res.setHeader("Content-Type", "application/json");
              res.end("[]");
              return;
            }
            if (req.url?.startsWith("/api/artifacts/example/full/STORYBOARD.json")) {
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(storyboard));
              return;
            }
            if (
              req.url !== "/planned-storyboard-test" &&
              !req.url?.startsWith("/projects/example/storyboard")
            )
              return next();
            res.setHeader("Content-Type", "text/html");
            res.end(
              await server.transformIndexHtml(
                req.url,
                `<!doctype html><div id="root"></div><script type="module">
import '/src/client/style.css';
import '/src/client/room/room.css';
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{ConfigProvider}from'antd';import{roomTheme}from'/src/client/theme.ts';
import{RoomProject}from'/src/client/room/room-project.tsx';
import{StoryboardPage}from'/src/client/storyboard-page.tsx';
import{RequestSchema}from'/src/shared/contracts.ts';
function App(){const[ready,setReady]=useState(false);const[view,setView]=useState({tab:'storyboard'});const noop=()=>{};
const job={id:'full',runId:'example',candidateId:'direction',kind:'full',phase:'generating',duration:30,workspace:'/tmp/example',model:'example',storyboardReady:ready};
const run={id:'example',createdAt:'2026-01-01',phase:'generating',request:RequestSchema.parse({instructions:'Explain knowledge'}),jobs:[job],candidates:[]};
return React.createElement(React.Fragment,null,React.createElement('button',{id:'publish-plan',onClick:()=>setReady(true)},'Finish planning'),React.createElement(RoomProject,{run,events:[],view,onView:setView,renderPreview:noop,renderFull:noop,onQuestion:noop,onUpdated:noop,onEdit:noop,onCancel:noop,onRetry:noop,controls:null}));}
createRoot(document.getElementById('root')).render(React.createElement(ConfigProvider,{theme:roomTheme},React.createElement(location.pathname.startsWith('/projects/')?()=>React.createElement(StoryboardPage,{projectId:'example',jobId:'full',onBack:()=>{}}):App)));</script>`,
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
    await page.goto(`${server.resolvedUrls!.local[0]}planned-storyboard-test`);
    await page.waitForFunction(() =>
      document.body.textContent?.includes("before recording begins"),
    );
    await expect(page.locator(".room-storyboard-open")).toHaveCount(0);
    await page.locator("#publish-plan").first().click();
    await page.locator(".room-storyboard-open").first().waitFor({ state: "attached" });
    const originalUrl = page.url();
    const originalPageCount = context.pages().length;
    await page.locator(".room-storyboard-open").first().click();
    await page.locator('[role="dialog"]').first().waitFor({ state: "attached" });
    await page
      .locator('[aria-label="Animated manga rehearsal"]')
      .first()
      .waitFor({ state: "attached" });
    await page.waitForFunction(
      () =>
        Number((document.querySelector('[aria-label="Movie time"]') as HTMLInputElement)?.value) >
        0,
    );
    expect(
      await page
        .locator('[aria-label="Animated manga rehearsal"]')
        .first()
        .evaluate((el) => el.textContent),
    ).toContain("A shape unfolds");
    expect(page.url()).toBe(originalUrl);
    expect(context.pages().length).toBe(originalPageCount);
    await page.waitForFunction(() => {
      const dialog = document.querySelector(".ant-modal");
      return (
        dialog &&
        getComputedStyle(dialog).transform === "none" &&
        getComputedStyle(dialog).opacity === "1"
      );
    });
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
    await expect(page.locator(".storyboard-page .page-template-header")).toHaveCount(0);
    const header = await page
      .locator(".storyboard-dialog-heading")
      .first()
      .evaluate((el) => ({
        color: getComputedStyle(el).color,
        background: getComputedStyle(el).backgroundColor,
        height: el.getBoundingClientRect().height,
        text: el.textContent,
      }));
    expect(header.color).toBe("rgb(243, 238, 231)");
    expect(header.background).toBe("rgba(0, 0, 0, 0)");
    expect(header.height).toBeLessThan(60);
    expect(
      await page
        .locator(".storyboard-dialog-heading p")
        .first()
        .evaluate((el) => ({
          color: getComputedStyle(el).color,
          opacity: getComputedStyle(el).opacity,
        })),
    ).toEqual({ color: "rgb(243, 238, 231)", opacity: "0.75" });
    expect(header.text).toContain("An idea unfolds");
    expect(header.text).toContain("1 scenes · 0:30");
    expect(
      await page
        .locator(".ant-modal")
        .first()
        .evaluate((el) => el.textContent),
    ).not.toContain("Back to project");
    expect(
      await page
        .locator(".ant-modal")
        .first()
        .evaluate((el) => el.textContent),
    ).not.toContain("WORKSPACE / STORYBOARD");
    const controlColors = () =>
      page
        .locator(".movie-controls .ant-btn")
        .first()
        .evaluate((el) => ({
          foreground: getComputedStyle(el).color,
          background: getComputedStyle(el).backgroundColor,
        }));
    expect(await controlColors()).toEqual({
      foreground: "rgb(21, 21, 21)",
      background: "rgb(255, 255, 255)",
    });
    await page.locator(".movie-controls .ant-btn").first().hover();
    await expect
      .poll(controlColors)
      .toEqual({ foreground: "rgb(21, 21, 21)", background: "rgb(245, 247, 252)" });
    await page.locator(".ant-modal-title").first().hover();
    await page.setViewportSize({ width: 1280, height: 1100 });
    await page.waitForFunction(() => {
      const area = document.querySelector(".storyboard-dialog-animation")!.getBoundingClientRect();
      const movie = document.querySelector(".manga-storyboard")!.getBoundingClientRect();
      return (
        Math.abs((area.top + area.bottom - movie.top - movie.bottom) / 2) < 1 &&
        Math.abs((area.left + area.right - movie.left - movie.right) / 2) < 1
      );
    });
    await page
      .locator(".dialog-body")
      .first()
      .evaluate((el) => {
        el.scrollTop = 0;
      });
    await page.screenshot({ path: path.join(cacheDir, "storyboard-inline-dialog.png") });
    expect(
      await page
        .locator(".ant-modal-container")
        .first()
        .evaluate((el) => {
          const bounds = el.getBoundingClientRect();
          return {
            horizontal: Math.abs((bounds.left + bounds.right) / 2 - window.innerWidth / 2),
            vertical: Math.abs((bounds.top + bounds.bottom) / 2 - window.innerHeight / 2),
          };
        }),
    ).toEqual({ horizontal: 0, vertical: 0 });
    await page.locator(".ant-modal-close").first().click();
    await page.waitForFunction(
      () => !document.querySelector('[aria-label="Animated manga rehearsal"]'),
    );
    expect(page.url()).toBe(originalUrl);
    expect(errors).toEqual([]);
  } finally {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});
