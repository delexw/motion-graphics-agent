import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createBrowserFixtureServer } from "../fixtures/browser-fixture-server";
import { expect } from "@playwright/test";
import { test } from "../fixtures/playwright-test";
import { appRoot } from "../../src/server/runtime/config";
import { loadCatalog } from "../../src/server/catalog/catalog";
import { CatalogDisplayText } from "../../src/client/i18n/catalog-content";
import { technologyEntries } from "../../src/client/technology-pool-model";

test("switches catalogs and Governance, translates every motion and technology detail, and preserves project settings", async ({
  page,
}) => {
  test.setTimeout(120000);
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "ui-language-"));
  const mutations: string[] = [];
  const server = await createBrowserFixtureServer({
    cacheDir,

    plugins: [
      {
        name: "ui-language-fixture",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url?.startsWith("/api/")) {
              if (req.method !== "GET") mutations.push(req.url);
              res.setHeader("Content-Type", "application/json");
              res.end(
                req.url === "/api/motions"
                  ? JSON.stringify(
                      JSON.parse(
                        await readFile(
                          path.join(appRoot, "assets/catalog/motion-pattern-catalog.json"),
                          "utf8",
                        ),
                      ).patterns,
                    )
                  : "{}",
              );
              return;
            }
            if (req.url === "/motion-language-test") {
              const html = await server.transformIndexHtml(
                req.url,
                `<div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';
import{UiLanguageProvider,UiLanguageSwitch}from'/src/client/i18n/index.tsx';
import{MotionExplorer}from'/src/client/motion-explorer.tsx';
import'/src/client/framework.css';import'/src/client/style.css';
const h=React.createElement;createRoot(document.getElementById('root')).render(h(UiLanguageProvider,null,h(MemoryRouter,null,h(UiLanguageSwitch),h(MotionExplorer))));</script>`,
              );
              res.setHeader("Content-Type", "text/html");
              res.end(html);
              return;
            }
            if (req.url !== "/language-test") return next();
            const html = await server.transformIndexHtml(
              req.url,
              `<div id="root"></div><script type="module">
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';
import{UiLanguageProvider,UiLanguageSwitch}from'/src/client/i18n/index.tsx';
import{StyleCard}from'/src/client/style-card.tsx';import{MotionCard}from'/src/client/motion-card.tsx';
import{TechnologyPoolPage}from'/src/client/technology-pool-page.tsx';
import{TechnologyCard}from'/src/client/components/technology-card.tsx';
import{technologyEntries}from'/src/client/technology-pool-model.ts';
import{MotionGraphicVariants}from'/src/client/catalog-variants.tsx';
import{RecommendedStack}from'/src/client/recommended-stack.tsx';
import{technologyPool}from'/src/shared/technology-pool.ts';
import{GovernanceUsageTable}from'/src/client/governance/usage-table.tsx';
import{VideoLanguageControl}from'/src/client/components/video-language-control.tsx';
import styles from'/assets/catalog/video-style-catalog.json';import motions from'/assets/catalog/motion-pattern-catalog.json';
import'/src/client/framework.css';import'/src/client/style.css';
const h=React.createElement;function App(){const[language,setLanguage]=useState('en');return h(UiLanguageProvider,null,h(MemoryRouter,null,h(UiLanguageSwitch),h('output',{id:'project-output'},language),h('input',{id:'original-idea',defaultValue:'My original idea'}),h(VideoLanguageControl,{value:language,onChange:setLanguage}),h('div',{className:'style-grid'},h(StyleCard,{style:styles.styles[136],onSelect(){},showPalette:false}),h(MotionCard,{motion:motions.patterns[42],playbackEnabled:false,onSelect(){}})),h(GovernanceUsageTable,{byFunction:true,rows:[{model:'example-model',purpose:'Brief preparation',calls:1,tools:0,cacheHits:0,inputTokens:100,outputTokens:20,cachedTokens:null,costLow:0.01,costHigh:0.01,costBasis:'Published Jev API rate'}]}),h('section',{id:'detail-translations'},h(MotionGraphicVariants,{variants:styles.styles[2].motion_graphic_variants}),h(RecommendedStack,{libraries:[technologyPool.gsap],implementation:styles.styles[2].tech.implementation,selectionGuidance:styles.styles[2].tech.library_selection})),h(TechnologyPoolPage),h('section',{id:'technology-card-translations'},...technologyEntries.map(entry=>h('div',{'data-technology-key':entry.key,key:entry.key},h(TechnologyCard,{entry}))))));}createRoot(document.getElementById('root')).render(h(App));</script>`,
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
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${server.resolvedUrls!.local[0]}language-test`);
    await page.locator('[data-style-id="style-137"]').first().waitFor({ state: "attached" });
    expect(
      await page
        .locator('[data-style-id="style-137"] h3')
        .first()
        .evaluate((node) => node.textContent),
    ).toBe("Cassette Futurism");
    await page.locator(".room-language-switch .ant-segmented-item:last-child").first().click();
    await page.waitForFunction(() => document.documentElement.lang === "zh-CN");
    expect(
      await page
        .locator('[data-style-id="style-137"] h3')
        .first()
        .evaluate((node) => node.textContent),
    ).toBe("卡带未来主义");
    expect(
      await page
        .locator('[data-style-id="motion-043"] h3')
        .first()
        .evaluate((node) => node.textContent),
    ).toBe("360° 相机环绕");
    expect(
      await page
        .locator('[data-motion-id="motion-043"] canvas')
        .first()
        .evaluate((node) => node.getAttribute("aria-label")),
    ).toContain("360° 相机环绕");
    expect(
      await page
        .locator(".governance-ant-table")
        .first()
        .evaluate((node) => node.textContent),
    ).toContain("Jev 公布的 API 费率");
    expect(
      await page
        .locator("#project-output")
        .first()
        .evaluate((node) => node.textContent),
    ).toBe("en");
    expect(
      await page
        .locator("#original-idea")
        .first()
        .evaluate((node) => (node as HTMLInputElement).value),
    ).toBe("My original idea");
    const detailText = await page
      .locator("#detail-translations")
      .first()
      .evaluate((node) => node.textContent || "");
    expect(detailText).not.toContain(
      "A poster-like explainer anchored on one fixed cut-out device",
    );
    expect(detailText).not.toContain("Optional named variants of this Motion Graphic");
    expect(detailText).toContain("可选");
    await page.locator('[aria-label="搜索技术"]').first().pressSequentially("碰撞");
    await page.waitForFunction(
      () => document.querySelectorAll(".technology-pool-table .ant-table-row").length === 1,
    );
    expect(
      await page
        .locator(".technology-pool-table")
        .first()
        .evaluate((node) => node.textContent),
    ).toContain("Matter.js");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page
        .locator(".room-language-switch")
        .first()
        .evaluate((node) => {
          const r = node.getBoundingClientRect();
          return r.left >= 0 && r.right <= 390;
        }),
    ).toBe(true);
    await page.reload();
    await page.waitForFunction(() => document.documentElement.lang === "zh-CN");
    expect(
      await page
        .locator('[data-style-id="style-137"] h3')
        .first()
        .evaluate((node) => node.textContent),
    ).toBe("卡带未来主义");
    await (await page.$$(".room-language-switch .ant-segmented-item"))[0].click();
    await page.waitForFunction(() => document.documentElement.lang === "en");
    expect(
      await page
        .locator('[data-style-id="style-137"] h3')
        .first()
        .evaluate((node) => node.textContent),
    ).toBe("Cassette Futurism");
    await (await page.$$(".room-language-switch .ant-segmented-item"))[1].click();
    await page.waitForFunction(() => document.documentElement.lang === "zh-CN");
    // Exercise the real explorer and every expanded motion, not just resource availability.
    await page.goto(`${server.resolvedUrls!.local[0]}motion-language-test`);
    await page.locator('[data-style-id="motion-003"]').first().waitFor({ state: "attached" });
    await page.waitForFunction(() => document.documentElement.lang === "zh-CN");
    await page
      .locator("button")
      .filter({ hasText: /^暂停所有预览$/ })
      .click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    const { motions } = await loadCatalog();
    const { UiLanguageService } = await server.ssrLoadModule("/src/client/i18n/service.ts");
    const language = new UiLanguageService();
    await language.change("zh-CN");
    for (const motion of motions) {
      await page.locator(`[data-style-id="${motion.id}"]`).first().click();
      await page.locator(".studio-modal .style-detail").first().waitFor({ state: "attached" });
      // Wait for the modal's opening transform before clicking its contents.
      await page.waitForFunction(() => {
        const modal = document.querySelector(".studio-modal");
        return (
          modal &&
          modal
            .getAnimations()
            .every((animation) => ["finished", "idle"].includes(animation.playState))
        );
      });
      await page
        .locator(".studio-modal .ant-collapse-header")
        .filter({ hasText: /^推荐技术组合$/ })
        .click();
      const visible = await page
        .locator(".studio-modal .style-detail")
        .first()
        .evaluate((node) => (node as HTMLElement).innerText);
      for (const text of [
        motion.description,
        ...motion.motion_sequence,
        ...motion.compatibility.good_fit,
        ...motion.compatibility.adapt_or_omit_when,
        motion.video_adaptation,
      ])
        expect(visible, `${motion.id}: visible detail`).toContain(language.translate(text));
      // Technical guidance is force-rendered in accordions; exclude original source blocks.
      const detail = await page
        .locator(
          ".studio-modal .ant-modal-title, .studio-modal .style-detail p, .studio-modal .style-detail li",
        )
        .evaluateAll((nodes) => nodes.map((node) => node.textContent).join("\n"));
      const fields = [
        motion.name,
        motion.description,
        ...motion.motion_sequence,
        ...motion.compatibility.good_fit,
        ...motion.compatibility.adapt_or_omit_when,
        motion.video_adaptation,
        motion.tech.implementation,
        motion.tech.library_selection,
      ];
      for (const text of fields.filter((value): value is string => typeof value === "string")) {
        expect(detail, `${motion.id}: ${text}`).toContain(language.translate(text));
        if (language.translate(text) !== text)
          expect(detail, `${motion.id}: untranslated ${text}`).not.toContain(text);
      }
      for (const text of new CatalogDisplayText().motion(motion).texts()) {
        if (text.length > 90 && /\b(the|with|and|from|only|when|before)\b/i.test(text))
          expect(detail, `${motion.id}: untranslated detail`).not.toContain(text);
      }
      const close = ".studio-modal .ant-modal-close";
      await page.locator(close).first().waitFor({ state: "visible" });
      await page.locator(close).first().focus();
      await page.keyboard.press("Enter");
      await page.locator(".studio-modal").first().waitFor({ state: "hidden" });
    }
    await page.goto(`${server.resolvedUrls!.local[0]}language-test`);
    await page.locator(".technology-pool-table").first().waitFor({ state: "attached" });
    await page.waitForFunction(() => document.documentElement.lang === "zh-CN");
    const renderedTools = await page
      .locator("#technology-card-translations [data-technology-key]")
      .evaluateAll((nodes) =>
        Object.fromEntries(
          nodes.map((node) => [
            node.getAttribute("data-technology-key"),
            (node as HTMLElement).innerText,
          ]),
        ),
      );
    expect(Object.keys(renderedTools)).toHaveLength(technologyEntries.length);
    for (const entry of technologyEntries) {
      const detail = renderedTools[entry.key];
      for (const field of [
        entry.definition.purpose,
        entry.definition.runtime,
        entry.definition.integration_guidance,
      ]) {
        if (!field) continue;
        expect(detail, `${entry.key}: translated guidance`).toContain(language.translate(field));
        if (language.translate(field) !== field)
          expect(detail, `${entry.key}: untranslated guidance`).not.toContain(field);
      }
      for (const api of entry.definition.suggested_apis ?? [])
        expect(detail, entry.key).toContain(api);
    }
    // Table expansion is a second entry point and must update while already open.
    await page.locator('[aria-label="搜索技术"]').fill("photoswipe");
    await page
      .locator('.ant-table-row[data-row-key="photoswipe"] .ant-table-row-expand-icon')
      .first()
      .click();
    const expandedPhotoSwipe = ".ant-table-expanded-row .technology-pool-detail .stack-entry";
    await page.locator(expandedPhotoSwipe).first().waitFor({ state: "attached" });
    const photoSwipeGuidance = technologyEntries.find((entry) => entry.key === "photoswipe")!
      .definition.integration_guidance!;
    expect(
      await page
        .locator(expandedPhotoSwipe)
        .first()
        .evaluate((node) => (node as HTMLElement).innerText),
    ).toContain(language.translate(photoSwipeGuidance));
    await (await page.$$(".room-language-switch .ant-segmented-item"))[0].click();
    await page.waitForFunction(() => document.documentElement.lang === "en");
    expect(
      await page
        .locator(expandedPhotoSwipe)
        .first()
        .evaluate((node) => (node as HTMLElement).innerText),
    ).toContain(photoSwipeGuidance);
    await (await page.$$(".room-language-switch .ant-segmented-item"))[1].click();
    await page.waitForFunction(() => document.documentElement.lang === "zh-CN");
    expect(
      await page
        .locator(expandedPhotoSwipe)
        .first()
        .evaluate((node) => (node as HTMLElement).innerText),
    ).toContain(language.translate(photoSwipeGuidance));
    expect(mutations).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});
