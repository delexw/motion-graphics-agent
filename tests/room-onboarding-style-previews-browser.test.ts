import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { expect, it } from "vitest";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { loadCatalog } from "../src/server/catalog/catalog";
import { appRoot } from "../src/server/runtime/config";
import { browserAliases, browserDependencyScan } from "../vite.resolve";

it.skipIf(!browserExecutablePath())(
  "keeps preview directions and effort settings through draft creation and saved project edits",
  async () => {
    const styles = (await loadCatalog()).styles.map(({ id, name_en }) => ({ id, name_en }));
    const instructions =
      "Act 1 uses Vintage Rubber Hose Animation (style-140), continuing Rubber Hose animation. Act 3 uses Manga Production Theatre (style-136) with manga scenery. No mosaic.";
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "onboarding-style-preview-"));
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
          name: "onboarding-style-preview-fixture",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url !== "/onboarding-style-preview-test") return next();
              const html = await server.transformIndexHtml(
                req.url,
                `<!doctype html><div id="root"></div><script type="module">
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{RoomOnboarding}from'/src/client/room/room-onboarding.tsx';
import{emptyRoomDraft}from'/src/client/room/onboarding.ts';
import{SavedProjectEffortSelect}from'/src/client/components/project-effort-select.tsx';
import{ConfigProvider}from'antd';
import{roomTheme,roomCssVariables}from'/src/client/theme.ts';
import'/src/client/style.css';import'/src/client/room/room.css';
function App(){const[created,setCreated]=useState(null);const[draft,setDraft]=useState({...emptyRoomDraft(),step:7,stepLayout:'separate-video',request:{instructions:${JSON.stringify(instructions)},duration:180,urls:[],selectedStyleIds:['style-056','style-098','style-093'],candidateCount:2}});return React.createElement(React.Fragment,null,React.createElement(RoomOnboarding,{draft,onChange:setDraft,materials:[],styles:${JSON.stringify(styles)},examples:[],onCreated:setCreated,onUpload:async()=>[]}),React.createElement('output',{id:'state'},JSON.stringify(draft)),React.createElement('output',{id:'created'},JSON.stringify(created)),created && React.createElement('div',{id:'saved-project-effort'},React.createElement(SavedProjectEffortSelect,{run:created,onUpdated:setCreated})));}
createRoot(document.getElementById('root')).render(React.createElement(ConfigProvider,{theme:roomTheme},React.createElement('div',{className:'room-utility',style:{...roomCssVariables,background:'var(--room-surface)'}},React.createElement(App))));</script>`,
              );
              res.setHeader("Content-Type", "text/html");
              res.end(html);
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
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      const savedEffort: boolean[] = [];
      await page.setRequestInterception(true);
      page.on("request", (request) => {
        if (request.url().endsWith("/api/runs") && request.method() === "POST") {
          void request.respond({
            status: 202,
            contentType: "application/json",
            body: JSON.stringify({
              id: "test-run",
              request: JSON.parse(request.postData()!),
              phase: "queued",
              jobs: [],
              candidates: [],
            }),
          });
        } else if (
          request.url().endsWith("/api/runs/test-run/model-effort") &&
          request.method() === "PATCH"
        ) {
          const { dynamicModelEffort } = JSON.parse(request.postData()!);
          savedEffort.push(dynamicModelEffort);
          void request.respond({
            status: dynamicModelEffort ? 200 : 503,
            contentType: "application/json",
            body: JSON.stringify(
              dynamicModelEffort
                ? {
                    id: "test-run",
                    request: { dynamicModelEffort },
                    phase: "queued",
                    jobs: [],
                    candidates: [],
                  }
                : { error: "Fixture save failed" },
            ),
          });
        } else if (
          request.url().startsWith(server.resolvedUrls!.local[0]) ||
          request.url().startsWith("data:")
        ) {
          void request.continue();
        } else {
          void request.abort();
        }
      });
      await page.goto(`${server.resolvedUrls!.local[0]}onboarding-style-preview-test`);
      await page.waitForSelector('[aria-label="Preview directions"]');
      await page.waitForSelector('[aria-label="Build route"]');
      expect(await page.$('[aria-label="Creative approach"]')).toBeNull();
      expect(
        await page.$eval(
          '[aria-label="Build route"]',
          (el) => el.closest(".ant-select")?.textContent,
        ),
      ).toContain("Selected styles with previews");
      expect(
        await page.$eval(
          '[aria-label="Preview directions"]',
          (el) => (el as HTMLInputElement).disabled,
        ),
      ).toBe(false);
      const effortSelect = '[role="combobox"][aria-label="Adjustive effort"]';
      const selectValue = (selector: string) =>
        page.$eval(selector, (input) => input.closest(".ant-select")?.textContent?.trim());
      const setEffort = async (selector: string, value: "Yes" | "No") => {
        await page.focus(selector);
        await page.keyboard.press("ArrowDown");
        await page.waitForSelector(`${selector}[aria-expanded="true"]`);
        const active =
          ".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-active";
        await page.waitForSelector(active);
        if ((await page.$eval(active, (option) => option.textContent)) !== value) {
          await page.keyboard.press(value === "Yes" ? "ArrowDown" : "ArrowUp");
          await page.waitForFunction(
            (selector, value) => document.querySelector(selector)?.textContent === value,
            {},
            active,
            value,
          );
        }
        await page.keyboard.press("Enter");
      };
      const pictures = path.join(appRoot, "work/onboarding-layout");
      await mkdir(pictures, { recursive: true });
      for (const width of [1200, 420]) {
        await page.setViewport({ width, height: 900 });
        await page.waitForSelector(effortSelect);
        expect(await selectValue(effortSelect)).toBe("No");
        expect(
          await page.$eval(".room-settings", (settings) => {
            const bounds = settings.getBoundingClientRect();
            const selects = Array.from(settings.querySelectorAll(".ant-select"));
            return (
              bounds.right <= innerWidth + 1 &&
              selects.every((select) => select.getBoundingClientRect().right <= bounds.right + 1)
            );
          }),
        ).toBe(true);
        expect(
          await page.$eval(".room-settings", (settings) => {
            const top = (label: string) =>
              settings
                .querySelector(`[aria-label="${label}"]`)
                ?.closest(".ant-select")
                ?.getBoundingClientRect().top ?? 0;
            return (
              Math.abs(top("Video language") - top("Output type")) <= 1 &&
              Math.abs(top("Adjustive effort") - top("Model")) <= 1 &&
              Math.abs(top("Build route") - top("Preview directions")) <= 1
            );
          }),
        ).toBe(true);
        await (await page.$(".room-settings"))!.screenshot({
          path: path.join(pictures, `generation-settings-${width}.png`),
        });
      }
      expect(await page.$eval(".room-settings", (settings) => settings.textContent)).not.toContain(
        "Controls titles, labels, diagrams and credits",
      );
      expect(await page.$eval(".room-settings", (settings) => settings.textContent)).not.toContain(
        "No style proposals or ranking calls.",
      );
      await page.focus('[aria-label="About video language"]');
      await page.waitForFunction(() =>
        Array.from(document.querySelectorAll(".ant-tooltip")).some(
          (tip) =>
            tip.textContent?.includes("Controls titles, labels, diagrams and credits") &&
            tip.getBoundingClientRect().width > 0,
        ),
      );
      await page.hover('[aria-label="About the build route"]');
      await page.waitForFunction(() =>
        Array.from(document.querySelectorAll(".ant-tooltip")).some(
          (tip) =>
            tip.textContent?.includes("No style proposals or ranking calls.") &&
            tip.getBoundingClientRect().width > 0,
        ),
      );
      await page.focus('[aria-label="About adjustive effort"]');
      await page.waitForFunction(() =>
        Array.from(document.querySelectorAll(".ant-tooltip")).some(
          (tip) =>
            tip.textContent?.trim() ===
              "Yes adjusts reasoning effort for each supported model call. No uses the default for that call." &&
            tip.getBoundingClientRect().width > 0,
        ),
      );
      await setEffort(effortSelect, "Yes");
      expect(await selectValue(effortSelect)).toBe("Yes");
      await setEffort(effortSelect, "No");
      expect(await selectValue(effortSelect)).toBe("No");
      expect(
        await page.$eval(
          "#state",
          (state) => JSON.parse(state.textContent!).request.dynamicModelEffort,
        ),
      ).toBe(false);
      await page.setViewport({ width: 1200, height: 900 });
      await page.click('[aria-label="Preview directions"]');
      await page.waitForSelector('[aria-label="Preview directions"][aria-expanded="true"]');
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await page.waitForFunction(
        () =>
          JSON.parse(document.querySelector("#state")!.textContent!).request.candidateCount === 3,
      );
      expect(
        await page.$eval("#state", (el) => JSON.parse(el.textContent!).request.selectedStyleIds),
      ).toEqual(["style-056", "style-098", "style-093"]);
      await page.click('[aria-label="Preview directions"]');
      await page.waitForSelector('[aria-label="Preview directions"][aria-expanded="true"]');
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("Enter");
      await page.waitForFunction(
        () =>
          JSON.parse(document.querySelector("#state")!.textContent!).request.candidateCount === 0,
      );
      expect(
        await page.$eval(
          '[aria-label="Build route"]',
          (el) => el.closest(".ant-select")?.textContent,
        ),
      ).toContain("Direct build");
      await page.evaluate(() => {
        const next = [...document.querySelectorAll(".room-onboarding-actions button")].find(
          (el) => el.textContent?.trim() === "Continue",
        );
        if (!next) throw Error("Continue button missing");
        (next as HTMLButtonElement).click();
      });
      await page.waitForFunction(
        () => JSON.parse(document.querySelector("#state")!.textContent!).step === 8,
      );
      await page.waitForFunction(() => document.body.textContent?.includes("Adjustive effort: No"));
      await page.evaluate(() => {
        const submit = [...document.querySelectorAll("button")].find(
          (el) => el.textContent?.trim() === "Create my project",
        );
        if (!submit) throw Error("Project submit button missing");
        submit.click();
      });
      await page.waitForFunction(
        () => JSON.parse(document.querySelector("#created")!.textContent!)?.id === "test-run",
      );
      const submitted = await page.$eval("#created", (el) => JSON.parse(el.textContent!).request);
      expect(submitted.selectedStyleIds).toEqual(["style-056", "style-098", "style-093"]);
      expect(submitted.instructions).toBe(instructions);
      expect(submitted.candidateCount).toBe(0);
      expect(submitted.dynamicModelEffort).toBe(false);
      const savedSelect = `#saved-project-effort ${effortSelect}`;
      expect(await selectValue(savedSelect)).toBe("No");
      await setEffort(savedSelect, "Yes");
      await page.waitForFunction(
        (selector) =>
          document.querySelector(selector)?.closest(".ant-select")?.textContent?.trim() === "Yes",
        {},
        savedSelect,
      );
      await setEffort(savedSelect, "No");
      await page.waitForSelector("#saved-project-effort .ant-alert-error");
      expect(await selectValue(savedSelect)).toBe("Yes");
      expect(savedEffort).toEqual([true, false]);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  },
  60_000,
);
