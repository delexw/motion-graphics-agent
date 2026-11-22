import { newBrowserPage } from "./fixtures/browser-page";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import react from "@vitejs/plugin-react";
import puppeteer from "puppeteer-core";
import { createServer } from "vite";
import { expect, it } from "vitest";
import { browserDependencyScan } from "../vite.resolve";
import { appRoot } from "../src/server/runtime/config";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { projectGovernance } from "../src/server/governance/report";
import { RequestSchema, type Run } from "../src/shared/contracts";

it.skipIf(!browserExecutablePath())(
  "expands visual and audio choices through the same Governance table",
  async () => {
    const run: Run = {
      id: "example-project",
      createdAt: "2026-10-22T00:00:00Z",
      phase: "generating",
      request: RequestSchema.parse({ instructions: "Explain an idea" }),
      candidates: [],
      jobs: [
        {
          id: "full",
          runId: "example-project",
          candidateId: "direction",
          kind: "full",
          phase: "generating",
          duration: 60,
          workspace: "/tmp/fixture",
          model: "example-model",
          authoringResources: {
            source: "jev",
            model: "jev-1.14.0",
            selectedIds: ["local_code"],
            decisions: [{ id: "local_code", use: true, probability: 0.82 }],
          },
          audioAuthoring: {
            source: "jev",
            model: "jev-1.14.0",
            selectedId: "audio_studio",
            decisions: [
              { id: "audio_studio", use: true, probability: 0.98 },
              { id: "local_audio", use: false, probability: 0.02 },
            ],
          },
        },
      ],
    };
    const rows = projectGovernance(
      run,
      ["Authoring resource selection", "Audio authoring selection"].map((purpose, id) => ({
        id,
        runId: run.id,
        jobId: "full",
        time: run.createdAt,
        type: "usage",
        message: "",
        data: {
          model: "jev-1.14.0",
          purpose,
          invocationId: String(id),
          input_tokens: 100,
          output_tokens: 10,
        },
      })),
    ).activity;
    rows.push(
      ...projectGovernance(
        run,
        Array.from({ length: 3 }, (_, index) => {
          const data = {
            model: "jev-1.14.0",
            provider: "jev",
            purpose: "Render cache review",
            invocationId: `cache-${index}`,
          };
          const base = { runId: run.id, jobId: "full", time: run.createdAt, message: "" };
          return [
            {
              ...base,
              id: 10 + index * 2,
              type: "invocation",
              data: {
                ...data,
                prompt: { user: JSON.stringify({ state: { shot: `shots/scene-${index}.html` } }) },
              },
            },
            {
              ...base,
              id: 11 + index * 2,
              type: "usage",
              data: {
                ...data,
                usage: { input_tokens: 100, output_tokens: 10 },
                decision: {
                  questionKey: "cache",
                  answer: {
                    choice: index === 0 ? "reuse" : "refresh",
                    confidence: 0.8,
                    probabilities: {
                      reuse: index === 0 ? 0.9 : 0.1,
                      refresh: index === 0 ? 0.1 : 0.9,
                    },
                  },
                },
              },
            },
          ];
        }).flat(),
      ).activity,
    );
    rows.push({
      ...rows[0],
      purpose: "Combination evaluation",
      authoringSelections: [],
      renderCacheReviews: [],
      jevCalls: undefined,
      combinationEvaluation: {
        selected: [
          {
            id: "example-direction",
            title: "Studio explainer",
            styles: ["style-110", "style-093", "style-unknown"],
            rationale: "A lit subject with a readable title",
            score: 90,
            confidence: 0.8,
            dimensions: {},
            selectionDecision: {
              round: 1,
              comparedIds: ["candidate-2", "candidate-7", "candidate-8"],
              comparedStyles: {
                "candidate-2": ["style-093"],
                "candidate-7": ["style-110", "style-093", "style-107"],
              },
              probabilities: { "candidate-2": 0.04, "candidate-7": 0.88, "candidate-8": 0.08 },
            },
          },
        ],
        calls: [],
      },
    });
    rows.push(
      ...projectGovernance(
        run,
        [
          ["Film build", "xhigh"],
          ["Film build", "medium"],
          ["Film review", "high"],
        ].map(([purpose, reasoningEffort], index) => ({
          id: 100 + index,
          runId: run.id,
          time: run.createdAt,
          message: "",
          type: "invocation",
          data: {
            invocationId: `effort-${index}`,
            model: "example-model",
            purpose,
            prompt: { reasoningEffort },
          },
        })),
      ).activity,
    );
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "governance-authoring-"));
    const server = await createServer({
      configFile: false,
      root: appRoot,
      cacheDir,
      optimizeDeps: browserDependencyScan,
      resolve: { alias: { "@": path.join(appRoot, "src/client") } },
      server: { host: "127.0.0.1", port: 0, watch: null },
      plugins: [
        react(),
        {
          name: "governance-authoring-fixture",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url === "/rows") {
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(rows));
              } else if (req.url === "/authoring-test") {
                res.setHeader("Content-Type", "text/html");
                res.end(
                  await server.transformIndexHtml(
                    req.url,
                    `<div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';
import{GovernanceUsageTable}from'/src/client/governance/usage-table.tsx';
import{aggregateModels}from'/src/shared/governance.ts';
import{ModelPromptTree}from'/src/client/governance/model-prompts.tsx';
const prompts=[{id:'call1',time:'2026-10-22T00:00:00Z',model:'example-model',purpose:'Film build',source:'recorded',reasoningEffort:'xhigh'},{id:'call2',time:'2026-10-22T00:00:01Z',model:'example-model',purpose:'Film build',source:'recorded',reasoningEffort:'medium'}];
import{uiLanguage}from'/src/client/i18n';
import'/src/client/framework.css';import'/src/client/style.css';
const rows=await(await fetch('/rows')).json();
const styles=[{id:'style-110',name_en:'3D Motion Graphics'},{id:'style-093',name_en:'Kinetic Typography'},{id:'style-107',name_en:'Collage'}];
createRoot(document.getElementById('root')).render(React.createElement(React.Fragment,null,React.createElement('button',{id:'language-zh',onClick:()=>uiLanguage.change('zh-CN')},'中文'),React.createElement(GovernanceUsageTable,{rows,styles,byFunction:true}),React.createElement(ModelPromptTree,{prompts,onSelect(){}}),React.createElement('button',{id:'show-jev-totals',onClick:()=>createRoot(document.getElementById('jev-totals')).render(React.createElement(GovernanceUsageTable,{rows:aggregateModels(rows)}))},'Show totals'),React.createElement('div',{id:'jev-totals'})));</script>`,
                  ),
                );
              } else next();
            });
          },
        },
      ],
    });
    let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
    try {
      await server.listen();
      browser = await puppeteer.launch({
        executablePath: browserExecutablePath(),
        headless: "shell",
        pipe: true,
      });
      const page = await newBrowserPage(browser);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      await page.setViewport({ width: 1440, height: 1000 });
      await page.goto(`${server.resolvedUrls!.local[0]}authoring-test`);
      await page.waitForSelector(".ant-table-row-expand-icon");
      expect(await page.$('section[aria-label="Reasoning effort:"]')).toBeNull();
      await page.locator(".governance-ant-prompt-tree .ant-tree-switcher_close").click();
      await page.locator(".governance-ant-prompt-tree .ant-tree-switcher_close").click();
      await page.waitForFunction(() =>
        document
          .querySelector(".governance-ant-prompt-tree .ant-tree-list")
          ?.textContent?.includes("Extra high"),
      );
      expect(
        await page.$eval(".governance-ant-prompt-tree .ant-tree-list", (node) => node.textContent),
      ).toContain("Medium");

      expect(await page.$eval(".governance-ant-table", (el) => el.textContent)).toContain(
        "Audio Studio (98%)",
      );
      expect(await page.$eval(".governance-ant-table", (el) => el.textContent)).toContain(
        "Existing local code and libraries (82%)",
      );
      const expanders = await page.$$("button.ant-table-row-expand-icon");
      expect(expanders).toHaveLength(6);
      for (let count = 1; count <= expanders.length; count++) {
        await page.locator("button.ant-table-row-expand-icon-collapsed").click();
        await page.waitForFunction(
          (expected) =>
            document.querySelectorAll("button.ant-table-row-expand-icon-expanded").length ===
            expected,
          {},
          count,
        );
      }
      await page.waitForFunction(
        () => document.querySelectorAll('section[aria-label="Authoring comparison"]').length === 2,
      );
      const effortRows = await page.$$eval('section[aria-label="Reasoning effort:"]', (sections) =>
        sections.map((section) => ({
          row: section.closest("tr")?.previousElementSibling?.textContent,
          text: section.textContent,
        })),
      );
      expect(effortRows).toEqual([
        {
          row: expect.stringContaining("Film build"),
          text: expect.stringContaining("Extra high · 1"),
        },
        { row: expect.stringContaining("Film review"), text: expect.stringContaining("High · 1") },
      ]);
      expect(effortRows[0].text).toContain("Medium · 1");
      expect(effortRows[1].text).not.toContain("Medium");
      const authoring = 'section[aria-label="Authoring comparison"]';
      const details = await page.$$eval(authoring, (sections) =>
        sections.map((section) => section.textContent),
      );
      expect(details).toHaveLength(2);
      expect(details.join(" ")).not.toContain("Local audio tools · 2%");
      expect(details.join(" ")).toContain("Audio Studio · 98%");
      await page.locator(`${authoring} .ant-collapse-header`).click();
      await page.waitForFunction(() =>
        Array.from(
          document.querySelectorAll('section[aria-label="Authoring comparison"] .ant-tag'),
        ).some((tag) => tag.textContent === "Local audio tools · 2%"),
      );
      const cache = 'section[aria-label="Render cache review"]';
      await page.waitForFunction(
        () => document.querySelectorAll('section[aria-label="Render cache review"]').length === 3,
      );
      const cacheDetails = await page.$$eval(cache, (sections) =>
        sections.map((section) => ({
          title: section.querySelector(".ant-card-head-title")?.textContent,
          outcome: section.querySelector(".ant-tag")?.textContent,
          certainty: section.querySelector(".ant-statistic")?.textContent,
        })),
      );
      expect(cacheDetails).toHaveLength(3);
      expect(cacheDetails[0]).toEqual({
        title: "shots/scene-0.html",
        outcome: "Reuse cached shot",
        certainty: "Choice certainty80%",
      });
      expect(cacheDetails[1].outcome).toBe("Rebuild shot");
      expect(await page.$$eval(`${cache} .ant-statistic`, (stats) => stats.length)).toBe(3);
      await page.locator(`${cache} .ant-collapse-header`).click();
      await page.waitForFunction(() =>
        Array.from(
          document.querySelectorAll('section[aria-label="Render cache review"] .ant-statistic'),
        ).some((stat) => stat.textContent === "Reuse cached shot90%"),
      );
      expect(await page.$eval(`${cache} a`, (node) => node.getAttribute("href"))).toBe(
        "/api/admin/governance/example-project/prompts/cache-0",
      );
      await page.waitForSelector('section[aria-label="Combination evaluation"]');
      const directionCard = ".governance-direction-card";
      expect(await page.$(`${directionCard} .governance-direction-rationale`)).toBeNull();
      expect(await page.$('section[aria-label="Selection round"]')).toBeNull();
      expect(
        await page.$eval(`${directionCard} .ant-statistic`, (score) => score.textContent),
      ).toContain("90.0");
      expect(await page.$eval(directionCard, (card) => card.textContent)).toContain(
        "Studio explainer",
      );
      const screenshots = path.join(appRoot, "work/governance-layout");
      await mkdir(screenshots, { recursive: true });
      const summaryCard = (await page.$(directionCard))!;
      for (const width of [1440, 420]) {
        await page.setViewport({ width, height: 900 });
        await page.waitForFunction(
          (selector) => {
            const card = document.querySelector(selector)!;
            return (
              card.getBoundingClientRect().right <= innerWidth + 1 &&
              card.scrollWidth <= card.clientWidth + 1
            );
          },
          {},
          directionCard,
        );
        await summaryCard.screenshot({
          path: path.join(screenshots, `combination-summary-${width}.png`),
        });
      }
      await page.setViewport({ width: 1440, height: 1000 });
      const detailPanels = `${directionCard} .ant-collapse-item`;
      const rationale = page.locator(`${detailPanels}:first-child > .ant-collapse-header`);
      await rationale.click();
      await page.waitForFunction(
        () =>
          document.querySelector(".governance-direction-rationale")?.textContent ===
          "A lit subject with a readable title",
      );
      await rationale.click();
      await page.locator(`${detailPanels}:last-child > .ant-collapse-header`).click();
      await page.waitForSelector('section[aria-label="Selection round"]');
      const combination = await page.$eval(
        'section[aria-label="Combination evaluation"]',
        (el) => el.textContent || "",
      );
      expect(combination).not.toMatch(/candidate-\d|style-(?:\d|unknown)/);
      const comparisons = await page.$$eval('section[aria-label="Selection round"] li', (options) =>
        options.map((option) => ({
          primary: option.querySelector('[aria-label="Primary Motion Graphic"] .ant-tag')
            ?.textContent,
          supporting: Array.from(
            option.querySelectorAll('[aria-label="Supporting Motion Graphics"] .ant-tag'),
            (tag) => tag.textContent,
          ),
          preference: option.querySelector(".governance-comparison-preference")?.textContent,
        })),
      );
      expect(comparisons).toEqual([
        { primary: "Kinetic Typography", supporting: [], preference: "4%" },
        {
          primary: "3D Motion Graphics",
          supporting: ["Kinetic Typography", "Collage"],
          preference: "88%",
        },
      ]);
      expect(combination.match(/Combination styles not recorded/g)).toHaveLength(1);
      expect(
        await page.$eval(
          '[aria-label="Combination styles not recorded"] .ant-tag',
          (tag) => tag.textContent,
        ),
      ).toBe("8%");
      const comparisonPanel = (await page.$('section[aria-label="Selection round"]'))!;
      for (const width of [1440, 420]) {
        await page.setViewport({ width, height: 900 });
        await page.waitForFunction(() => {
          const comparison = document.querySelector('section[aria-label="Selection round"]')!;
          const bounds = comparison.getBoundingClientRect();
          const panel = comparison.closest(".ant-collapse-item")!.getBoundingClientRect();
          return (
            bounds.right <= innerWidth + 1 &&
            bounds.bottom <= panel.bottom + 1 &&
            comparison.scrollWidth <= comparison.clientWidth + 1
          );
        });
        await comparisonPanel.evaluate((panel) => panel.scrollIntoView({ block: "center" }));
        await comparisonPanel.screenshot({
          path: path.join(screenshots, `combination-comparison-${width}.png`),
        });
      }
      await page.setViewport({ width: 1440, height: 1000 });
      for (const width of [1440, 420]) {
        await page.setViewport({ width, height: 900 });
        for (const [selector, name, count] of [
          [authoring, "authoring", 2],
          [cache, "cache", 3],
        ] as const) {
          const cards = `${selector} .governance-jev-dashboard-card`;
          await page.waitForFunction(
            (selector, expected) => {
              const cards = Array.from(document.querySelectorAll(selector));
              return (
                cards.length === expected &&
                cards.every((card) => {
                  const viewport = card.closest(".ant-table-content")!.getBoundingClientRect();
                  return (
                    viewport.right <= innerWidth + 1 &&
                    card.getBoundingClientRect().right <= viewport.right + 1 &&
                    card.scrollWidth <= card.clientWidth + 1
                  );
                })
              );
            },
            {},
            cards,
            count,
          );
          const card = (await page.$(cards))!;
          await card.evaluate((card) => card.scrollIntoView({ block: "center" }));
          await card.screenshot({
            path: path.join(screenshots, `governance-${name}-${width}.png`),
          });
        }
      }
      await page.setViewport({ width: 1440, height: 1000 });
      await page.click("#language-zh");
      await page.waitForFunction(
        () =>
          Array.from(document.querySelectorAll(".governance-combination-styles .ant-tag")).some(
            (tag) => tag.textContent === "三维动态图形",
          ) &&
          Array.from(document.querySelectorAll(".governance-combination-styles .ant-tag")).some(
            (tag) => tag.textContent === "动态字体",
          ),
      );
      await page.locator("#show-jev-totals").click();
      await page
        .locator('#jev-totals tr[data-row-key^="jev-"] button.ant-table-row-expand-icon-collapsed')
        .click();
      await page.waitForSelector("#jev-totals .governance-jev-call");
      const recordedCalls = await page.$$eval("#jev-totals .governance-jev-call", (elements) =>
        elements.map((element) => element.textContent),
      );
      expect(recordedCalls).toHaveLength(5);
      expect(recordedCalls[0]).toContain("100");
      expect(
        await page.$eval("#jev-totals section a", (element) => element.getAttribute("href")),
      ).toBe("/api/admin/governance/example-project/prompts/cache-0");
      await page.setViewport({ width: 420, height: 900 });
      await page.waitForFunction(() => {
        const card = document.querySelector("#jev-totals .governance-jev-call")!;
        const scrollContainer = card.closest(".ant-table-content")!.getBoundingClientRect();
        return (
          scrollContainer.width <= 420 &&
          card.getBoundingClientRect().right <= scrollContainer.right + 1 &&
          card.scrollWidth <= card.clientWidth + 1
        );
      });
      expect(errors).toEqual([]);
    } finally {
      await browser?.close();
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  },
  60_000,
);
