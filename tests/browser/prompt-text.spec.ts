import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createBrowserFixtureServer } from "../fixtures/browser-fixture-server";
import { expect } from "@playwright/test";
import { test } from "../fixtures/playwright-test";
import { appRoot } from "../../src/server/runtime/config";

test("shows prompt chips and hover/focus previews in the Assistant, project and editor", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "prompt-text-browser-"));
  const server = await createBrowserFixtureServer({
    cacheDir,

    plugins: [
      {
        name: "prompt-text-fixture",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url?.startsWith("/api/examples/") && req.url.split("?")[0].endsWith("/video")) {
              res.setHeader("Content-Type", "video/webm");
              res.end(await readFile(path.join(appRoot, "assets/style-previews/style-136.webm")));
              return;
            }
            if (req.url?.startsWith("/api/examples/")) {
              res.setHeader("Content-Type", "image/svg+xml");
              res.end(
                '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="orange"/></svg>',
              );
              return;
            }
            if (req.url !== "/prompt-text-test") return next();
            const html = await server.transformIndexHtml(
              req.url,
              `<!doctype html><div id="root"></div><script type="module">
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{RoomOnboarding}from'/src/client/room/room-onboarding.tsx';
import{RoomProject}from'/src/client/room/room-project.tsx';
import{emptyRoomDraft}from'/src/client/room/onboarding.ts';
import{StylePromptInput}from'/src/client/components/style-prompt-input.tsx';
import{StyleExamplesContext}from'/src/client/components/style-picker.tsx';
import{RequestSchema}from'/src/shared/contracts.ts';
const idea='Act 1: <style id="style-140">Vintage Rubber Hose Animation</style>. Act 3: <style id="style-136">Manga Production Theatre</style>.';
const styles=[{id:'style-140',name_en:'Vintage Rubber Hose Animation'},{id:'style-136',name_en:'Manga Production Theatre'}];
const run={id:'fixture',createdAt:'2026-01-01T00:00:00Z',phase:'ready',request:RequestSchema.parse({instructions:idea,duration:180,resolution:"1440p",frameRate:60,renderer:"multiplane",provider:"claude",candidateCount:0,selectedStyleIds:["style-140"]}),candidates:[],jobs:[]};
function App(){const[value,setValue]=useState(idea);const[draft,setDraft]=useState({...emptyRoomDraft(),step:1,request:run.request});const[view,setView]=useState({tab:'conversation'});return React.createElement(React.Fragment,null,
React.createElement('section',{id:'assistant'},React.createElement(RoomOnboarding,{draft,onChange:setDraft,materials:[],styles,examples:[],onCreated(){},onUpload:async()=>[]})),
React.createElement('section',{id:'project'},React.createElement(RoomProject,{run,styles,examples:[],events:[],renderPreview:()=>null,renderFull:()=>null,controls:null,onQuestion(){},onUpdated(){},onEdit(){},onCancel(){},onRetry(){},view,onView:setView})),
React.createElement('section',{id:'editor'},React.createElement(StylePromptInput,{value,onChange:setValue,styles})),
React.createElement('output',{id:'stored',hidden:true},value));}
createRoot(document.getElementById('root')).render(React.createElement(StyleExamplesContext,{value:styles.map(style=>({styleId:style.id,video:'fixture.webm',videoGeneratedAt:'fixture',status:'ready',catalogHash:'fixture',thumbnail:'fixture.png'}))},React.createElement(App)));</script>`,
            );
            res.setHeader("Content-Type", "text/html");
            res.end(html);
          });
        },
      },
    ],
  });
  try {
    await server.listen();
    await page.setViewportSize({ width: 1400, height: 1800 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`${server.resolvedUrls!.local[0]}prompt-text-test`);
    await page
      .locator('#project [aria-label="Selected project settings"]')
      .first()
      .waitFor({ state: "attached" });
    const settings = await page
      .locator('#project [aria-label="Selected project settings"]')
      .first()
      .evaluate((element) => element.textContent);
    for (const value of [
      "Claude Opus 5.5",
      "180s",
      "2K · 1440p",
      "60 fps",
      "Multiplane",
      "Vintage Rubber Hose Animation",
    ])
      expect(settings).toContain(value);
    await expect(page.locator('#project [aria-label="Selected project settings"]')).toHaveCount(1);
    const settingsBeforeIdea = await page
      .locator("#project .room-project-conversation")
      .first()
      .evaluate((element) => element.firstElementChild!.textContent);
    expect(settingsBeforeIdea).toContain("Settings");
    expect(settingsBeforeIdea).toContain("180s");

    for (const section of ["assistant", "project", "editor"]) {
      const selector = `#${section} .style-prompt-mention`;
      await page.locator(selector).first().waitFor({ state: "attached" });
      expect(await page.locator(selector).evaluateAll((els) => els.length)).toBe(2);
      expect(
        await page
          .locator(`#${section}`)
          .first()
          .evaluate((el) => el.textContent),
      ).not.toContain("<style id=");
      await page.locator(selector).first().hover();
      await page
        .waitForSelector(".style-mention-preview video", { state: "visible" })
        .catch(async (cause: unknown) => {
          const details = await page.evaluate((target) => {
            const trigger = document.querySelector(target);
            const bounds = trigger?.getBoundingClientRect();
            return {
              focused: document.hasFocus(),
              visibility: document.visibilityState,
              reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
              hovered: trigger?.matches(":hover"),
              bounds: bounds?.toJSON(),
              hit: bounds
                ? document
                    .elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
                    ?.outerHTML.slice(0, 600)
                : null,
              popovers: [...document.querySelectorAll(".ant-popover")].map((node) => ({
                text: node.textContent?.slice(0, 200),
                display: getComputedStyle(node).display,
                visibility: getComputedStyle(node).visibility,
                opacity: getComputedStyle(node).opacity,
                videos: node.querySelectorAll("video").length,
              })),
            };
          }, selector);
          throw new Error(`Preview did not open in ${section}: ${JSON.stringify(details)}`, {
            cause,
          });
        });
      expect(
        await page
          .locator(".style-mention-preview video")
          .first()
          .evaluate((el) => el.getAttribute("src")),
      ).toBe("/api/examples/style-140/video?v=fixture");
      await page.waitForFunction(() => {
        const video = document.querySelector<HTMLVideoElement>(".style-mention-preview video");
        return video && video.readyState >= 2 && !video.paused;
      });
      await page.mouse.move(0, 0);
      await page.locator(".style-mention-preview").first().waitFor({ state: "hidden" });
    }
    await page.locator("#project .style-prompt-mention").first().focus();
    await page.locator(".style-mention-preview video").first().waitFor({ state: "visible" });
    expect(
      await page
        .locator("#stored")
        .first()
        .evaluate((el) => el.textContent),
    ).toContain('<style id="style-140">Vintage Rubber Hose Animation</style>');
    expect(errors).toEqual([]);
  } finally {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});
