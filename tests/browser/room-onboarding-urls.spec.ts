import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createBrowserFixtureServer } from "../fixtures/browser-fixture-server";
import { expect } from "@playwright/test";
import { test } from "../fixtures/playwright-test";

test("edits website URLs in their section independently from the reply", async ({ page }) => {
  test.setTimeout(60_000);
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "onboarding-urls-"));
  const server = await createBrowserFixtureServer({
    cacheDir,

    plugins: [
      {
        name: "onboarding-urls-fixture",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url !== "/onboarding-urls-test") return next();
            const html = await server.transformIndexHtml(
              req.url,
              `<!doctype html><div id="root"></div><script type="module">
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{RoomOnboarding}from'/src/client/room/room-onboarding.tsx';
import{emptyRoomDraft}from'/src/client/room/onboarding.ts';
function App(){const[draft,setDraft]=useState({...emptyRoomDraft(),step:4,stepLayout:'separate-video',request:{instructions:'An example film',urls:[]}});return React.createElement(React.Fragment,null,React.createElement(RoomOnboarding,{draft,onChange:setDraft,materials:[],styles:[],examples:[],onCreated(){},onUpload:async()=>[]}),React.createElement('output',{id:'state'},JSON.stringify(draft)));}
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
    await page.goto(`${server.resolvedUrls!.local[0]}onboarding-urls-test`);
    await page.locator(".room-website-items").first().waitFor({ state: "attached" });
    const addUrl = () =>
      page.evaluate(() => {
        [...document.querySelectorAll("button")]
          .find((el) => el.textContent === "Add URL")!
          .click();
      });
    await addUrl();
    await page
      .locator('[aria-label="Website URL 1"]')
      .first()
      .pressSequentially("https://example.com");
    await addUrl();
    await page
      .locator('[aria-label="Website URL 2"]')
      .first()
      .pressSequentially("https://example.org");
    await page
      .locator('[aria-label="Answer the assistant"] textarea')
      .first()
      .pressSequentially("Show the main journey.");
    const state = await page
      .locator("#state")
      .first()
      .evaluate((el) => JSON.parse(el.textContent!));
    expect(state.request.urls).toEqual(["https://example.com", "https://example.org"]);
    expect(state.request.requirements.urls.instructions).toBe("Show the main journey.");
    expect(
      await page
        .locator('[aria-label="Website URL 1"]')
        .first()
        .evaluate((el) => Boolean(el.closest("section.room-materials"))),
    ).toBe(true);
    for (let index = 0; index < 3; index++) await addUrl();
    await expect(page.locator('[type="url"]')).toHaveCount(5);
    expect(
      await page
        .locator(".room-website-items > button")
        .first()
        .evaluate((el) => (el as HTMLButtonElement).disabled),
    ).toBe(true);
    await page.locator('[aria-label="Remove URL 2"]').first().click();
    await expect(page.locator('[type="url"]')).toHaveCount(4);
    expect(
      await page
        .locator(".room-website-items > button")
        .first()
        .evaluate((el) => (el as HTMLButtonElement).disabled),
    ).toBe(false);
    const removed = await page
      .locator("#state")
      .first()
      .evaluate((el) => JSON.parse(el.textContent!));
    expect(removed.request.urls).toEqual(["https://example.com", "", "", ""]);
    await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find(
        (el) => el.textContent === "Continue",
      );
      button?.click();
    });
    await page.waitForFunction(
      () => JSON.parse(document.querySelector("#state")!.textContent!).step === 5,
    );
    expect(errors).toEqual([]);
  } finally {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});
