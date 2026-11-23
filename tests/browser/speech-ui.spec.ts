import { mingVoices } from "../../src/shared/speech";
import { chooseRenderedSelectOption, nextSelectOption } from "../fixtures/select-options";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createBrowserFixtureServer } from "../fixtures/browser-fixture-server";
import { expect } from "@playwright/test";
import { test } from "../fixtures/playwright-test";

test("uses independent language profiles and preserves the shared script and voice choices", async ({
  page,
}) => {
  test.setTimeout(60000);
  const languageRequests: string[] = [];
  const previewRequests: Record<string, unknown>[] = [];
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "speech-ui-"));
  const server = await createBrowserFixtureServer({
    cacheDir,

    // Generated project HTML must not reload this isolated UI fixture.

    plugins: [
      {
        name: "speech-ui-fixture",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url === "/api/setup" || req.url?.startsWith("/api/speech/status")) {
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  languageTracksSupported: true,
                  available: true,
                  detail: "Local narration ready",
                }),
              );
              return;
            }
            if (req.url === "/api/room/localize") {
              languageRequests.push(req.url);
              res.statusCode = 500;
              res.end("Language changes must not start model calls");
              return;
            }
            if (req.url === "/api/speech/sample") {
              let body = "";
              for await (const chunk of req) body += chunk;
              previewRequests.push(JSON.parse(body));
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ url: "/sample.wav" }));
              return;
            }
            if (req.url !== "/speech-test") return next();
            const html = await server.transformIndexHtml(
              req.url,
              `<div id="root"></div><script type="module">
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{ConfigProvider,theme}from'antd';
import{RoomOnboarding}from'/src/client/room/room-onboarding.tsx';
import '/src/client/framework.css';import '/src/client/style.css';import{roomTheme,roomCssVariables,roomColors}from'/src/client/theme.ts';
function App(){const[draft,setDraft]=useState({step:4,stepLayout:'separate-speech',request:{instructions:'A concept introduction',candidateCount:2,selectedStyleIds:['style-056'],outputLanguage:'en',subtitles:{mode:'off'}}});return React.createElement(ConfigProvider,{theme:roomTheme},React.createElement('div',{style:{...roomCssVariables,padding:16,background:roomColors.inset,color:roomColors.text}},React.createElement('output',{id:'draft-state',hidden:true},JSON.stringify(draft)),React.createElement(RoomOnboarding,{draft,onChange:setDraft,materials:[],styles:[],examples:[],onCreated(){},onUpload:async()=>[]})));}createRoot(document.getElementById('root')).render(React.createElement(App));</script>`,
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
    await page.setViewportSize({ width: 900, height: 1100 });
    await page.goto(`${server.resolvedUrls!.local[0]}speech-test`);
    await page
      .locator('textarea[aria-label="Answer the assistant"]')
      .first()
      .waitFor({ state: "attached" });
    await expect(page.locator('[aria-label="Speech and vocals"]')).toHaveCount(0);
    await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll(".room-step-tabs button")).find(
        (item) => item.textContent === "Narration / subtitles",
      );
      (button as HTMLButtonElement).click();
    });
    await page.locator('[aria-label="Add language"]').first().waitFor({ state: "attached" });
    await expect(page.locator('[aria-label="Multiple language tracks"]')).toHaveCount(0);
    await expect(page.locator('[aria-label="Default language"]')).toHaveCount(0);
    await page.locator('[aria-label="Add language"]').click();
    await chooseRenderedSelectOption(
      page,
      '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option[title="English"]',
    );
    await page
      .locator('[aria-label="Generate narration en"]')
      .first()
      .waitFor({ state: "attached" });
    expect(
      await page
        .locator('[aria-label="Generate narration en"]')
        .first()
        .evaluate((el) => el.getAttribute("aria-checked")),
    ).toBe("false");
    expect(
      await page
        .locator('[aria-label="Show subtitles on screen en"]')
        .first()
        .evaluate((el) => el.getAttribute("aria-checked")),
    ).toBe("false");
    await expect(page.locator('section[aria-label="Narration voice en"]')).toHaveCount(0);
    await page.locator('[aria-label="Generate narration en"]').first().click();
    await page.locator('[aria-label="Show subtitles on screen en"]').first().click();
    await page.locator('[aria-label="Shared script"]').first().waitFor({ state: "attached" });
    await page
      .locator('[aria-label="Shared script"]')
      .first()
      .pressSequentially("Let your idea take flight.");
    await page
      .locator('section[aria-label="Narration voice en"]')
      .first()
      .waitFor({ state: "attached" });
    await expect(page.locator('[aria-label="Speech mode"]')).toHaveCount(0);
    await expect(page.locator('[aria-label="Speech language"]')).toHaveCount(0);
    await page.locator('[aria-label="Speech engine"]').first().click();
    await page.locator('.ant-select-item-option[title="Ming-3.0-TTS · 0.5B · Neutral"]').click();
    await page.locator('[aria-label="Narrator voice"]').first().click();
    await page.locator(".ant-select-item-option-grouped").first().waitFor({ state: "attached" });
    await page.locator(".speech-voice-control input").first().focus();
    let originalNarratorSelected = false;
    for (let index = 0; index <= mingVoices.length; index++) {
      const active = await page
        .locator(".ant-select-item-option-active.ant-select-item-option-grouped")
        .evaluateAll((items) => items[0]?.getAttribute("title"));
      if (active === "Original narrator") {
        originalNarratorSelected = true;
        break;
      }
      await nextSelectOption(page);
    }
    expect(originalNarratorSelected).toBe(true);
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector("#draft-state")!.textContent!).request.languageTracks
          .narration[0].speech.voice === "ming_original_female",
    );
    await page.locator(".speech-voice-control button").click();
    await expect
      .poll(() => previewRequests.at(-1))
      .toMatchObject({
        engine: "ming-tts",
        voice: "ming_original_female",
        language: "en",
      });
    await page.locator('[aria-label="Show subtitles on screen en"]').first().click();
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector("#draft-state")!.textContent!).request.languageTracks
          .showSubtitles === false,
    );
    const draft = await page
      .locator("#draft-state")
      .first()
      .evaluate((el) => JSON.parse(el.textContent!));
    expect(draft.request.languageTracks.showSubtitles).toBe(false);
    expect(draft.request.languageTracks.subtitles).toEqual([]);
    expect(
      await page
        .locator('[aria-label="Shared script"]')
        .first()
        .evaluate((el) => (el as HTMLTextAreaElement).value),
    ).toBe("Let your idea take flight.");
    expect(draft.request.languageTracks.narration[0].speech.voice).toBe("ming_original_female");
    expect(languageRequests).toEqual([]);
  } finally {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});
