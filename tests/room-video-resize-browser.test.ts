import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import react from "@vitejs/plugin-react";
import puppeteer from "puppeteer-core";
import { createServer } from "vite";
import { expect, it } from "vitest";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { appRoot } from "../src/server/runtime/config";
import { browserAliases, browserDependencyScan } from "../vite.resolve";
import { newBrowserPage } from "./fixtures/browser-page";

it.skipIf(!browserExecutablePath())(
  "resizes full-version video with its window while keeping result actions visible",
  async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "room-video-resize-"));
    const server = await createServer({
      configFile: false,
      cacheDir: directory,
      root: appRoot,
      optimizeDeps: browserDependencyScan,
      resolve: { alias: browserAliases },
      server: { host: "127.0.0.1", port: 0 },
      plugins: [
        react(),
        {
          name: "room-video-resize-fixture",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url?.startsWith("/api/")) {
                res.setHeader("Content-Type", "application/json");
                res.end("[]");
                return;
              }
              if (req.url !== "/resize-fixture") return next();
              res.setHeader("Content-Type", "text/html");
              res.end(
                await server.transformIndexHtml(
                  req.url,
                  `<!doctype html><div id="root"></div><script type="module">
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{Button,Card,ConfigProvider}from'antd';import{Download}from'lucide-react';
import{roomTheme}from'/src/client/theme.ts';import{RoomProject}from'/src/client/room/room-project.tsx';
import{VideoPlayer}from'/src/client/components/video-player.tsx';import{RequestSchema}from'/src/shared/contracts.ts';
import '/src/client/room/room.css';import '/src/client/style.css';
const job={id:'film',runId:'example',candidateId:'direction',kind:'full',sessionId:'fixture-session',phase:'ready',duration:90,workspace:'/tmp/example',model:'fixture',video:'renders/full.mp4'};
const run={id:'example',createdAt:'2026-01-01',phase:'ready',request:RequestSchema.parse({instructions:'An animated example film',candidateCount:0,selectedStyleIds:['style-001']}),jobs:[job],candidates:[{id:'direction',displayTitle:'Example film'}]};
const h=React.createElement;
function Result({slots}){return h('div',{className:'full-delivery'},h(Card,{className:'candidate studio-result-card'},h('div',{className:'candidate-media'},h(VideoPlayer,{'aria-label':'Example film',src:'/assets/style-previews/style-136.webm'})),slots.strip,h('div',{className:'candidate-body'},h('div',{className:'candidate-heading'},h('div',{className:'candidate-heading-label'},h('h3',null,'Example film'),h('span',{className:'candidate-generated-at'},'Generated just now')),h('div',{className:'delivery-links',role:'group','aria-label':'Result actions'},['Download editable project','New project from this style','Download MP4','Storyboard'].map(label=>h(Button,{key:label,className:'delivery-icon-button','aria-label':label,icon:h(Download,{size:18})})))),slots.switcher,h('div',{className:'candidate-actions'}))));}
function App(){const[size,setSize]=useState([640,760]);const[view,setView]=useState({tab:'full',refine:''});const noop=()=>{};return h(ConfigProvider,{theme:roomTheme},h('div',null,[[640,760],[620,640],[500,600],[320,420],[960,800]].map(([w,height])=>h('button',{key:w,'data-size':w+'x'+height,onClick:()=>setSize([w,height])},w+'x'+height))),h('div',{id:'window',className:'room-window-content is-fill',style:{width:size[0],height:size[1]}},h(RoomProject,{run,events:[],view,onView:setView,renderPreview:noop,renderFull:(job,slots)=>h(Result,{slots}),onQuestion:noop,onUpdated:noop,onEdit:noop,onCancel:noop,onRetry:noop,controls:null})));}
createRoot(document.getElementById('root')).render(h(App));</script>`,
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
      await page.setViewport({ width: 1100, height: 1000 });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      await page.goto(`${server.resolvedUrls!.local[0]}resize-fixture`);
      await page.waitForSelector(".room-full-video-results video");
      await page.waitForSelector(".room-refinement");
      const heights: number[] = [];
      for (const size of ["640x760", "620x640", "500x600", "320x420", "960x800"]) {
        await page.click(`button[data-size="${size}"]`);
        await page.waitForFunction(
          (width) => document.querySelector("#window")!.clientWidth === width,
          {},
          Number(size.split("x")[0]),
        );
        const geometry = await page.evaluate(() => {
          const scroll = document.querySelector(".room-project-scroll")!.getBoundingClientRect();
          const video = document
            .querySelector(".room-full-video-results video")!
            .getBoundingClientRect();
          const actions = document.querySelector('[aria-label="Result actions"]')!;
          const media = document.querySelector(".candidate-media")!.getBoundingClientRect();
          return {
            video: { top: video.top, bottom: video.bottom, height: video.height },
            videoWidth: video.width,
            mediaHeight: media.height,
            overflow: scroll.height < document.querySelector(".room-project-scroll")!.scrollHeight,
            footerHeight: document.querySelector(".candidate-body")!.getBoundingClientRect().height,
            cardWidth: document.querySelector(".studio-result-card")!.getBoundingClientRect().width,
            titleHeight: document.querySelector(".candidate-heading-label")!.getBoundingClientRect()
              .height,
            viewport: { top: scroll.top, bottom: scroll.bottom },
            actions: [...actions.querySelectorAll("button")].map((button) => {
              const box = button.getBoundingClientRect();
              return { top: box.top, bottom: box.bottom, left: box.left, right: box.right };
            }),
            window: document.querySelector("#window")!.getBoundingClientRect().toJSON(),
          };
        });
        heights.push(geometry.video.height);
        if (geometry.cardWidth <= 600) expect(geometry.titleHeight).toBeLessThanOrEqual(1);
        else expect(geometry.titleHeight).toBeGreaterThan(16);
        expect(geometry.footerHeight).toBeLessThanOrEqual(geometry.cardWidth <= 600 ? 60 : 140);
        expect(geometry.video.height).toBeGreaterThanOrEqual(size === "320x420" ? 140 : 160);
        expect(geometry.video.top).toBeGreaterThanOrEqual(geometry.viewport.top);
        expect(geometry.videoWidth / geometry.video.height).toBeCloseTo(16 / 9, 1);
        expect(geometry.mediaHeight).toBeCloseTo(geometry.video.height, 0);
        expect(geometry.actions).toHaveLength(4);
        for (const action of geometry.actions) {
          expect(action.top).toBeGreaterThanOrEqual(geometry.video.bottom - 1);
          if (size !== "320x420")
            expect(action.bottom).toBeLessThanOrEqual(geometry.viewport.bottom);
          expect(action.left).toBeGreaterThanOrEqual(geometry.window.left);
          expect(action.right).toBeLessThanOrEqual(geometry.window.right);
        }
      }
      await page.click('button[data-size="320x420"]');
      await page.waitForFunction(() => document.querySelector("#window")!.clientHeight === 420);
      await page.evaluate(() => {
        const scroll = document.querySelector(".room-project-scroll")!;
        scroll.scrollTop = scroll.scrollHeight;
      });
      const tiny = await page.evaluate(() => {
        const scroll = document.querySelector(".room-project-scroll")!;
        const viewport = scroll.getBoundingClientRect();
        const actions = document
          .querySelector('[aria-label="Result actions"]')!
          .getBoundingClientRect();
        return {
          scrollable: scroll.scrollHeight > scroll.clientHeight,
          bottom: actions.bottom,
          visibleBottom: viewport.bottom,
        };
      });
      expect(tiny.scrollable).toBe(true);
      expect(tiny.bottom).toBeLessThanOrEqual(tiny.visibleBottom);
      expect(heights[1]).toBeLessThan(heights[0]);
      expect(heights[4]).toBeGreaterThan(heights[3]);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
  30000,
);
