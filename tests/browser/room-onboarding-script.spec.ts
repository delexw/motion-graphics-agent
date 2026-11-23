import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createBrowserFixtureServer } from "../fixtures/browser-fixture-server";
import { expect } from "@playwright/test";
import { test } from "../fixtures/playwright-test";

test("edits one script for narration and on-screen text", async ({ page }) => {
  test.setTimeout(60_000);
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "onboarding-script-"));
  const server = await createBrowserFixtureServer({
    cacheDir,

    plugins: [
      {
        name: "onboarding-script-fixture",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url === "/api/setup" || req.url?.startsWith("/api/speech/status")) {
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ languageTracksSupported: true, available: true }));
              return;
            }
            if (req.url !== "/onboarding-script-test") return next();
            const html = await server.transformIndexHtml(
              req.url,
              `<!doctype html><div id="root"></div><script type="module">
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{RoomOnboarding}from'/src/client/room/room-onboarding.tsx';
import{emptyRoomDraft}from'/src/client/room/onboarding.ts';
function App(){const[draft,setDraft]=useState({...emptyRoomDraft(),step:6,stepLayout:'separate-video',request:{instructions:'An example film',urls:[],subtitles:{mode:'provided',text:'Original words'},speech:{mode:'narration',source:'provided',text:'Original words'}}});return React.createElement(React.Fragment,null,React.createElement(RoomOnboarding,{draft,onChange:setDraft,materials:[],styles:[],examples:[],onCreated(){},onUpload:async()=>[]}),React.createElement('output',{id:'state'},JSON.stringify(draft)));}
createRoot(document.getElementById('root')).render(React.createElement(App));</script>`,
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
    await page.goto(`${server.resolvedUrls!.local[0]}onboarding-script-test`);
    await page.locator('[aria-label="Shared script"]').first().waitFor({ state: "attached" });
    await expect(page.locator('[aria-label="Shared script"]')).toHaveCount(1);
    await expect(page.locator('[aria-label="Narration script source"]')).toHaveCount(0);
    await expect(page.locator('[aria-label="Narration script"]')).toHaveCount(0);
    await page.locator('[aria-label="Shared script"]').first().click();
    await page
      .locator('[aria-label="Shared script"]')
      .first()
      .evaluate((el) => (el as HTMLTextAreaElement).select());
    await page.keyboard.press("Backspace");
    await page
      .locator('[aria-label="Shared script"]')
      .first()
      .pressSequentially("One shared script.");
    const state = await page
      .locator("#state")
      .first()
      .evaluate((el) => JSON.parse(el.textContent!));
    expect(state.request.subtitles).toEqual({ mode: "provided", text: "One shared script." });
    expect(state.request.speech).toMatchObject({
      source: "subtitles",
      text: "One shared script.",
    });
    await page.evaluate(() => {
      const label = [...document.querySelectorAll("label")].find((el) =>
        el.textContent?.includes("Show subtitles on screen"),
      );
      (label?.querySelector("button") as HTMLButtonElement)?.click();
    });
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector("#state")!.textContent!).request.languageTracks
          .showSubtitles === false,
    );
    const narrationOnly = await page
      .locator("#state")
      .first()
      .evaluate((el) => JSON.parse(el.textContent!));
    expect(narrationOnly.request.speech).toMatchObject({
      text: "One shared script.",
    });
    expect(narrationOnly.request.languageTracks.subtitles).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});
