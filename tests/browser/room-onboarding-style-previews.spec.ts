import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createBrowserFixtureServer } from "../fixtures/browser-fixture-server";
import { expect } from "@playwright/test";
import { test } from "../fixtures/playwright-test";
import { loadCatalog } from "../../src/server/catalog/catalog";

test("keeps preview directions and effort settings through draft creation and saved project edits", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const styles = (await loadCatalog()).styles.map(({ id, name_en }) => ({ id, name_en }));
  const instructions =
    "Act 1 uses Vintage Rubber Hose Animation (style-140), continuing Rubber Hose animation. Act 3 uses Manga Production Theatre (style-136) with manga scenery. No mosaic.";
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "onboarding-style-preview-"));
  const server = await createBrowserFixtureServer({
    cacheDir,

    plugins: [
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
import{ConfigProvider}from'antd';
import{roomTheme,roomCssVariables}from'/src/client/theme.ts';
import'/src/client/style.css';import'/src/client/room/room.css';
function App(){const[created,setCreated]=useState(null);const[draft,setDraft]=useState({...emptyRoomDraft(),step:7,stepLayout:'separate-video',request:{instructions:${JSON.stringify(instructions)},duration:180,urls:[],selectedStyleIds:['style-056','style-098','style-093'],candidateCount:2}});return React.createElement(React.Fragment,null,React.createElement(RoomOnboarding,{draft,onChange:setDraft,materials:[],styles:${JSON.stringify(styles)},examples:[],onCreated:setCreated,onUpload:async()=>[]}),React.createElement('output',{id:'state'},JSON.stringify(draft)),React.createElement('output',{id:'created'},JSON.stringify(created)));}
createRoot(document.getElementById('root')).render(React.createElement(ConfigProvider,{theme:roomTheme},React.createElement('div',{className:'room-utility',style:{...roomCssVariables,background:'var(--room-surface)'}},React.createElement(App))));</script>`,
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
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.route("**/*", (route) => {
      if (route.request().url().endsWith("/api/runs") && route.request().method() === "POST") {
        return route.fulfill({
          status: 202,
          contentType: "application/json",
          body: JSON.stringify({
            id: "test-run",
            request: JSON.parse(route.request().postData()!),
            phase: "queued",
            jobs: [],
            candidates: [],
          }),
        });
      } else if (
        route.request().url().startsWith(server.resolvedUrls!.local[0]) ||
        route.request().url().startsWith("data:")
      ) {
        return route.fallback();
      } else {
        return route.abort();
      }
    });
    await page.goto(`${server.resolvedUrls!.local[0]}onboarding-style-preview-test`);
    await page.locator('[aria-label="Preview directions"]').first().waitFor({ state: "attached" });
    await page.locator('[aria-label="Build route"]').first().waitFor({ state: "attached" });
    await expect(page.locator('[aria-label="Creative approach"]')).toHaveCount(0);
    expect(
      await page
        .locator('[aria-label="Build route"]')
        .first()
        .evaluate((el) => el.closest(".ant-select")?.textContent),
    ).toContain("Selected styles with previews");
    expect(
      await page
        .locator('[aria-label="Preview directions"]')
        .first()
        .evaluate((el) => (el as HTMLInputElement).disabled),
    ).toBe(false);
    const effortSelect = '[role="combobox"][aria-label="Adjustive effort"]';
    const selectValue = (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((input) => input.closest(".ant-select")?.textContent?.trim());
    const setEffort = async (selector: string, value: "Yes" | "No") => {
      await page.locator(selector).first().focus();
      await page.keyboard.press("ArrowDown");
      await page
        .locator(`${selector}[aria-expanded="true"]`)
        .first()
        .waitFor({ state: "attached" });
      const active =
        ".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-active";
      await page.locator(active).first().waitFor({ state: "attached" });
      if (
        (await page
          .locator(active)
          .first()
          .evaluate((option) => option.textContent)) !== value
      ) {
        await page.keyboard.press(value === "Yes" ? "ArrowDown" : "ArrowUp");
        await expect(page.locator(active)).toHaveText(value);
      }
      await page.keyboard.press("Enter");
    };
    const pictures = path.join(cacheDir, "screenshots");
    await mkdir(pictures, { recursive: true });
    for (const width of [1200, 420]) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator(effortSelect).first().waitFor({ state: "attached" });
      expect(await selectValue(effortSelect)).toBe("No");
      expect(
        await page
          .locator(".room-settings")
          .first()
          .evaluate((settings) => {
            const bounds = settings.getBoundingClientRect();
            const selects = Array.from(settings.querySelectorAll(".ant-select"));
            return (
              bounds.right <= innerWidth + 1 &&
              selects.every((select) => select.getBoundingClientRect().right <= bounds.right + 1)
            );
          }),
      ).toBe(true);
      expect(
        await page
          .locator(".room-settings")
          .first()
          .evaluate((settings) => {
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
    expect(
      await page
        .locator(".room-settings")
        .first()
        .evaluate((settings) => settings.textContent),
    ).not.toContain("Controls titles, labels, diagrams and credits");
    expect(
      await page
        .locator(".room-settings")
        .first()
        .evaluate((settings) => settings.textContent),
    ).not.toContain("No style proposals or ranking calls.");
    await page.locator('[aria-label="About video language"]').first().focus();
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll(".ant-tooltip")).some(
        (tip) =>
          tip.textContent?.includes("Controls titles, labels, diagrams and credits") &&
          tip.getBoundingClientRect().width > 0,
      ),
    );
    await page.locator('[aria-label="About the build route"]').first().hover();
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll(".ant-tooltip")).some(
        (tip) =>
          tip.textContent?.includes("No style proposals or ranking calls.") &&
          tip.getBoundingClientRect().width > 0,
      ),
    );
    await page.locator('[aria-label="About adjustive effort"]').first().focus();
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
      await page
        .locator("#state")
        .first()
        .evaluate((state) => JSON.parse(state.textContent!).request.dynamicModelEffort),
    ).toBe(false);
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.locator('[aria-label="Preview directions"]').first().click();
    await page
      .locator('[aria-label="Preview directions"][aria-expanded="true"]')
      .first()
      .waitFor({ state: "attached" });
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () => JSON.parse(document.querySelector("#state")!.textContent!).request.candidateCount === 3,
    );
    expect(
      await page
        .locator("#state")
        .first()
        .evaluate((el) => JSON.parse(el.textContent!).request.selectedStyleIds),
    ).toEqual(["style-056", "style-098", "style-093"]);
    await page.locator('[aria-label="Preview directions"]').first().click();
    await page
      .locator('[aria-label="Preview directions"][aria-expanded="true"]')
      .first()
      .waitFor({ state: "attached" });
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () => JSON.parse(document.querySelector("#state")!.textContent!).request.candidateCount === 0,
    );
    expect(
      await page
        .locator('[aria-label="Build route"]')
        .first()
        .evaluate((el) => el.closest(".ant-select")?.textContent),
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
    const submitted = await page
      .locator("#created")
      .first()
      .evaluate((el) => JSON.parse(el.textContent!).request);
    expect(submitted.selectedStyleIds).toEqual(["style-056", "style-098", "style-093"]);
    expect(submitted.instructions).toBe(instructions);
    expect(submitted.candidateCount).toBe(0);
    expect(submitted.dynamicModelEffort).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});
