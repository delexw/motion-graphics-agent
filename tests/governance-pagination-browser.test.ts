import { chooseRenderedSelectOption } from "./fixtures/select-options";
import { newBrowserPage } from "./fixtures/browser-page";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import puppeteer from "puppeteer-core";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { appRoot } from "../src/server/runtime/config";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { browserAliases, browserDependencyScan } from "../vite.resolve";

it("keeps native Governance pagination aligned and un-underlined without changing document links", async () => {
  const executablePath = browserExecutablePath();
  expect(executablePath).toBeTruthy();
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "pagination-fixture-"));
  const server = await createServer({
    configFile: false,
    root: appRoot,
    cacheDir,
    optimizeDeps: browserDependencyScan,
    resolve: { alias: browserAliases },
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      react(),
      {
        name: "pagination-fixture",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url !== "/pagination-fixture") return next();
            res.setHeader("Content-Type", "text/html");
            res.end(
              await server.transformIndexHtml(
                req.url,
                `<!doctype html><div id="root"></div><script type="module">
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{ConfigProvider,Pagination}from'antd';
import'/src/client/style.css';import'/src/client/room/room.css';import{roomTheme,studioTheme,roomCssVariables}from'/src/client/theme.ts';
function App(){const[dark,setDark]=useState(true);const[current,setCurrent]=useState(1);const[size,setSize]=useState(8);return React.createElement(ConfigProvider,{theme:dark?roomTheme:studioTheme},React.createElement('main',{className:dark?'room-utility':'',style:{...roomCssVariables,padding:32,background:dark?'#27221E':'white',color:dark?'#F3EEE7':'#18243B'}},React.createElement('button',{id:'theme',onClick:()=>setDark(!dark)},'Switch theme'),React.createElement('section',{className:'governance-panel'},React.createElement('a',{id:'doc-link',href:'#details'},'Document link'),React.createElement(Pagination,{total:96,current,pageSize:size,showSizeChanger:true,pageSizeOptions:[8,16,24],onChange:(page,size)=>{setCurrent(page);setSize(size)}})),React.createElement('output',{id:'state'},current+':'+size)));}
createRoot(document.getElementById('root')).render(React.createElement(App));</script>`,
              ),
            );
          });
        },
      },
    ],
  });
  const browser = await puppeteer.launch({ executablePath, headless: "shell", pipe: true });
  try {
    await server.listen();
    const page = await newBrowserPage(browser);
    await page.setViewport({ width: 1100, height: 400 });
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        ["127.0.0.1", "localhost"].includes(url.hostname) ||
        ["data:", "blob:"].includes(url.protocol)
      )
        void request.continue();
      else void request.abort();
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(`${server.resolvedUrls!.local[0]}pagination-fixture`);
    await page.waitForSelector(".ant-pagination-item a");
    const readStyles = () =>
      page.$$eval(".ant-pagination a", (nodes) =>
        nodes.map((node) => ({
          margin: getComputedStyle(node).marginLeft,
          decoration: getComputedStyle(node).textDecorationLine,
        })),
      );
    expect(
      (await readStyles()).every((style) => style.margin === "0px" && style.decoration === "none"),
    ).toBe(true);
    expect(
      await page.$eval("#doc-link", (node) => ({
        margin: getComputedStyle(node).marginLeft,
        decoration: getComputedStyle(node).textDecorationLine,
      })),
    ).toEqual({ margin: "12px", decoration: "underline" });
    expect(
      await page.$eval(".ant-pagination-prev", (node) =>
        node.classList.contains("ant-pagination-disabled"),
      ),
    ).toBe(true);
    await page.locator(".ant-pagination-item-2 a").click();
    expect(await page.$eval("#state", (node) => node.textContent)).toBe("2:8");
    await page.focus(".ant-pagination-next button");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector("#state")?.textContent === "3:8");
    expect(await page.$eval("#state", (node) => node.textContent)).toBe("3:8");
    await page.locator(".ant-pagination-options .ant-select").click();
    await page.waitForSelector('.ant-select-item-option[title="16 / page"]');
    await page.focus(".ant-pagination-options input");
    await chooseRenderedSelectOption(
      page,
      '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option[title="16 / page"]',
    );
    await page.waitForFunction(() => document.querySelector("#state")?.textContent === "3:16");
    expect(await page.$eval("#state", (node) => node.textContent)).toBe("3:16");
    const output = path.join(appRoot, "work/pagination-fix");
    await mkdir(output, { recursive: true });
    await page.screenshot({ path: path.join(output, "pagination-dark.png") });
    await page.locator("#theme").click();
    expect(
      (await readStyles()).every((style) => style.margin === "0px" && style.decoration === "none"),
    ).toBe(true);
    await page.screenshot({ path: path.join(output, "pagination-light.png") });
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
}, 45000);
