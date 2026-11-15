import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { expect, it } from "vitest";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { appRoot } from "../src/server/runtime/config";
import { browserAliases, browserDependencyScan } from "../vite.resolve";
import { newBrowserPage } from "./fixtures/browser-page";
import { chooseRenderedSelectOption } from "./fixtures/select-options";

it("selects DeepSeek in project settings and displays its Governance routing", async () => {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "deepseek-browser-"));
  const server = await createServer({
    configFile: false,
    cacheDir,
    root: appRoot,
    optimizeDeps: browserDependencyScan,
    resolve: { alias: browserAliases },
    server: { host: "127.0.0.1", port: 0, watch: null },
    plugins: [
      react(),
      {
        name: "deepseek-ui-fixture",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url !== "/deepseek-fixture") return next();
            res.setHeader("Content-Type", "text/html");
            res.end(
              await server.transformIndexHtml(
                req.url,
                `<!doctype html><div id="root"></div><script type="module">
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{ConfigProvider}from'antd';
import{GovernanceUsageTable}from'/src/client/governance/usage-table.tsx';import{RoomOnboarding}from'/src/client/room/room-onboarding.tsx';import{emptyRoomDraft}from'/src/client/room/onboarding.ts';import{GovernancePage}from'/src/client/governance/page.tsx';import{roomTheme}from'/src/client/theme.ts';import'/src/client/style.css';
function App(){const[draft,setDraft]=useState({...emptyRoomDraft(),step:7,stepLayout:'separate-video',request:{...emptyRoomDraft().request,instructions:'Explain an example idea',provider:'codex',mainModel:'gpt-6.1-sol'}});const[governance,setGovernance]=useState(false);return React.createElement(ConfigProvider,{theme:roomTheme},React.createElement(React.Fragment,null,React.createElement('button',{id:'governance',onClick:()=>setGovernance(true)},'Governance'),governance?React.createElement(GovernancePage):React.createElement(RoomOnboarding,{draft,onChange:setDraft,materials:[],styles:[],examples:[],onCreated(){},onUpload:async()=>[]}),React.createElement('output',{id:'state'},JSON.stringify(draft)),React.createElement('div',{id:'cost-fixture'},React.createElement(GovernanceUsageTable,{byFunction:true,rows:[{model:'deepseek-flash',purpose:'Fixture authoring',calls:1,tools:2,cacheHits:0,inputTokens:25,outputTokens:7,cachedTokens:5,uncachedInputTokens:20,cacheWriteTokens:0,cacheWrite5mTokens:null,cacheWrite1hTokens:null,costLow:0.000007215,costHigh:0.000007215,costBasis:'Plugin API estimate · dsh-cost-meter (USD)'}]}))));}createRoot(document.getElementById('root')).render(React.createElement(App));</script>`,
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
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith("/api/admin/governance"))
        void request.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            generatedAt: "2026-11-15T00:00:00Z",
            models: [
              {
                function: "Previews and full generation",
                claude: "claude-opus-5-5",
                codex: "gpt-6.1-sol",
                deepseek: "deepseek-v4-pro",
              },
            ],
            pricingDate: "2026-11-15",
            pricingSources: [],
            projects: [],
            settingsChecks: [],
            pagination: { page: 1, pageSize: 5, total: 0, search: "" },
            checksPagination: { page: 1, pageSize: 10, total: 0, search: "" },
          }),
        });
      else if (url.pathname.startsWith("/api/"))
        void request.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ available: true, languageTracksSupported: true }),
        });
      else if (
        ["127.0.0.1", "localhost"].includes(url.hostname) ||
        ["data:", "blob:"].includes(url.protocol)
      )
        void request.continue();
      else void request.abort();
    });
    await page.goto(`${server.resolvedUrls!.local[0]}deepseek-fixture`);
    await page.waitForSelector('[aria-label="Model"]');
    await page.click('[aria-label="Model"]');
    await chooseRenderedSelectOption(page, '.ant-select-item-option[title="DeepSeek Flash"]');
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector("#state")!.textContent!).request.provider === "deepseek",
    );
    const state = await page.$eval("#state", (el) => JSON.parse(el.textContent!));
    expect(state.request.mainModel).toBeUndefined();
    await page.click("#governance");
    await page.waitForFunction(() => document.body.textContent?.includes("deepseek-v4-pro"));
    expect(await page.evaluate(() => document.body.textContent)).toContain("DeepSeek selection");
    const accounting = await page.$eval("#cost-fixture", (el) => el.textContent!);
    expect(accounting).toContain("Plugin API estimate · dsh-cost-meter (USD)");
    expect(accounting).toContain("$0.000007");
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
}, 60_000);
