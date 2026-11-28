import { readFile, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createBrowserFixtureServer } from "../fixtures/browser-fixture-server";
import { expect } from "@playwright/test";
import { test } from "../fixtures/playwright-test";
import { appRoot } from "../../src/server/runtime/config";

test("unloads offscreen media and window bodies", async ({ page }) => {
  test.setTimeout(60000);
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "viewport-vite-"));
  const server = await createBrowserFixtureServer({
    cacheDir,

    plugins: [
      {
        name: "viewport-resources-fixture",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url !== "/viewport-test") return next();
            const html = await server.transformIndexHtml(
              req.url,
              `
<style>
#gallery { height:210px;width:340px;overflow:auto; }
.example-media {width:320px;height:180px;position:relative}.example{width:100%;height:100%;object-fit:contain}
#desktop {position:relative;height:240px;width:700px;overflow:hidden}
.room-window {position:absolute;background:white}.room-window-content{height:160px;overflow:auto}
</style><div id="root"></div><script type="module">
import React,{useState,useRef} from 'react';import{createRoot}from'react-dom/client';
import{StyleExampleMedia}from'/src/client/style-card.tsx';
import{RoomWindow}from'/src/client/room/room-window.tsx';
function App(){const[enabled,setEnabled]=useState(true);const[shown,setShown]=useState(false);const[value,setValue]=useState('Saved draft');const desktop=useRef(null);
const state={id:'test',x:shown?0:2000,y:0,width:400,height:220,minimized:false,maximized:false};
return React.createElement(React.Fragment,null,
React.createElement('button',{id:'toggle',onClick:()=>setEnabled(v=>!v)},'Toggle demos'),
React.createElement('div',{id:'gallery'},React.createElement(StyleExampleMedia,{styleId:'first',video:'preview.webm',playbackEnabled:enabled}),React.createElement('div',{style:{height:700}}),React.createElement(StyleExampleMedia,{styleId:'last',video:'preview.webm',playbackEnabled:enabled})),
React.createElement('button',{id:'window-toggle',onClick:()=>setShown(v=>!v)},'Toggle window'),
React.createElement('div',{id:'desktop',ref:desktop},React.createElement(RoomWindow,{state,display:state,title:'Test window',desktop,area:{width:2500,height:240},onChange(){},onFocus(){},focused:true,layer:2},React.createElement('input',{'aria-label':'Saved window draft',value,onChange:e=>setValue(e.target.value)}),React.createElement('div',{style:{height:500}},'Window contents'))));}
createRoot(document.getElementById('root')).render(React.createElement(App));
</script>`,
            );
            res.setHeader("Content-Type", "text/html");
            res.end(html);
          });
        },
      },
    ],
  });
  try {
    const clip = await readFile(path.join(appRoot, "assets/style-previews/style-001.webm"));
    await server.listen();
    await page.setViewportSize({ width: 1100, height: 1000 });
    await page.route("**/*", (route) => {
      if (
        route.request().url().includes("/api/examples/") &&
        route.request().url().includes("/video")
      )
        return route.fulfill({ status: 200, contentType: "video/webm", body: clip });
      else if (route.request().url().includes("/api/examples/"))
        return route.fulfill({
          status: 200,
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"/>',
        });
      else return route.fallback();
    });
    await page.goto(`${server.resolvedUrls!.local[0]}viewport-test`);
    await page.waitForFunction(
      () =>
        document.querySelectorAll("video").length === 1 && !document.querySelector("video")!.paused,
    );
    expect(
      await page
        .locator("video")
        .first()
        .evaluate((video) => (video as HTMLVideoElement).src),
    ).toContain("/first/video");
    await page
      .locator("#gallery")
      .first()
      .evaluate((gallery) => (gallery.scrollTop = gallery.scrollHeight));
    await page.waitForFunction(
      () =>
        document.querySelectorAll("video").length === 1 &&
        document.querySelector("video")!.src.includes("/last/video"),
    );
    await page.locator("#toggle").first().click();
    await page.waitForFunction(() => !document.querySelector("video"));
    await page.locator("#toggle").first().click();
    await page.locator("video").first().waitFor({ state: "attached" });
    await page
      .locator("#gallery")
      .first()
      .evaluate((gallery) => (gallery.scrollTop = 0));
    await page.waitForFunction(() => document.querySelector("video")?.src.includes("/first/video"));
    await expect(page.locator('[aria-label="Saved window draft"]')).toHaveCount(0);
    await page.locator("#window-toggle").first().click();
    await page.locator('[aria-label="Saved window draft"]').first().waitFor({ state: "attached" });
    await page.getByRole("textbox", { name: "Saved window draft" }).fill("Saved draft stays");
    await page
      .locator(".room-window-content")
      .first()
      .evaluate((content) => {
        content.scrollTop = 130;
        content.dispatchEvent(new Event("scroll", { bubbles: true }));
      });
    await page.locator("#window-toggle").first().click();
    await page.waitForFunction(() => !document.querySelector('[aria-label="Saved window draft"]'));
    await page.locator("#window-toggle").first().click();
    await page.locator('[aria-label="Saved window draft"]').first().waitFor({ state: "attached" });
    expect(
      await page
        .locator('[aria-label="Saved window draft"]')
        .first()
        .evaluate((el) => (el as HTMLInputElement).value),
    ).toBe("Saved draft stays");
    await page.waitForFunction(
      () => document.querySelector(".room-window-content")?.scrollTop === 130,
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await page.locator(".example").first().waitFor({ state: "attached" });
    await expect(page.locator("video")).toHaveCount(0);
  } finally {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});
