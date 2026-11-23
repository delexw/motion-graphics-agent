import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createBrowserFixtureServer } from "../fixtures/browser-fixture-server";
import { expect } from "@playwright/test";
import { test } from "../fixtures/playwright-test";

test("edits independent timed script items, reorders them and restores the saved list", async ({
  page,
}) => {
  test.setTimeout(60000);
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "script-items-browser-"));
  const server = await createBrowserFixtureServer({
    cacheDir,

    plugins: [
      {
        name: "script-items-fixture",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url?.startsWith("/api/speech/status")) {
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ available: true, detail: "Ready" }));
              return;
            }
            if (req.url !== "/script-items-test") return next();
            res.setHeader("Content-Type", "text/html");
            res.end(
              await server.transformIndexHtml(
                req.url,
                `<!doctype html><div id="root"></div><script type="module">
import '/src/client/style.css';
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{ScriptItems}from'/src/client/components/script-items.tsx';
const initial=[{id:'opening',startSeconds:0,endSeconds:2,text:'Read without narration',showSubtitles:true,speech:{mode:'off'}},{id:'voice',startSeconds:2,endSeconds:4,text:'Hello team',showSubtitles:false,speech:{mode:'narration',engine:'pocket-tts',language:'en',voice:'pocket_eve',speed:1,volume:0.8}}];
function App(){const[items,setItems]=useState(initial);const[saved,setSaved]=useState(initial);return React.createElement(React.Fragment,null,React.createElement(ScriptItems,{items,duration:20,onChange:setItems}),React.createElement('button',{id:'save',onClick:()=>setSaved(items)},'Save'),React.createElement('button',{id:'restore',onClick:()=>setItems(saved)},'Restore'),React.createElement('output',{id:'state',style:{display:'none'}},JSON.stringify(items)));}createRoot(document.getElementById('root')).render(React.createElement(App));</script>`,
              ),
            );
          });
        },
      },
    ],
  });
  try {
    await server.listen();
    await page.setViewportSize({ width: 1200, height: 1100 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(`${server.resolvedUrls!.local[0]}script-items-test`);
    await page.locator('[aria-label="Item text"]').first().waitFor({ state: "attached" });
    const state = async () =>
      JSON.parse(
        await page
          .locator("#state")
          .first()
          .evaluate((el) => el.textContent || "[]"),
      );
    expect((await state())[0].speech.mode).toBe("off");
    expect((await state())[1].speech.voice).toBe("pocket_eve");
    await expect(page.locator('[aria-label="Narration starts at (seconds)"]')).toHaveCount(0);
    await page.locator(".script-item .ant-select").first().click();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    expect((await state())[0].source).toBe("write");
    expect(
      await page
        .locator(".script-item")
        .first()
        .evaluate((el) => el.textContent),
    ).toContain("Script instructions");
    await page.locator(".script-item .ant-select").first().click();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    expect((await state())[0].source).toBe("provided");
    const firstText = (await page.$$('[aria-label="Item text"]'))[0];
    await firstText.evaluate((el) => (el as HTMLTextAreaElement).select());
    await page.keyboard.press("Backspace");
    await firstText.type("Opening words");
    expect((await state())[0].text).toBe("Opening words");
    await expect(page.locator('[aria-label="Show subtitles on screen"]')).toHaveCount(0);
    await expect(page.locator('[aria-label="Narration"]')).toHaveCount(0);
    await expect(page.locator('[aria-label="Speech language"]')).toHaveCount(0);
    await expect(page.locator('[aria-label="Narrator voice"]')).toHaveCount(0);
    expect((await state())[0].showSubtitles).toBe(true);
    expect((await state())[1].showSubtitles).toBe(false);
    const end = (await page.$$('[aria-label="End (seconds)"]'))[0];
    await end.click();
    await end.evaluate((el) => (el as HTMLInputElement).select());
    await page.keyboard.press("Backspace");
    await end.type("1.5");
    await end.press("Tab");
    expect((await state())[0].endSeconds).toBe(1.5);
    await page.locator('[aria-label="Move item down"]').first().click();
    expect((await state())[0].id).toBe("voice");
    expect((await state())[1].id).toBe("opening");
    await page.locator("#save").first().click();
    const add = await page.getByText("Add script item", { exact: true });
    await add!.click();
    expect(await state()).toHaveLength(3);
    await page.locator("#restore").first().click();
    expect(await state()).toHaveLength(2);
    expect((await state())[1].endSeconds).toBe(1.5);
    await page.waitForFunction(
      () =>
        Number(
          (document.querySelectorAll('[aria-label="End (seconds)"]')[1] as HTMLInputElement).value,
        ) === 1.5,
    );
    expect(
      await page
        .locator('[aria-label="End (seconds)"]')
        .evaluateAll((elements) => elements.map((el) => Number((el as HTMLInputElement).value))),
    ).toEqual([4, 1.5]);
    expect((await state())[0].speech).toMatchObject({
      engine: "pocket-tts",
      voice: "pocket_eve",
      language: "en",
      volume: 0.8,
    });
    await page.screenshot({ path: path.join(cacheDir, "script-items-ui.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 1100 });
    expect(
      await page
        .locator(".script-item")
        .first()
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    const layout = await page
      .locator(".script-item")
      .first()
      .evaluate((element) => {
        const text = element.querySelector(".script-item-text")!.getBoundingClientRect();
        const timing = element.querySelector(".script-item-timing")!.getBoundingClientRect();
        const actions = element.querySelector(".ant-card-extra")!.getBoundingClientRect();
        return {
          textBelowTiming: text.top > timing.bottom,
          actionsAboveTiming: actions.bottom < timing.top,
        };
      });
    expect(layout).toEqual({ textBelowTiming: true, actionsAboveTiming: true });
    await page.screenshot({
      path: path.join(cacheDir, "script-items-mobile.png"),
      fullPage: true,
    });
    const remove = await page.getByRole("button", { name: "Remove item", exact: true }).first();
    await remove!.click();
    expect(await state()).toHaveLength(1);
    expect((await state())[0].id).toBe("opening");
    expect(errors).toEqual([]);
  } finally {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});
