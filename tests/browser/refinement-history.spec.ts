import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createBrowserFixtureServer } from "../fixtures/browser-fixture-server";
import { expect } from "@playwright/test";
import { test } from "../fixtures/playwright-test";
import { VideoRequestSchema } from "../../src/shared/domains/video";
import { RequestSchema, type Run } from "../../src/shared/contracts";

test("reviews requests, keeps unsaved choices across refreshes, and confirms version deletion", async ({
  page,
}) => {
  test.setTimeout(60000);
  const folder = await mkdtemp(path.join(os.tmpdir(), "refinement-review-"));
  const run: Run = {
    id: "example-project",
    createdAt: "2026-01-01",
    phase: "ready",
    request: RequestSchema.parse({
      instructions: "Explain a concept",
      outputLanguage: "zh",
      speech: { mode: "narration", engine: "kokoro", voice: "zf_xiaobei", language: "zh" },
    }),
    candidates: [],
    jobs: [1, 2, 3].map((n) => ({
      id: `v${n}`,
      runId: "example-project",
      candidateId: "direction",
      kind: "full",
      phase: n === 2 ? "cancelled" : "ready",
      sessionId: "builder",
      model: "example",
      duration: 20,
      workspace: "/unused",
      video: "film.mp4",
      ...(n > 1 ? { refinementPrompt: `Request ${n}` } : {}),
      ...(n === 3
        ? {
            effectiveRequest: VideoRequestSchema.parse({
              instructions: "Explain a concept",
              outputLanguage: "zh",
              speech: {
                mode: "narration",
                engine: "ming-tts",
                voice: "ming_xiaorou",
                language: "zh",
              },
              frameRate: 60,
              resolution: "1440p",
            }),
          }
        : {}),
    })),
  };
  const submissions: Record<string, unknown>[] = [];
  const server = await createBrowserFixtureServer({
    cacheDir: path.join(folder, "cache"),

    plugins: [
      {
        name: "review-fixture",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            res.setHeader("Content-Type", "application/json");
            if (req.url?.endsWith("/refine")) {
              let body = "";
              for await (const chunk of req) body += chunk;
              submissions.push(JSON.parse(body));
              res.end("{}");
              return;
            }
            if (req.url === "/api/runs/example-project") {
              res.end(JSON.stringify(run));
              return;
            }
            if (req.url?.startsWith("/api/")) {
              res.end("[]");
              return;
            }
            if (req.url !== "/review-test") return next();
            res.setHeader("Content-Type", "text/html");
            res.end(
              await server.transformIndexHtml(
                req.url,
                `<div id="root"></div><script type="module">
import '/src/client/style.css';
import '/src/client/room/room.css';
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{RoomProject}from'/src/client/room/room-project.tsx';
import{RevisionStack}from'/src/client/components/revision-stack.tsx';
import{fullRevisionGroups}from'/src/client/lib/revision-stack.ts';
import{preserveJobVersions,reserveJobVersion}from'/src/shared/job-versions.ts';
const h=React.createElement;
function App(){const[run,setRun]=useState(${JSON.stringify(run)});const[selected,setSelected]=useState();const[view,setView]=useState({tab:'full',refine:''});return h('main',null,
 h('button',{id:'refresh',onClick:()=>setRun(structuredClone(run))},'Refresh'),
 h('button',{id:'add',onClick:()=>{const next=structuredClone(run);next.jobs.push({...next.jobs[0],id:'next',version:reserveJobVersion(next,'direction')});setRun(next)}},'Add'),
 h(RoomProject,{run,onUpdated:setRun,view,onView:setView,events:[],renderFull:()=>null,renderPreview:()=>null,controls:null,onQuestion:()=>{},onEdit:()=>{},onCancel:()=>{},onRetry:()=>{}}),
 h('section',{'data-fixture':'revision-stack'},...fullRevisionGroups(run.jobs).map(group=>h(RevisionStack,{key:group.key,group,title:'Example',selectedJobId:selected,onSelect:setSelected,events:[],onDelete:async id=>{const next=structuredClone(run);preserveJobVersions(next);next.jobs=next.jobs.filter(job=>job.id!==id);next.deletedVersions=[{id,candidateId:'direction',version:2,deletedAt:new Date().toISOString()}];setRun(next)}},(job,slots)=>h('article',null,h('h3',null,job.id),slots.switcher))))) }
createRoot(document.getElementById('root')).render(h(App));</script>`,
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
    await page.goto(server.resolvedUrls!.local[0] + "review-test", { waitUntil: "commit" });
    await page
      .locator(".video-version-settings summary")
      .first()
      .waitFor({ state: "visible", timeout: 30_000 });
    await page.locator(".video-version-settings summary").click();
    expect(
      await page
        .locator(".video-version-settings")
        .first()
        .evaluate((node) => node.textContent),
    ).toContain("Ming-3.0-TTS");
    expect(
      await page
        .locator(".video-version-settings")
        .first()
        .evaluate((node) => node.textContent),
    ).toContain("灵小柔");
    const layout = await page.evaluate(() => {
      const settings = document.querySelector(".video-version-settings")!;
      const sender = document.querySelector(".room-refinement .ant-sender")!;
      const footer = document.querySelector(".room-refinement-footer")!;
      const upload = footer.querySelector(".refinement-images")!.getBoundingClientRect();
      const selector = footer
        .querySelector(".room-refinement-version-select")!
        .getBoundingClientRect();
      return {
        gap: sender.getBoundingClientRect().top - settings.getBoundingClientRect().bottom,
        footerDisplay: getComputedStyle(footer).display,
        aligned:
          Math.abs((upload.top + upload.bottom) / 2 - (selector.top + selector.bottom) / 2) < 2,
      };
    });
    expect(layout.gap).toBeGreaterThanOrEqual(12);
    expect(layout.footerDisplay).toBe("flex");
    expect(layout.aligned).toBe(true);
    await page
      .locator(".refinement-history-review .ant-collapse-header")
      .first()
      .waitFor({ state: "attached" });
    await page.locator(".refinement-history-review .ant-collapse-header").first().click();
    const checkbox = 'input[aria-label="Keep request from version 2"]';
    await page.locator(checkbox).first().waitFor({ state: "visible" });
    await page.locator(checkbox).click();
    await expect
      .poll(() =>
        page
          .locator(checkbox)
          .first()
          .evaluate((node) => (node as HTMLInputElement).checked),
      )
      .toBe(false);
    await page.locator("#refresh").first().click();
    expect(
      await page
        .locator(checkbox)
        .first()
        .evaluate((node) => (node as HTMLInputElement).checked),
    ).toBe(false);
    const sourceSelector = ".room-refinement-version-select";
    await page.locator(sourceSelector).click();
    await page.locator('.ant-select-dropdown .ant-select-item-option[title*="version 2"]').click();
    await expect
      .poll(() =>
        page
          .locator(sourceSelector)
          .first()
          .evaluate((node) => node.textContent),
      )
      .toMatch(/version 2.*Cancelled/);
    expect(
      await page
        .locator(".video-version-settings")
        .first()
        .evaluate((node) => node.textContent),
    ).toContain("Xiaobei");
    await page
      .locator('textarea[aria-label="Fine-tune instructions"]')
      .first()
      .pressSequentially("Keep the selected requests");
    await page.keyboard.press("Enter");
    await expect.poll(() => submissions.length).toBe(1);
    expect(submissions.at(-1)).toMatchObject({
      jobId: "v2",
      discardedRefinementJobIds: ["v2"],
    });
    const revisions = '[data-fixture="revision-stack"]';
    await page.locator(`${revisions} .revision-tab:has(input[value="v2"])`).click();
    await expect
      .poll(() =>
        page
          .locator(`${revisions} article h3`)
          .first()
          .evaluate((node) => node.textContent),
      )
      .toBe("v2");
    await page.locator(`${revisions} [aria-label="Delete version 2"]`).click();
    const confirm = ".ant-popconfirm:not(.ant-popover-hidden) .ant-btn-primary";
    await page.locator(confirm).first().waitFor({ state: "visible" });
    await page.locator(confirm).first().focus();
    await page.keyboard.press("Enter");
    await page
      .locator(`${revisions} [aria-label="Version 2 · Cancelled"]`)
      .first()
      .waitFor({ state: "hidden" });
    await expect(page.locator(checkbox)).toHaveCount(0);
    await page.locator("#add").first().click();
    await page
      .locator(`${revisions} [aria-label="Version 4 · Ready"]`)
      .first()
      .waitFor({ state: "attached" });
    await expect(
      page.locator(`${revisions} [aria-label="Version 3 · Ready"]`).first(),
    ).toBeAttached();
    expect(errors).toEqual([]);
  } finally {
    await server.close();
    await rm(folder, { recursive: true, force: true });
  }
});
