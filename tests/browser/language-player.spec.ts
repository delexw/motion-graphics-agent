import { expect } from "@playwright/test";
import { restrictBrowserRequests, test } from "../fixtures/playwright-test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createBrowserFixtureServer } from "../fixtures/browser-fixture-server";
import { command } from "../../src/server/runtime/process";

test("switches audio without losing position and preserves authored subtitles and switches downloads", async ({
  browser,
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 800, height: 600 });
  const folder = await mkdtemp(path.join(os.tmpdir(), "language-player-"));
  const file = path.join(folder, "sample.mp4");
  const signal = AbortSignal.timeout(90000);
  await command(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=320x180:r=12:d=20",
      "-f",
      "lavfi",
      "-i",
      "sine=duration=20",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-pix_fmt",
      "yuv420p",
      file,
    ],
    folder,
    signal,
  );
  const video = await readFile(file);
  const server = await createBrowserFixtureServer({
    cacheDir: path.join(folder, "cache"),

    plugins: [
      {
        name: "language-fixture",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url === "/api/setup" || req.url?.startsWith("/api/speech/status")) {
              res.setHeader("content-type", "application/json");
              res.end(
                JSON.stringify({
                  languageTracksSupported: true,
                  available: true,
                  detail: "Test voice ready",
                }),
              );
              return;
            }
            if (req.url?.endsWith(".mp4")) {
              res.setHeader("content-type", "video/mp4");
              res.setHeader("accept-ranges", "bytes");
              const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || "");
              if (range) {
                const start = Number(range[1]),
                  end = range[2] ? Math.min(Number(range[2]), video.length - 1) : video.length - 1;
                res.statusCode = 206;
                res.setHeader("content-range", `bytes ${start}-${end}/${video.length}`);
                res.setHeader("content-length", end - start + 1);
                res.end(video.subarray(start, end + 1));
              } else {
                res.setHeader("content-length", video.length);
                res.end(video);
              }
              return;
            }
            if (req.url?.endsWith(".vtt")) {
              res.setHeader("content-type", "text/vtt");
              res.end("WEBVTT\n\n1\n00:00:00.000 --> 00:00:04.000\nExample subtitle\n");
              return;
            }
            if (req.url !== "/test") return next();
            res.setHeader("content-type", "text/html");
            res.end(
              await server.transformIndexHtml(
                req.url,
                `<div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';
import{VideoPlayer}from'/src/client/components/video-player.tsx';import{LanguageMediaDownloads}from'/src/client/components/language-media-downloads.tsx';
import'/src/client/framework.css';
import{ScriptItems}from'/src/client/components/script-items.tsx';import{LanguageTrackSettings}from'/src/client/components/language-track-settings.tsx';import{VideoLanguageControl}from'/src/client/components/video-language-control.tsx';import{VideoRequestSchema}from'/src/shared/domains/video.ts';
const media={narration:['en','zh'].map(language=>({language,video:'/'+language+'.mp4',audio:'/'+language+'.wav',mix:'/'+language+'.m4a'})),subtitles:['en','zh'].map(language=>({language,vtt:'/'+language+'.vtt',srt:'/'+language+'.srt'})),musicVideo:'/music.mp4',defaultNarration:'en',defaultSubtitle:'zh'};
function Page(){const[request,setRequest]=React.useState(VideoRequestSchema.parse({instructions:'Explain an example process',outputLanguage:'en',scriptItems:[{id:'spoken',text:'Example words',startSeconds:0,endSeconds:3,showSubtitles:true,speech:{mode:'narration',voice:'af_heart'}}]}));return React.createElement(React.Fragment,null,React.createElement(VideoPlayer,{src:'/sample.mp4','aria-label':'Example film',languageMedia:media}),React.createElement(LanguageMediaDownloads,{media,downloadName:"example-style-v7"}),React.createElement(LanguageTrackSettings,{request,onChange:languageTracks=>setRequest({...request,languageTracks})}),React.createElement(ScriptItems,{items:request.scriptItems,duration:request.duration,languageTracks:request.languageTracks,onChange:scriptItems=>setRequest({...request,scriptItems})}),React.createElement(VideoLanguageControl,{value:request.outputLanguage,onChange:outputLanguage=>setRequest({...request,outputLanguage})}),React.createElement('pre',{id:'request'},JSON.stringify(request)));}createRoot(document.getElementById('root')).render(React.createElement(Page));
</script>`,
              ),
            );
          });
        },
      },
    ],
  });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === "string") throw Error("No test address");
  try {
    await page.goto(`http://127.0.0.1:${address.port}/test`);
    await page.waitForFunction(() => (document.querySelector("video")?.readyState ?? 0) >= 1);
    const showPlaybackControls = async () => {
      await page.locator(".kiteva-video-player").hover();
      await expect(page.locator(".kiteva-playback-overlay")).toHaveCSS("opacity", "1");
    };
    // Shared controls overlay the media instead of adding height below it.
    await page.mouse.move(799, 599);
    await page.waitForFunction(
      () => getComputedStyle(document.querySelector(".kiteva-playback-overlay")!).opacity === "0",
    );
    expect(
      await page
        .locator(".kiteva-video-player")
        .first()
        .evaluate((player) => {
          const video = player.querySelector("video")!.getBoundingClientRect();
          const bar = player.querySelector(".kiteva-playback-bar")!.getBoundingClientRect();
          return {
            sameHeight: Math.abs(player.getBoundingClientRect().height - video.height) < 1,
            barInside: bar.bottom <= video.bottom + 1 && bar.top >= video.top,
          };
        }),
    ).toEqual({ sameHeight: true, barInside: true });
    await page.locator(".kiteva-video-player").first().hover();
    await page.waitForFunction(
      () => getComputedStyle(document.querySelector(".kiteva-playback-overlay")!).opacity === "1",
    );
    await page.mouse.move(799, 599);
    await page.waitForFunction(
      () => getComputedStyle(document.querySelector(".kiteva-playback-overlay")!).opacity === "0",
    );
    await page.locator('[aria-label="Play video"]').first().focus();
    await page.keyboard.press("Tab");
    await page.waitForFunction(
      () => getComputedStyle(document.querySelector(".kiteva-playback-overlay")!).opacity === "1",
    );
    await page.evaluate(() => (document.activeElement as HTMLElement).blur());
    await page.evaluate(() => {
      document.querySelector("video")!.currentTime = 1.25;
    });
    await page.waitForFunction(
      () =>
        Math.abs((document.querySelector("video")?.currentTime ?? 0) - 1.25) < 0.05 &&
        !document.querySelector("video")?.seeking,
    );
    await page
      .locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden)")
      .first()
      .waitFor({ state: "hidden" });
    await showPlaybackControls();
    await page.getByRole("combobox", { name: "Narration language", exact: true }).click();
    await page
      .locator(
        '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option[title="简体中文"]',
      )
      .first()
      .waitFor({ state: "visible" });
    await page
      .locator(
        '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option[title="简体中文"]',
      )
      .click();
    await page.waitForFunction(
      () =>
        document.querySelector("video")?.currentSrc.endsWith("/zh.mp4") &&
        (document.querySelector("video")?.readyState ?? 0) >= 1,
    );
    await page.waitForFunction(
      () =>
        Math.abs((document.querySelector("video")?.currentTime ?? 0) - 1.25) < 0.05 &&
        !document.querySelector("video")?.seeking,
    );
    expect(
      await page
        .locator("video")
        .first()
        .evaluate((v) => (v as HTMLVideoElement).currentTime),
    ).toBeCloseTo(1.25, 1);
    expect(
      await page
        .locator("video")
        .first()
        .evaluate((v) => (v as HTMLVideoElement).paused),
    ).toBe(true);
    await page.evaluate(() => {
      document.querySelector("video")!.currentTime = 0.5;
    });
    await showPlaybackControls();
    await page.getByRole("button", { name: "Play video", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector("video")?.paused);
    await page
      .locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden)")
      .first()
      .waitFor({ state: "hidden" });
    await showPlaybackControls();
    const narrationLanguage = page.getByRole("combobox", {
      name: "Narration language",
      exact: true,
    });
    await narrationLanguage.click();
    await expect(narrationLanguage).toHaveAttribute("aria-expanded", "true");
    await narrationLanguage.press("ArrowUp");
    await expect(
      page.locator(
        '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-active[title="English"]',
      ),
    ).toBeVisible();
    await narrationLanguage.press("Enter");
    await page.waitForFunction(
      () =>
        document.querySelector("video")?.currentSrc.endsWith("/en.mp4") &&
        !document.querySelector("video")?.paused &&
        (document.querySelector("video")?.currentTime ?? 0) >= 0.5,
    );
    await page.locator('[aria-label="Pause video"]').first().click();
    await page
      .locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden)")
      .first()
      .waitFor({ state: "hidden" });
    await expect(page.locator('[aria-label="Subtitle language"]')).toHaveCount(0);
    expect(
      await page.locator('video track[kind="subtitles"]').evaluateAll((tracks) => tracks.length),
    ).toBe(0);
    expect(
      await page
        .locator("video")
        .first()
        .evaluate((v) => (v as HTMLVideoElement).currentSrc),
    ).toContain("/en.mp4");
    await page
      .locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden)")
      .first()
      .waitFor({ state: "hidden" });
    await page.locator('[aria-label="Download narration language"]').first().click();
    await page
      .locator(
        '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option[title="简体中文"]',
      )
      .first()
      .waitFor({ state: "visible" });
    await page
      .locator(
        '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option[title="简体中文"]',
      )
      .click();
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll("a")).some(
        (a) =>
          a.getAttribute("aria-label") === "Download MP4" && a.getAttribute("href") === "/zh.mp4",
      ),
    );
    await page
      .locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden)")
      .first()
      .waitFor({ state: "hidden" });
    expect(
      await page
        .locator('a[href="/zh.mp4"]')
        .first()
        .evaluate((a) => a.getAttribute("download")),
    ).toBe("example-style-v7-zh.mp4");
    expect(
      await page
        .locator('a[href="/zh.m4a"]')
        .first()
        .evaluate((a) => a.getAttribute("download")),
    ).toBe("example-style-v7-zh-mix.m4a");
    await page.locator('[aria-label="Download audio type"]').first().click();
    await page
      .locator(
        '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option[title="Narration only"]',
      )
      .first()
      .waitFor({ state: "visible" });
    await page
      .locator(
        '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option[title="Narration only"]',
      )
      .click();
    expect(
      await page
        .locator("a")
        .evaluateAll((links) =>
          links
            .find((a) => a.getAttribute("aria-label") === "Download audio")
            ?.getAttribute("href"),
        ),
    ).toBe("/zh.wav");
    expect(
      await page
        .locator('a[href="/zh.wav"]')
        .first()
        .evaluate((a) => a.getAttribute("download")),
    ).toBe("example-style-v7-zh-voice.wav");
    await page
      .locator('section[aria-label="Narration voice en"]')
      .first()
      .waitFor({ state: "attached" });
    await expect(page.locator('[aria-label="Multiple language tracks"]')).toHaveCount(0);
    await expect(page.locator('.script-items [aria-label="Speech language"]')).toHaveCount(0);
    await expect(page.locator('[aria-label="Default language"]')).toHaveCount(0);
    await expect(page.locator('[aria-label="Subtitles when playback starts"]')).toHaveCount(0);
    const order = await page
      .locator(".language-track-settings")
      .first()
      .evaluate((el) => {
        const card = el.querySelector(".language-track-voice")!;
        return Boolean(
          card.compareDocumentPosition(el.querySelector(".language-track-add")!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        );
      });
    expect(order).toBe(true);
    await page.locator('[aria-label="Add language"]').first().click();
    await page
      .locator(
        '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option[title="简体中文"]',
      )
      .click();
    await page.keyboard.press("Escape");
    await page
      .locator('[aria-label="Generate narration zh"]')
      .first()
      .waitFor({ state: "attached" });
    const added = await page
      .locator("#request")
      .first()
      .evaluate((el) => JSON.parse(el.textContent!));
    expect(added.languageTracks.subtitles).toEqual(["en"]);
    expect(
      added.languageTracks.narration.map((track: { language: string }) => track.language),
    ).toEqual(["en"]);
    await expect(page.locator('section[aria-label="Narration voice zh"]')).toHaveCount(0);
    await page.locator('[aria-label="Generate narration zh"]').first().click();
    await page.locator('[aria-label="Show subtitles on screen zh"]').first().click();
    await page.waitForFunction(() =>
      JSON.parse(
        document.querySelector("#request")!.textContent!,
      ).languageTracks.subtitles.includes("zh"),
    );
    const request = await page
      .locator("#request")
      .first()
      .evaluate((el) => JSON.parse(el.textContent!));
    expect(request.languageTracks.narration[0].language).toBe("en");
    expect(request.outputLanguage).toBe("en");
    expect(request.languageTracks.subtitles).toEqual(["en", "zh"]);
    expect(
      request.languageTracks.narration.map((track: { language: string }) => track.language),
    ).toEqual(["en", "zh"]);
    await expect(page.locator('.script-items [aria-label="Speech language"]')).toHaveCount(0);
    await expect(page.locator('.script-items [aria-label="Narrator voice"]')).toHaveCount(0);
    await expect(page.locator('.script-items [aria-label="Narration"]')).toHaveCount(0);
    await expect(page.locator('.script-items [aria-label="Show subtitles on screen"]')).toHaveCount(
      0,
    );
    await expect(page.locator('[aria-label="Add language"]').first()).toBeAttached();
    await page.locator('[aria-label="Remove language en"]').first().click();
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector("#request")!.textContent!).languageTracks.narration
          .length === 1,
    );
    const chinese = await page
      .locator("#request")
      .first()
      .evaluate((element) => JSON.parse(element.textContent!));
    expect(
      chinese.languageTracks.narration.map((track: { language: string }) => track.language),
    ).toEqual(["zh"]);
    expect(chinese.languageTracks.subtitles).toEqual(["zh"]);
    expect(chinese.languageTracks.defaultNarration).toBe("zh");
    expect(chinese.languageTracks.defaultSubtitle).toBe("zh");
    await page
      .locator('.language-track-settings [aria-label="Show subtitles on screen zh"]')
      .first()
      .click();
    const subtitleDisabled = await page
      .locator("#request")
      .first()
      .evaluate((element) => JSON.parse(element.textContent!));
    expect(subtitleDisabled.languageTracks.showSubtitles).toBe(false);
    expect(subtitleDisabled.languageTracks.defaultSubtitle).toBe("off");
    await expect(
      page.locator('section[aria-label="Narration voice en"] [aria-label="Speech mode"]'),
    ).toHaveCount(0);
    await (await page.$(".language-track-settings"))!.screenshot({
      path: path.join(folder, "language-tracks-browser.png"),
    });
    await (await page.$(".script-items"))!.screenshot({
      path: path.join(folder, "timed-script-inherited.png"),
    });
    await page.locator('[aria-label="Remove language zh"]').first().click();
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector("#request")!.textContent!).languageTracks.narration
          .length === 0,
    );
    await expect(page.locator('.script-items [aria-label="Speech language"]')).toHaveCount(0);
    await expect(page.locator('.script-items [aria-label="Narrator voice"]')).toHaveCount(0);
    await expect(page.locator('.script-items [aria-label="Narration"]')).toHaveCount(0);
    const touchContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      serviceWorkers: "block",
    });
    try {
      await restrictBrowserRequests(touchContext);
      const touchPage = await touchContext.newPage();
      await touchPage.goto(`http://127.0.0.1:${address.port}/test`);
      expect(await touchPage.evaluate(() => matchMedia("(hover: none)").matches)).toBe(true);
      await expect(touchPage.locator(".kiteva-playback-overlay")).toHaveCSS("opacity", "1");
    } finally {
      await touchContext.close();
    }
  } finally {
    await server.close();
    await rm(folder, { recursive: true, force: true });
  }
});
