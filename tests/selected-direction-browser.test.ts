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
  "marks the saved direction, updates it and retains it after refresh",
  async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "selected-direction-"));
    let winnerId: string | null = "two";
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
          name: "selected-direction-fixture",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url?.startsWith("/saved-selection")) {
                if (req.method === "POST")
                  winnerId = new URL(req.url, "http://localhost").searchParams.get("winner");
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ winnerId }));
                return;
              }
              if (req.url !== "/selection-fixture") return next();
              res.setHeader("Content-Type", "text/html");
              res.end(
                await server.transformIndexHtml(
                  req.url,
                  `<!doctype html><div id="root"></div><script type="module">
import React,{useState,useEffect}from'react';import{createRoot}from'react-dom/client';import{Card}from'antd';
import{SelectedDirection}from'/src/client/components/selected-direction.tsx';import{uiLanguage}from'/src/client/i18n/service.ts';
import{roomCssVariables}from'/src/client/theme.ts';
import '/src/client/style.css';import '/src/client/room/room.css';
const h=React.createElement;
function App(){const[winner,setWinner]=useState();const read=()=>fetch('/saved-selection').then(r=>r.json()).then(r=>setWinner(r.winnerId));useEffect(()=>{void read()},[]);return h('div',{className:'creative-room',style:roomCssVariables},h('button',{id:'choose',onClick:()=>fetch('/saved-selection?winner=three',{method:'POST'}).then(read)},'Choose third'),h('button',{id:'clear',onClick:()=>fetch('/saved-selection',{method:'POST'}).then(read)},'Clear'),h('button',{id:'chinese',onClick:()=>uiLanguage.change('zh-CN')},'Chinese'),['one','two','three'].map(candidateId=>h(Card,{key:candidateId,className:'candidate studio-result-card','data-candidate':candidateId},h('div',{className:'candidate-heading-label'},h('h3',null,candidateId),h(SelectedDirection,{winnerId:winner,job:{kind:'preview',candidateId}})))));}
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
      await page.goto(`${server.resolvedUrls!.local[0]}selection-fixture`);
      await page.waitForSelector('[data-candidate="two"] .selected-direction-badge');
      expect(await page.$$(".selected-direction-badge")).toHaveLength(1);
      await page.waitForFunction(() => {
        const cards = document.querySelectorAll(".candidate");
        return getComputedStyle(cards[1]).borderTopColor === "rgb(244, 167, 101)";
      });
      const colors = await page.$$eval(".candidate", (cards) =>
        cards.map((card) => getComputedStyle(card).borderTopColor),
      );
      expect(colors[1]).not.toBe(colors[0]);
      expect(await page.$eval(".selected-direction-badge", (badge) => badge.textContent)).toBe("");
      await page.click("#choose");
      await page.waitForSelector('[data-candidate="three"] .selected-direction-badge');
      await page.reload();
      await page.waitForSelector('[data-candidate="three"] .selected-direction-badge');
      expect(await page.$$(".selected-direction-badge")).toHaveLength(1);
      await page.click("#chinese");
      await page.waitForFunction(
        () =>
          document.querySelector(".selected-direction-badge")?.getAttribute("aria-label") ===
          "已选方向",
      );
      await page.click("#clear");
      await page.waitForFunction(
        () => document.querySelectorAll(".selected-direction-badge").length === 0,
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
  30000,
);
