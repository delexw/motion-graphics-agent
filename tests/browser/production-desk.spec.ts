import type { ServerResponse } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createBrowserFixtureServer } from "../fixtures/browser-fixture-server";
import { expect } from "@playwright/test";
import { test } from "../fixtures/playwright-test";
import type { Storyboard } from "../../src/shared/agents/schemas/storyboard";
import { validStoryboard } from "../fixtures/storyboard";

test("inspects saved tracks in an inline read-only desk with playback, seek, zoom and missing-data recovery", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  const directory = await mkdtemp(path.join(os.tmpdir(), "production-desk-browser-"));
  const board: Storyboard = validStoryboard(3);
  board.scenes[0].beats[0].audio.effects = ["Paper sound"];
  const requests: string[] = [];
  const beatRequests: string[] = [];
  let heldBeatResponse: ServerResponse | undefined;
  const server = await createBrowserFixtureServer({
    cacheDir: directory,

    plugins: [
      {
        name: "production-desk-fixture",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url?.startsWith("/api/")) requests.push(req.method || "GET");
            if (req.url?.startsWith("/api/music-analysis/")) {
              beatRequests.push(req.url);
              const file = new URL(req.url, "http://localhost").searchParams.get("file") || "";
              res.setHeader("Content-Type", "application/json");
              if (file.includes("held")) {
                heldBeatResponse = res;
                return;
              }
              const status = file.includes("stale")
                ? "stale"
                : file.includes("missing")
                  ? "missing"
                  : file.includes("invalid")
                    ? "invalid"
                    : undefined;
              if (status) res.end(JSON.stringify({ status }));
              else if (file.includes("unavailable")) {
                res.statusCode = 503;
                res.end('{"error":"Unavailable"}');
              } else {
                const beatTimes = file.includes("dense")
                  ? Array.from({ length: 300 }, (_, index) => 0.005 + index * 0.01)
                  : file.includes("empty")
                    ? []
                    : [0.25, 0.75, 1.25, 1.75, 2.25, 2.75];
                res.end(
                  JSON.stringify({
                    status: "ready",
                    analysisFile: `${file}.beats.json`,
                    analysis: {
                      version: 1,
                      analyzer: "hyperframes beats",
                      sourceFile: file,
                      sourceSha256: "0".repeat(64),
                      count: beatTimes.length,
                      bpm: beatTimes.length ? 120 : null,
                      beatTimes,
                    },
                  }),
                );
              }
              return;
            }
            if (req.url?.endsWith("/authentication")) {
              res.setHeader("Content-Type", "application/json");
              res.end("[]");
              return;
            }
            if (req.url?.endsWith("/audio/narration.json")) {
              res.setHeader("Content-Type", "application/json");
              if (req.url.includes("/pending/")) {
                res.end(
                  JSON.stringify({
                    revision: "saved-revision",
                    track: {
                      file: "artifacts/assets/audio/score.wav",
                      durationSeconds: 3,
                      source: "narration",
                      cues: [
                        {
                          text: "Narration saved during generation",
                          startSeconds: 0.5,
                          endSeconds: 2,
                        },
                      ],
                    },
                    segments: [
                      {
                        id: "cue-1",
                        text: "Narration saved during generation",
                        startSeconds: 0.5,
                        file: "artifacts/assets/audio/score.wav",
                        sourceStartSeconds: 0,
                        durationSeconds: 1.5,
                      },
                    ],
                  }),
                );
              } else {
                res.statusCode = 404;
                res.end('{"error":"No narration"}');
              }
              return;
            }
            if (req.url?.endsWith("/production.json")) {
              res.setHeader("Content-Type", "application/json");
              if (req.url.includes("/pending/"))
                res.end(
                  JSON.stringify({
                    pipeline: "Multiplane",
                    fallbackReason: null,
                    sourceFile: "artifacts/shots/one.html",
                    duration: 3,
                    width: 320,
                    height: 180,
                    styleRenderer: ["HTML"],
                    motionEngine: ["Time"],
                    audioDescription: "Separate sources",
                    limitations: [],
                    audioFile: "unused-mix.wav",
                    audioTracks: [
                      {
                        id: "music",
                        kind: "music",
                        label: "Saved music source",
                        file: "artifacts/assets/audio/score.wav",
                        startSeconds: 0,
                        durationSeconds: 3,
                        volume: 1,
                      },
                      {
                        id: "effect",
                        kind: "sfx",
                        label: "Saved effect source",
                        file: "artifacts/assets/audio/score.wav",
                        startSeconds: 0.5,
                        durationSeconds: 0.25,
                        volume: 1,
                      },
                    ],
                  }),
                );
              else {
                res.statusCode = 404;
                res.end('{"error":"No production"}');
              }
              return;
            }
            if (req.url?.endsWith("/STORYBOARD.json")) {
              res.setHeader("Content-Type", "application/json");
              if (req.url.includes("/missing/")) {
                res.statusCode = 404;
                res.end('{"error":"No storyboard"}');
              } else res.end(JSON.stringify(board));
              return;
            }
            if (req.url?.endsWith("/full.webm")) {
              // Match the backend's native byte-range serving for browser seeking.
              req.url = "/assets/style-previews/style-136.webm";
              return next();
            }
            if (req.url && /\/score(?:-[a-z]+)?\.wav$/.test(req.url)) {
              req.url = "/assets/speech/ming-tts/original-narrator.wav";
              return next();
            }
            if (req.url?.endsWith("/broken.wav")) {
              res.statusCode = 404;
              res.end("No audio");
              return;
            }
            if (!req.url?.startsWith("/desk-fixture")) return next();
            res.setHeader("Content-Type", "text/html");
            res.end(
              await server.transformIndexHtml(
                req.url,
                `<!doctype html><style>body{background:#0f0d0b}</style><div id="root"></div><script type="module">
import '/src/client/style.css';import '/src/client/room/room.css';
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{ConfigProvider}from'antd';import{roomTheme}from'/src/client/theme.ts';
import{uiLanguage}from'/src/client/i18n/service.ts';
window.setFixtureLanguage=language=>uiLanguage.change(language);
import{VideoPlayer}from'/src/client/components/video-player.tsx';import{RoomProject}from'/src/client/room/room-project.tsx';import{RequestSchema}from'/src/shared/contracts.ts';
const missing=new URLSearchParams(location.search).has('missing');const pending=new URLSearchParams(location.search).has('pending');const id=missing?'missing':pending?'pending':'example';
const production={pipeline:'Multiplane',fallbackReason:null,sourceFile:'artifacts/shots/one.html',duration:3,width:320,height:180,fps:30,styleRenderer:['HTML'],motionEngine:['Time'],audioDescription:'Saved mix',audioFile:'artifacts/assets/audio/score.wav',limitations:[]};
if(location.search.includes('brokenAudio'))production.audioFile='artifacts/assets/audio/broken.wav';
if(location.search.includes('sourceTracks'))production.audioTracks=[{id:'music',kind:'music',label:'Music source',file:'artifacts/assets/audio/score.wav',startSeconds:0,durationSeconds:3,volume:1},{id:'hit',kind:'sfx',label:'Effect source',file:'artifacts/assets/audio/score.wav',startSeconds:0.5,durationSeconds:0.25,volume:1}];
const beatCase=new URLSearchParams(location.search).get('beatCase');
if(beatCase)production.audioTracks=[{id:'music-a',kind:'music',label:'First music placement',file:'artifacts/assets/audio/score-'+beatCase+'.wav',startSeconds:0,durationSeconds:beatCase==='repeated'?1.5:3,volume:1},...(beatCase==='repeated'?[{id:'music-b',kind:'music',label:'Second music placement',file:'artifacts/assets/audio/score-repeated.wav',startSeconds:1.5,durationSeconds:1.5,volume:1}]:[])];
const speechTrack={file:'artifacts/assets/audio/narration.wav',durationSeconds:3,source:'narration',cues:[{text:'Saved narration words',startSeconds:0.5,endSeconds:2}]};
const job={id:'full',runId:id,candidateId:'direction',kind:'full',phase:missing?'failed':pending?'generating':'ready',duration:3,workspace:'/tmp/fixture',model:'fixture',storyboardReady:true,...(!missing?{...(!pending?{production,video:'renders/full.webm',speechTrack}:{})}:{})};
const run={id,createdAt:'2026-01-01',phase:missing?'failed':'ready',request:RequestSchema.parse({instructions:'Example film'}),jobs:[job],candidates:[]};
function App(){const[view,setView]=useState({tab:'storyboard'});const noop=()=>{};return React.createElement(ConfigProvider,{theme:roomTheme},React.createElement('div',{hidden:true},React.createElement(VideoPlayer,{src:'/api/artifacts/example/full/full.webm',loop:true,'aria-label':'Background preview'}),React.createElement(VideoPlayer,{src:'/api/artifacts/example/full/full.webm',loop:true,muted:true,'aria-label':'Silent preview'})),React.createElement(RoomProject,{run,events:[],view,onView:setView,renderPreview:noop,renderFull:noop,onQuestion:noop,onUpdated:noop,onEdit:noop,onCancel:noop,onRetry:noop,controls:null}));}
createRoot(document.getElementById('root')).render(React.createElement(App));</script>`,
              ),
            );
          });
        },
      },
    ],
  });
  try {
    await server.listen();
    await page.setViewportSize({ width: 1280, height: 1000 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(`${server.resolvedUrls!.local[0]}desk-fixture`);
    await page.locator(".room-desk-open").first().waitFor({ state: "attached" });
    const order = await page
      .locator(".room-storyboard-actions button")
      .evaluateAll((buttons) => buttons.map((button) => button.textContent));
    expect(order).toEqual(["desk", "storyboard"]);
    await expect(page.locator(".room-storyboard-open svg")).toHaveCount(1);
    const originalUrl = page.url();
    const pages = context.pages().length;
    await page.evaluate(async () => {
      await document.querySelector<HTMLVideoElement>('[aria-label="Background preview"]')!.play();
      await document.querySelector<HTMLVideoElement>('[aria-label="Silent preview"]')!.play();
    });
    expect(
      await page
        .locator('[aria-label="Background preview"]')
        .first()
        .evaluate((el) => (el as HTMLVideoElement).paused),
    ).toBe(false);
    await page.locator(".room-desk-open").first().click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll(".desk-track").length === 4 &&
        document.querySelector<HTMLVideoElement>(".desk-preview video")!.readyState >= 2,
    );
    await page.waitForFunction(() => {
      const dialog = document.querySelector(".ant-modal")!;
      return (
        getComputedStyle(dialog).transform === "none" && getComputedStyle(dialog).opacity === "1"
      );
    });
    expect(
      await page
        .locator(".desk-readonly")
        .first()
        .evaluate((el) => el.textContent),
    ).toContain("Read only");
    expect(
      await page
        .locator(".desk-track-sfx .desk-clip")
        .first()
        .evaluate((el) => el.textContent),
    ).toContain("Planned");
    await expect(page.locator(".production-desk [draggable=true]")).toHaveCount(0);
    expect(
      await page
        .locator('[aria-label="Background preview"]')
        .first()
        .evaluate((el) => (el as HTMLVideoElement).paused),
    ).toBe(true);
    expect(
      await page
        .locator('[aria-label="Silent preview"]')
        .first()
        .evaluate((el) => (el as HTMLVideoElement).paused),
    ).toBe(false);
    await page
      .locator('.desk-track-music [data-waveform-status="ready"]')
      .first()
      .waitFor({ state: "attached" });
    expect(
      await page
        .locator(".audio-waveform > span")
        .first()
        .evaluate((el) => Boolean(el.firstElementChild?.shadowRoot?.querySelector("canvas"))),
    ).toBe(true);
    await page
      .locator('.desk-track-music [data-beat-status="ready"] .desk-beat-tick')
      .first()
      .waitFor({ state: "attached" });
    await expect(page.locator(".desk-beat-tick")).toHaveCount(6);
    await page.locator(".desk-track-music .desk-clip").first().click();
    expect(
      await page
        .locator(".desk-beat-inspector")
        .first()
        .evaluate((el) => el.textContent),
    ).toContain("120 BPM (estimated)");
    await page.locator('[aria-label="Next beat"]').click();
    await page.waitForFunction(
      () =>
        Math.abs(
          document.querySelector<HTMLVideoElement>(".desk-preview video")!.currentTime - 0.25,
        ) < 0.02,
    );
    await page.locator(".desk-track-music .desk-clip").first().focus();
    await page.keyboard.press("]");
    await page.waitForFunction(
      () =>
        Math.abs(
          document.querySelector<HTMLVideoElement>(".desk-preview video")!.currentTime - 0.75,
        ) < 0.02,
    );
    await page.keyboard.press("[");
    await page.waitForFunction(
      () =>
        Math.abs(
          document.querySelector<HTMLVideoElement>(".desk-preview video")!.currentTime - 0.25,
        ) < 0.02,
    );
    expect(
      await page
        .locator(".desk-beat-announcement")
        .first()
        .evaluate((el) => el.textContent),
    ).toContain("Beat 1 of 6");
    await page.locator(".desk-track-narration .desk-clip").first().click();
    expect(
      await page
        .locator(".desk-inspector")
        .first()
        .evaluate((el) => el.textContent),
    ).toContain("Saved narration words");
    expect(
      await page
        .locator(".desk-inspector")
        .first()
        .evaluate((el) => el.textContent),
    ).toContain("Measured speech cues");
    await page.locator(".desk-track-narration .desk-clip").first().dblclick();
    await page.waitForFunction(
      () =>
        Math.abs(
          document.querySelector<HTMLVideoElement>(".desk-preview video")!.currentTime - 0.5,
        ) < 0.1,
    );
    await page.locator('[aria-label="Desk playhead"]').first().focus();
    await page.keyboard.press("End");
    await page.waitForFunction(
      () => document.querySelector<HTMLVideoElement>(".desk-preview video")!.currentTime > 2.5,
    );
    await page.keyboard.press("Home");
    await page.waitForFunction(
      () => document.querySelector<HTMLVideoElement>(".desk-preview video")!.currentTime < 0.1,
    );
    await page.locator('.desk-transport [aria-label="Play movie"]').first().click();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLVideoElement>(".desk-preview video")!.currentTime > 0.15 &&
        !document.querySelector<HTMLVideoElement>(".desk-preview video")!.paused,
    );
    const playheadLag = await page.evaluate(async () => {
      const video = document.querySelector<HTMLVideoElement>(".desk-preview video")!;
      const lane = document.querySelector(".desk-track-sfx .desk-lane")!;
      const playhead = lane.querySelector(".desk-playhead")!;
      return new Promise<number>((resolve) => {
        let frames = 0;
        let largestLag = 0;
        const sample = () => {
          if (frames > 2) {
            const bounds = lane.getBoundingClientRect();
            const visibleTime =
              ((playhead.getBoundingClientRect().left - bounds.left) / bounds.width) * 3;
            largestLag = Math.max(largestLag, Math.abs(video.currentTime - visibleTime));
          }
          if (++frames < 30) requestAnimationFrame(sample);
          else resolve(largestLag);
        };
        requestAnimationFrame(sample);
      });
    });
    expect(playheadLag).toBeLessThan(0.045);
    expect(
      await page
        .locator("video")
        .evaluateAll(
          (media) =>
            media.filter(
              (video) => !(video as HTMLVideoElement).paused && !(video as HTMLVideoElement).muted,
            ).length,
        ),
    ).toBe(1);
    await page.locator('.desk-transport [aria-label="Pause movie"]').first().click();
    await page.locator('[aria-label="Zoom in"]').first().click();
    expect(
      await page
        .locator(".desk-timeline")
        .first()
        .evaluate((el) => (el as HTMLElement).style.minWidth),
    ).toBe("200%");
    await page.locator('[aria-label="Fit timeline"]').first().click();
    expect(
      await page
        .locator(".desk-timeline")
        .first()
        .evaluate((el) => (el as HTMLElement).style.minWidth),
    ).toBe("100%");
    await page.locator(".ant-modal-title").first().hover();
    await page.waitForFunction(
      () => getComputedStyle(document.querySelector(".ant-modal")!).transform === "none",
    );
    await page
      .locator(".dialog-body")
      .first()
      .evaluate((el) => {
        el.scrollTop = 0;
      });
    await page.screenshot({ path: path.join(directory, "production-desk.png") });
    expect(
      await page
        .locator(".desk-preview")
        .first()
        .evaluate((el) => el.getBoundingClientRect().height),
    ).toBeGreaterThan(400);
    expect(
      await page
        .locator(".desk-timeline-scroll")
        .first()
        .evaluate((el) => el.getBoundingClientRect().bottom),
    ).toBeGreaterThan(850);
    expect(
      await page
        .locator(".ant-modal-container")
        .first()
        .evaluate((el) => {
          const bounds = el.getBoundingClientRect();
          return Math.abs(bounds.height - (window.innerHeight - 32));
        }),
    ).toBeLessThan(2);
    expect(
      await page
        .locator(".ant-modal")
        .first()
        .evaluate((el) => {
          const bounds = el.getBoundingClientRect();
          return Math.abs(bounds.width - (window.innerWidth - 32));
        }),
    ).toBeLessThan(2);
    expect(
      await page
        .locator(".ant-modal")
        .first()
        .evaluate((el) => {
          const bounds = el.getBoundingClientRect();
          return Math.abs((bounds.top + bounds.bottom) / 2 - window.innerHeight / 2);
        }),
    ).toBeLessThan(16);
    expect(page.url()).toBe(originalUrl);
    expect(context.pages().length).toBe(pages);
    await page.setViewportSize({ width: 460, height: 1000 });
    expect(
      await page
        .locator(".production-desk")
        .first()
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await page.screenshot({ path: path.join(directory, "production-desk-mobile.png") });
    await page.locator(".ant-modal-close").first().click();
    await page.waitForFunction(() => !document.querySelector(".production-desk"));
    await expect(page.locator(".production-desk video")).toHaveCount(0);
    expect(
      await page
        .locator('[aria-label="Background preview"]')
        .first()
        .evaluate((el) => (el as HTMLVideoElement).paused),
    ).toBe(true);
    await page.goto(`${server.resolvedUrls!.local[0]}desk-fixture?missing`);
    await page.locator(".room-desk-open").first().click();
    await page.waitForFunction(() =>
      document
        .querySelector(".desk-notes")
        ?.textContent?.includes("Storyboard could not be loaded"),
    );
    expect(
      await page
        .locator(".desk-preview")
        .first()
        .evaluate((el) => el.textContent),
    ).toContain("No rendered video yet.");
    await expect(
      page.locator('.desk-transport [aria-label="Play movie"][disabled]').first(),
    ).toBeAttached();
    await expect(page.locator(".desk-track")).toHaveCount(4);
    await expect(page.locator(".desk-clip")).toHaveCount(0);
    await page.goto(`${server.resolvedUrls!.local[0]}desk-fixture?brokenAudio`);
    await page.locator(".room-desk-open").first().click();
    await page
      .locator('.desk-track-music [data-waveform-status="error"]')
      .first()
      .waitFor({ state: "attached" });
    expect(
      await page
        .locator(".audio-waveform")
        .first()
        .evaluate((el) => el.textContent),
    ).toContain("Waveform unavailable");
    await expect(page.locator(".desk-track")).toHaveCount(4);
    await page.goto(`${server.resolvedUrls!.local[0]}desk-fixture?sourceTracks`);
    await page.locator(".room-desk-open").first().click();
    await page
      .locator('.desk-track-sfx [data-waveform-status="ready"]')
      .first()
      .waitFor({ state: "attached" });
    await page
      .locator('.desk-track-music [data-waveform-status="ready"]')
      .first()
      .waitFor({ state: "attached" });
    await expect(page.locator(".desk-track-sfx .desk-clip-planned")).toHaveCount(0);
    await page.goto(`${server.resolvedUrls!.local[0]}desk-fixture?pending`);
    await page.locator(".room-desk-open").first().click();
    await page
      .locator('.desk-track-sfx [data-waveform-status="ready"]')
      .first()
      .waitFor({ state: "attached" });
    expect(
      await page
        .locator(".desk-track-sfx")
        .first()
        .evaluate((el) => el.textContent),
    ).toContain("Saved effect source");
    await expect(page.locator(".desk-track-sfx .desk-clip-planned")).toHaveCount(0);
    await page.waitForFunction(() =>
      document
        .querySelector(".desk-track-narration .desk-clip")
        ?.textContent?.includes("Narration saved during generation"),
    );
    await expect(
      page.locator('.desk-transport [aria-label="Play movie"][disabled]').first(),
    ).toBeAttached();
    await page.goto(`${server.resolvedUrls!.local[0]}desk-fixture?beatCase=repeated`);
    const readCount = beatRequests.length;
    await page.locator(".room-desk-open").first().click();
    await page.waitForFunction(() => document.querySelectorAll(".desk-beat-tick").length === 6);
    expect(beatRequests.length - readCount).toBe(1);
    const secondPlacement = '.desk-track-music .desk-clip[aria-label*="Second music placement"]';
    await page.locator(secondPlacement).click();
    await page
      .locator(`${secondPlacement}[aria-pressed="true"]`)
      .first()
      .waitFor({ state: "attached" });
    await page.locator('[aria-label="Go to start"]').click();
    await page.locator('[aria-label="Next beat"]').click();
    await page.waitForFunction(
      () =>
        Math.abs(
          document.querySelector<HTMLVideoElement>(".desk-preview video")!.currentTime - 1.75,
        ) < 0.02,
    );
    await page.setViewportSize({ width: 900, height: 1000 });
    await page.goto(`${server.resolvedUrls!.local[0]}desk-fixture?beatCase=dense`);
    await page.locator(".room-desk-open").first().click();
    await page
      .locator('.desk-track-music [data-beat-status="ready"]')
      .first()
      .waitFor({ state: "attached" });
    await expect(page.locator(".desk-beat-tick")).toHaveCount(0);
    expect(
      await page
        .locator(".desk-beat-state")
        .first()
        .evaluate((el) => el.textContent),
    ).toBe("Beats: zoom in");
    // A modal opening transform changes painted width without resizing the timeline.
    await page
      .locator(".production-desk")
      .first()
      .evaluate((desk) => ((desk as HTMLElement).style.scale = "0.2"));
    const zoomIn = '[aria-label="Zoom in"]';
    await page.locator(zoomIn).first().focus();
    for (const zoom of [2, 3, 4, 5, 6]) {
      await page.keyboard.press("Enter");
      await expect
        .poll(() =>
          page
            .locator(".desk-timeline")
            .first()
            .evaluate((el) => (el as HTMLElement).style.minWidth),
        )
        .toBe(`${zoom * 100}%`);
    }
    const beats = ".desk-track-music .desk-beat-strip";
    await page.waitForFunction(
      (selector) => {
        const strip = document.querySelector(selector)!;
        return strip.clientWidth > 1800 && strip.getBoundingClientRect().width < 1800;
      },
      beats,
      {},
    );
    await page
      .locator(".production-desk")
      .first()
      .evaluate((desk) => (desk as HTMLElement).style.removeProperty("scale"));
    await expect
      .poll(() => page.locator(`${beats} .desk-beat-tick`).evaluateAll((ticks) => ticks.length))
      .toBe(300);
    for (const [status, label] of [
      ["missing", "No beat analysis"],
      ["stale", "Beat analysis out of date"],
      ["invalid", "Beat analysis invalid"],
      ["unavailable", "Beat analysis unavailable"],
      ["empty", "No beats in this range"],
    ]) {
      await page.goto(`${server.resolvedUrls!.local[0]}desk-fixture?beatCase=${status}`);
      await page.locator(".room-desk-open").first().click();
      await page.waitForFunction(
        (expected) => document.querySelector(".desk-beat-state")?.textContent === expected,
        label,
        {},
      );
      await expect(page.locator(".desk-beat-tick")).toHaveCount(0);
    }
    await page.goto(`${server.resolvedUrls!.local[0]}desk-fixture?beatCase=ready`);
    await page.locator(".room-desk-open").first().click();
    await page
      .locator('.desk-track-music [data-beat-status="ready"]')
      .first()
      .waitFor({ state: "attached" });
    await page.locator(".desk-track-music .desk-clip").click();
    await page.locator('[aria-label="Next beat"]').first().waitFor({ state: "attached" });
    await page.evaluate(async () => {
      await Reflect.get(window, "setFixtureLanguage")("zh-CN");
    });
    await page.locator('[aria-label="下一拍"]').first().waitFor({ state: "attached" });
    expect(
      await page
        .locator(".desk-beat-inspector")
        .first()
        .evaluate((el) => el.textContent),
    ).toContain("估计");
    await page.goto(`${server.resolvedUrls!.local[0]}desk-fixture?beatCase=held`);
    await page.locator(".room-desk-open").first().click();
    await page.locator('[data-beat-status="loading"]').first().waitFor({ state: "attached" });
    await expect.poll(() => heldBeatResponse !== undefined).toBe(true);
    await page.locator(".ant-modal-close").first().click();
    await page.waitForFunction(() => !document.querySelector(".production-desk"));
    await expect.poll(() => heldBeatResponse?.destroyed).toBe(true);
    expect(requests.every((method) => method === "GET")).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
