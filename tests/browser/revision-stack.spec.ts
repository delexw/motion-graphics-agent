import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createBrowserFixtureServer } from "../fixtures/browser-fixture-server";
import { expect } from "@playwright/test";
import { test } from "../fixtures/playwright-test";

// Generic local fixture: one direction with a finished v1 and a building v2, plus a second
// direction. The card renderer records which job each action was rendered for.
const fixture = `<!doctype html><div id="root"></div><script type="module">
import '/src/client/style.css';
import '/src/client/room/room.css';
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{RevisionStack,useRevisionSelection}from'/src/client/components/revision-stack.tsx';
import{fullRevisionGroups}from'/src/client/lib/revision-stack.ts';
const h=React.createElement;
const base={runId:'project',kind:'full',workspace:'/unused',model:'example',duration:20};
const initial=[
  {...base,id:'a1',candidateId:'alpha',phase:'ready',video:'film.mp4',finishedAt:'2026-01-01T00:10:00Z'},
  {...base,id:'b1',candidateId:'beta',phase:'ready',video:'film.mp4',finishedAt:'2026-01-01T00:11:00Z'},
  {...base,id:'a2',candidateId:'alpha',phase:'rendering'},
];
const events=[{id:1,runId:'project',jobId:'a2',type:'render_progress',message:'Rendering',time:'2026-01-01T00:12:00Z',data:{renderer:'remotion',completed:2,total:5}}];
function Card(job,slots,record){
  return h('article',{className:'candidate studio-result-card','data-card':job.id},
    h('div',{className:'candidate-media',style:{aspectRatio:'16 / 9',background:'#222'}}),
    slots.strip,
    h('div',{className:'candidate-body'},
      h('div',{className:'candidate-heading'},
        h('div',{className:'candidate-heading-label'},h('h3',null,'Same look'),h('span',{className:'candidate-generated-at'},'Generated Jan 1, 2026, 12:00 PM')),
        h('div',{className:'delivery-links'},
          h('button',{className:'delivery-icon-button'},'ZIP'),
          h('button',{className:'download delivery-icon-button',onClick:()=>record('download:'+job.id)},'MP4'),
          h('button',{className:'storyboard delivery-icon-button',onClick:()=>record('storyboard:'+job.id)},'Story'))),slots.switcher));
}
function App(){
  const[jobs,setJobs]=useState(initial);const[calls,setCalls]=useState([]);
  const[selection,select]=useRevisionSelection();
  const record=(call)=>setCalls(p=>[...p,call]);
  return h(React.Fragment,null,h('main',{className:'room-preview-grid',style:{padding:12}},
    fullRevisionGroups(jobs).map(group=>h('section',{key:group.key},
      h(RevisionStack,{group,title:'Same look',selectedJobId:selection[group.key],onSelect:id=>select(group.key,id),events,
        onCancel:id=>record('cancel:'+id),onRetry:id=>record('retry:'+id)},(job,slots)=>Card(job,slots,record))))),
    h('button',{id:'finish',onClick:()=>setJobs(p=>p.map(j=>j.id==='a2'?{...j,phase:'ready',video:'film.mp4'}:j))},'Finish v2'),
    h('button',{id:'single',onClick:()=>setJobs(p=>p.filter(j=>j.candidateId==='alpha'))},'Only one direction'),
    h('button',{id:'more',onClick:()=>setJobs(p=>[...p,...['ready','failed','queued'].map((phase,index)=>({...base,id:'a'+(index+3),candidateId:'alpha',phase,video:phase==='ready'?'film.mp4':undefined}))])},'More revisions'),
    h('output',{id:'calls',hidden:true},JSON.stringify(calls)));
}
createRoot(document.getElementById('root')).render(h(App));</script>`;

test("keeps the playable revision selected, switches revisions and targets actions by job", async ({
  page,
}) => {
  test.setTimeout(60000);
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "revision-stack-"));
  const server = await createBrowserFixtureServer({
    cacheDir,

    plugins: [
      {
        name: "revision-stack-fixture",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url !== "/revision-stack-test") return next();
            res.setHeader("Content-Type", "text/html");
            res.end(await server.transformIndexHtml(req.url, fixture));
          });
        },
      },
    ],
  });
  try {
    await server.listen();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.setViewportSize({ width: 900, height: 900 });
    await page.goto(`${server.resolvedUrls!.local[0]}revision-stack-test`);
    await page
      .locator('[data-revision-stack="alpha"] [data-card]')
      .first()
      .waitFor({ state: "attached" });
    const alpha = '[data-revision-stack="alpha"]';
    const cardIds = () =>
      page
        .locator("[data-card]")
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-card")));
    const calls = async () =>
      JSON.parse(
        (await page
          .locator("#calls")
          .first()
          .evaluate((node) => node.textContent)) || "[]",
      );

    // One card per direction; v1 stays selected while v2 builds inside the same card.
    expect(await cardIds()).toEqual(["a1", "b1"]);
    expect(
      await page
        .locator(`${alpha} .revision-strip`)
        .first()
        .evaluate((node) => node.textContent),
    ).toContain("v2 · Building");
    await expect(page.locator(`[data-revision-stack="beta"] .revision-switcher`)).toHaveCount(0);

    // Strip stop targets v2; footer actions target the selected v1.
    expect(
      await page
        .locator(`${alpha} button[aria-label="Stop version 2"]`)
        .first()
        .evaluate((button) => {
          const styles = getComputedStyle(button),
            icon = button.querySelector("svg")!;
          return {
            border: styles.borderTopWidth,
            background: styles.backgroundColor,
            fill: icon.getAttribute("fill"),
            strokeWidth: icon.getAttribute("stroke-width"),
          };
        }),
    ).toEqual({
      border: "0px",
      background: "rgba(0, 0, 0, 0)",
      fill: "currentColor",
      strokeWidth: "0",
    });
    await page.locator(`${alpha} button[aria-label="Stop version 2"]`).first().click();
    await page.locator(`${alpha} .download`).first().click();
    expect(await calls()).toEqual(["cancel:a2", "download:a1"]);

    // A finished v2 never takes over the shown film; the strip offers it instead.
    await page.locator("#finish").first().click();
    await page.waitForFunction(
      (selector) => document.querySelector(selector)?.textContent?.includes("v2 · Ready"),
      `${alpha} .revision-strip`,
      {},
    );
    expect(await cardIds()).toEqual(["a1", "b1"]);

    // Explicit switch: the card, its actions and the strip follow the chosen job.
    const tabs = await page.$$(`${alpha} .revision-switcher-tabs .ant-radio-button-wrapper`);
    expect(tabs).toHaveLength(2);
    await tabs[1].click();
    await page.locator(`${alpha} [data-card="a2"]`).first().waitFor({ state: "attached" });
    await page.locator(`${alpha} .storyboard`).first().click();
    expect((await calls()).at(-1)).toBe("storyboard:a2");
    await expect(page.locator(`${alpha} .revision-strip`)).toHaveCount(0);

    // Keyboard: arrow keys on the radio group move between revisions.
    await page.locator(`${alpha} .revision-switcher-tabs input:checked`).first().focus();
    await page.keyboard.press("ArrowLeft");
    await page.locator(`${alpha} [data-card="a1"]`).first().waitFor({ state: "attached" });
    expect(
      await page
        .locator(`${alpha} .revision-switcher-tabs`)
        .first()
        .evaluate((node) => node.getAttribute("aria-label")),
    ).toBe("Versions of Same look");

    const firstCell = await page
      .locator(alpha)
      .first()
      .evaluate((node) => {
        const { width, x, y } = node.getBoundingClientRect();
        return { width, x, y };
      });
    await page.locator("#single").first().click();
    await page.waitForFunction(() => document.querySelectorAll("[data-card]").length === 1);
    expect(
      await page
        .locator(alpha)
        .first()
        .evaluate((node) => {
          const { width, x, y } = node.getBoundingClientRect();
          return { width, x, y };
        }),
    ).toEqual(firstCell);
    expect(firstCell.width).toBeLessThan(450);

    // Two version buttons still fit a normal mobile card.
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page
        .locator(`${alpha} .candidate-heading`)
        .first()
        .evaluate((heading) => {
          const title = heading.querySelector("h3")!.getBoundingClientRect();
          const actions = Array.from(heading.querySelectorAll(".delivery-icon-button")).map(
            (button) => button.getBoundingClientRect(),
          );
          return (
            actions.length === 3 &&
            actions.every((box) => box.top < title.bottom && box.bottom > title.top)
          );
        }),
    ).toBe(true);
    expect(
      await page
        .locator(`${alpha} .revision-switcher-tabs`)
        .first()
        .evaluate((node) => getComputedStyle(node).display),
    ).not.toBe("none");

    // Every version remains a button; narrow cards wrap instead of using a dropdown.
    await page.locator("#more").first().click();
    await page.waitForFunction(
      (selector) => document.querySelectorAll(`${selector} .revision-tab`).length === 5,
      alpha,
      {},
    );
    await expect(page.locator(`${alpha} [role="combobox"]`)).toHaveCount(0);
    expect(
      await page
        .locator(`${alpha} input[type="radio"]`)
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label"))),
    ).toEqual([
      "Version 1 · Ready",
      "Version 2 · Ready",
      "Version 3 · Ready",
      "Version 4 · Failed",
      "Version 5 · Queued",
    ]);
    // Force a narrow switcher while preserving the surrounding card layout.
    await page
      .locator(`${alpha} .revision-switcher`)
      .first()
      .evaluate((node) => node.setAttribute("style", "max-width:160px"));
    const rows = await page
      .locator(`${alpha} .revision-tab`)
      .evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().top)));
    expect(new Set(rows).size).toBeGreaterThan(1);
    expect(
      await page.locator(`${alpha} .revision-tab`).evaluateAll((nodes) =>
        nodes.every((node) => {
          const box = node.getBoundingClientRect(),
            parent = node.closest(".revision-switcher")!.getBoundingClientRect();
          return box.left >= parent.left - 1 && box.right <= parent.right + 1 && box.height > 0;
        }),
      ),
    ).toBe(true);
    await page.locator(`${alpha} .revision-tab:has(input[value="a4"])`).first().click();
    await page.locator(`${alpha} [data-card="a4"]`).first().waitFor({ state: "attached" });
    await page.locator(`${alpha} .download`).first().click();
    expect((await calls()).at(-1)).toBe("download:a4");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const media = await page
      .locator(`${alpha} .candidate-media`)
      .first()
      .evaluate((node) => {
        const box = node.getBoundingClientRect();
        return box.width / box.height;
      });
    expect(media).toBeCloseTo(16 / 9, 1);
    expect(errors).toEqual([]);
  } finally {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});
