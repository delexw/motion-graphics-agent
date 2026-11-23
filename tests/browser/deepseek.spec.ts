import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createBrowserFixtureServer } from "../fixtures/browser-fixture-server";
import { expect } from "@playwright/test";
import { test } from "../fixtures/playwright-test";
import { chooseRenderedSelectOption } from "../fixtures/select-options";

test("selects DeepSeek in project settings and displays its Governance routing", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "deepseek-browser-"));
  const server = await createBrowserFixtureServer({
    cacheDir,

    plugins: [
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
function App(){const[draft,setDraft]=useState({...emptyRoomDraft(),step:7,stepLayout:'separate-video',request:{...emptyRoomDraft().request,instructions:'Explain an example idea',provider:'codex',mainModel:'gpt-6.2-astra'}});const[governance,setGovernance]=useState(false);return React.createElement(ConfigProvider,{theme:roomTheme},React.createElement(React.Fragment,null,React.createElement('button',{id:'governance',onClick:()=>setGovernance(true)},'Governance'),governance?React.createElement(GovernancePage):React.createElement(RoomOnboarding,{draft,onChange:setDraft,materials:[],styles:[],examples:[],onCreated(){},onUpload:async()=>[]}),React.createElement('output',{id:'state'},JSON.stringify(draft)),React.createElement('div',{id:'cost-fixture'},React.createElement(GovernanceUsageTable,{byFunction:true,rows:[{model:'deepseek-flash',purpose:'Fixture authoring',calls:1,tools:2,cacheHits:0,inputTokens:25,outputTokens:7,cachedTokens:5,uncachedInputTokens:20,cacheWriteTokens:0,cacheWrite5mTokens:null,cacheWrite1hTokens:null,costLow:0.000007215,costHigh:0.000007215,costBasis:'Plugin API estimate · dsh-cost-meter (USD)'}]}))));}createRoot(document.getElementById('root')).render(React.createElement(App));</script>`,
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
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith("/api/admin/governance"))
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            generatedAt: "2026-11-15T00:00:00Z",
            models: [
              {
                function: "Previews and full generation",
                claude: "claude-opus-5-5",
                codex: "gpt-6.2-astra",
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
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ available: true, languageTracksSupported: true }),
        });
      else if (
        ["127.0.0.1", "localhost"].includes(url.hostname) ||
        ["data:", "blob:"].includes(url.protocol)
      )
        return route.fallback();
      else return route.abort();
    });
    await page.goto(`${server.resolvedUrls!.local[0]}deepseek-fixture`);
    await page.locator('[aria-label="Model"]').first().waitFor({ state: "attached" });
    await page.locator('[aria-label="Model"]').first().click();
    await chooseRenderedSelectOption(page, '.ant-select-item-option[title="GPT-6.2 Sol"]');
    await page.waitForFunction(() => {
      const { provider, mainModel } = JSON.parse(
        document.querySelector("#state")!.textContent!,
      ).request;
      return provider === "codex" && mainModel === "gpt-6.2-sol";
    });
    await page.locator('[aria-label="Model"]').first().click();
    await chooseRenderedSelectOption(page, '.ant-select-item-option[title="DeepSeek Flash"]');
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector("#state")!.textContent!).request.provider === "deepseek",
    );
    const state = await page
      .locator("#state")
      .first()
      .evaluate((el) => JSON.parse(el.textContent!));
    expect(state.request.mainModel).toBeUndefined();
    await page.locator("#governance").first().click();
    await page.waitForFunction(() => document.body.textContent?.includes("deepseek-v4-pro"));
    expect(await page.evaluate(() => document.body.textContent)).toContain("DeepSeek selection");
    const accounting = await page
      .locator("#cost-fixture")
      .first()
      .evaluate((el) => el.textContent!);
    expect(accounting).toContain("Plugin API estimate · dsh-cost-meter (USD)");
    expect(accounting).toContain("$0.000007");
    expect(errors).toEqual([]);
  } finally {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});
