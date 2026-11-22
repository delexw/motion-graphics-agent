import { chooseRenderedSelectOption } from "./fixtures/select-options";
import { newBrowserPage } from "./fixtures/browser-page";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import puppeteer from "puppeteer-core";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { appRoot } from "../src/server/runtime/config";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { RequestSchema } from "../src/shared/contracts";
import { browserAliases, browserDependencyScan } from "../vite.resolve";

it("requests project/search pages from the server and loads only an opened technology page", async () => {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "governance-browser-"));
  const server = await createServer({
    configFile: false,
    root: appRoot,
    cacheDir,
    optimizeDeps: browserDependencyScan,
    resolve: { alias: browserAliases },
    server: {
      host: "127.0.0.1",
      port: 0,
      watch: { ignored: ["**/.data/**", "**/dist/**", "**/work/**", "**/skills/**"] },
    },
    plugins: [
      react(),
      {
        name: "governance-fixture",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url !== "/governance-fixture") return next();
            res.setHeader("Content-Type", "text/html");
            res.end(
              await server.transformIndexHtml(
                req.url,
                `<!doctype html><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{ConfigProvider}from'antd';
import{roomTheme,roomCssVariables}from'/src/client/theme.ts';import{GovernancePage}from'/src/client/governance/page.tsx';import'/src/client/style.css';import'/src/client/room/room.css';
createRoot(document.getElementById('root')).render(React.createElement(ConfigProvider,{theme:roomTheme},React.createElement('div',{className:'room-utility',style:{...roomCssVariables,width:'100%',height:'auto',padding:16,background:'var(--room-surface)'}},React.createElement(GovernancePage))));
</script>`,
              ),
            );
          });
        },
      },
    ],
  });
  const browser = await puppeteer.launch({
    executablePath: browserExecutablePath(),
    headless: "shell",
    pipe: true,
  });
  const requests: URL[] = [];
  let reportUnavailable = false;
  try {
    await server.listen();
    const page = await newBrowserPage(browser);
    await page.setViewport({ width: 1200, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith("/api/admin/governance")) {
        requests.push(url);
        if (reportUnavailable && url.pathname === "/api/admin/governance") {
          void request.respond({ status: 503 });
          return;
        }
        const current = Number(url.searchParams.get("page") || 1);
        const pageSize = Number(url.searchParams.get("pageSize") || 5);
        const search = url.searchParams.get("search") || "";
        const technology = url.pathname.endsWith("/technologies");
        const options = url.pathname.endsWith("/projects");
        const response = options
          ? {
              pagination: { page: current, pageSize, total: search ? 1 : 26, search },
              projects: Array.from(
                { length: search ? 1 : Math.min(pageSize, 26 - (current - 1) * pageSize) },
                (_, index) => ({
                  id: `option-${search ? 25 : (current - 1) * pageSize + index}`,
                  name: `Option ${search ? 25 : (current - 1) * pageSize + index}`,
                  started: "2026-01-01T00:00:00Z",
                  outputType: "page",
                  provider: "claude",
                }),
              ),
            }
          : technology
            ? {
                jobId: "job",
                pagination: { page: current, pageSize, total: 92, search },
                entries: Array.from({ length: pageSize }, (_, index) => ({
                  id: `tech-${current}-${index}`,
                  name: `Technology ${current}-${index}`,
                  selected: false,
                  prepared: false,
                  browserLoaded: index < 2,
                  ecosystem: index < 2 ? "npm" : "native",
                  usageEvidence:
                    index === 0
                      ? ["Code API usage found", "Browser loaded"]
                      : index === 1
                        ? ["Browser loaded", "Runtime version observed"]
                        : [],
                  codeUsage:
                    index === 0
                      ? [
                          {
                            file: "artifacts/main.js",
                            line: 12,
                            column: 3,
                            expression: "scene.render",
                          },
                        ]
                      : [],
                })),
              }
            : {
                generatedAt: "2026-01-01T00:00:00Z",
                models: [],
                pricingDate: "2026-01-01",
                pricingSources: [],
                settingsChecks: search
                  ? []
                  : [
                      {
                        id: "00000000-0000-4000-8000-000000000001",
                        draftId: "00000000-0000-4000-8000-000000000002",
                        runId: "00000000-0000-4000-8000-000000000003",
                        requestHash: "fixture",
                        startedAt: "2026-01-01T00:00:00Z",
                        finishedAt: "2026-01-01T00:00:01Z",
                        model: "jev-1.14.0",
                        status: "compatible",
                        events: [
                          {
                            type: "invocation",
                            message: "Compatibility check started",
                            data: { invocationId: "fixture-check", prompt: "Synthetic brief" },
                          },
                          {
                            type: "usage",
                            message: "Usage recorded",
                            data: {
                              invocationId: "fixture-check",
                              usage: { input_tokens: 4841, output_tokens: 711 },
                            },
                          },
                        ],
                      },
                    ],
                pagination: { page: current, pageSize, total: search ? 1 : 26, search },
                checksPagination: { page: 1, pageSize: 10, total: search ? 0 : 1, search: "" },
                projects: [
                  {
                    id: url.searchParams.get("projectId") || `project-${current}`,
                    name: `${search || "Example"} project ${current}`,
                    status: current === 1 ? "ready" : "ranking",
                    started: "2026-01-01T00:00:00Z",
                    finished: current === 1 ? "2026-01-01T00:00:01Z" : null,
                    durationMs: 1000,
                    request: RequestSchema.parse({
                      instructions: "Synthetic fixture",
                      outputType: "page",
                    }),
                    attachments: [],
                    selectedStyles: [],
                    activity: [],
                    incompleteHistory: false,
                    technologyJobs: [{ id: "job", kind: "full", phase: "ready" }],
                  },
                ],
              };
        void request.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(response),
        });
      } else if (
        ["127.0.0.1", "localhost"].includes(url.hostname) ||
        ["data:", "blob:"].includes(url.protocol)
      )
        void request.continue();
      else void request.abort();
    });
    await page.goto(`${server.resolvedUrls!.local[0]}governance-fixture`);
    await page.waitForSelector('.governance-panel[data-project-id="project-1"]');
    const sectionGroup = ".governance-panel .governance-ant-sections";
    const sectionHeaders = `${sectionGroup} > .ant-collapse-item > .ant-collapse-header`;
    const technologyHeader = page
      .locator(sectionHeaders)
      .filter((header) => header.textContent === "Project technologies");
    expect(
      await page.$eval(
        `${sectionGroup} > .ant-collapse-item:first-child > .ant-collapse-header`,
        (header) => header.getAttribute("aria-expanded"),
      ),
    ).toBe("false");
    const pictures = path.join(cacheDir, "screenshots");
    await mkdir(pictures, { recursive: true });
    const projectPager = 'nav[aria-label="Project pages"]';
    expect(
      await page.$eval(
        ".governance-timing-card",
        (timing, pager) => {
          const usage = document.querySelector(".governance-stats")!;
          const project = document.querySelector(".governance-panel")!;
          const pagination = document.querySelector(pager)!;
          return {
            name: timing.querySelector(".ant-card-head-title")?.textContent,
            timingAboveUsage:
              timing.getBoundingClientRect().bottom < usage.getBoundingClientRect().top,
            projectAbovePagination:
              project.getBoundingClientRect().bottom < pagination.getBoundingClientRect().top,
            duplicateTiming: Boolean(project.querySelector(".governance-timing")),
          };
        },
        projectPager,
      ),
    ).toEqual({
      name: "Example project 1",
      timingAboveUsage: true,
      projectAbovePagination: true,
      duplicateTiming: false,
    });
    const checksTable =
      '.ant-table-wrapper:has(tr[data-row-key="00000000-0000-4000-8000-000000000001"])';
    await page.locator(`${checksTable} button.ant-table-row-expand-icon`).click();
    const checkDetails = `${checksTable} tr.ant-table-expanded-row`;
    await page.waitForSelector(`${checkDetails} .governance-settings-check-card`);
    expect(await page.$(`${checkDetails} pre`)).toBeNull();
    expect(await page.$(`${checkDetails} .governance-jev-call`)).toBeNull();
    await page
      .locator(`${checkDetails} .governance-settings-check-card .ant-collapse-header`)
      .click();
    await page.waitForSelector(`${checkDetails} pre`);
    await page.locator(`${checkDetails} .governance-jev-call-details .ant-collapse-header`).click();
    await page.waitForSelector(`${checkDetails} .governance-jev-call`);
    const detailPanel = `${checkDetails} td > :first-child`;
    for (const [width, viewportName] of [
      [1200, "wide"],
      [420, "narrow"],
    ] as const) {
      await page.setViewport({ width, height: 900 });
      await page.$eval(`${detailPanel} .governance-jev-call`, (card) => {
        card.scrollIntoView({ block: "center" });
      });
      await expect
        .poll(
          () =>
            page.$eval(detailPanel, (panel) => {
              const calls = panel.querySelector('section[aria-label="JEV calls"]')!;
              const draft = panel.querySelector("pre")!.parentElement!;
              const viewport = panel.closest(".ant-table-content")!.getBoundingClientRect();
              return {
                fits: panel.getBoundingClientRect().right <= viewport.right + 1,
                noContentOverflow: calls.scrollWidth <= calls.clientWidth + 1,
                separated: calls.getBoundingClientRect().top > draft.getBoundingClientRect().bottom,
              };
            }),
          { message: viewportName, timeout: 5000 },
        )
        .toEqual({ fits: true, noContentOverflow: true, separated: true });
      await (await page.$(`${detailPanel} .governance-jev-call`))!.screenshot({
        path: path.join(pictures, `governance-check-${viewportName}.png`),
      });
      expect(
        await page.$eval(projectPager, (nav) => {
          const pages = nav.querySelector(".ant-pagination")!;
          return (
            nav.getBoundingClientRect().right <= document.documentElement.clientWidth &&
            pages.scrollWidth <= nav.clientWidth + 1 &&
            getComputedStyle(pages).justifyContent === "end"
          );
        }),
      ).toBe(true);
    }
    await page.setViewport({ width: 1200, height: 900 });
    await page.$eval(".room-utility", (room) => ((room as HTMLElement).style.maxWidth = "420px"));
    await page.waitForFunction(() => {
      const metrics = [...document.querySelectorAll(".governance-jev-call-metrics > div")];
      return (
        metrics.length === 4 &&
        new Set(metrics.map((metric) => metric.getBoundingClientRect().top)).size > 1
      );
    });
    await page.$eval(".room-utility", (room) => ((room as HTMLElement).style.maxWidth = ""));
    await (await page.$(".governance-timing-card"))!.screenshot({
      path: path.join(pictures, "governance-top-timing.png"),
    });
    await (await page.$(projectPager))!.screenshot({
      path: path.join(pictures, "governance-project-pagination.png"),
    });
    await page.locator(`${projectPager} .ant-pagination-item-2 a`).click();
    await page.waitForSelector('.governance-panel[data-project-id="project-2"]');
    expect(await page.$eval(".governance-timing-card", (node) => node.textContent)).toContain(
      "In progress",
    );
    expect(
      requests
        .filter((url) => url.pathname === "/api/admin/governance")
        .at(-1)
        ?.searchParams.get("page"),
    ).toBe("2");
    await page.locator('[aria-label="Search projects"]').fill("Ocean");
    await page.focus('[aria-label="Search projects"]');
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () =>
        document.querySelector(".governance-ant-project-title")?.textContent === "Ocean project 1",
    );
    expect(
      requests
        .filter((url) => url.pathname === "/api/admin/governance")
        .at(-1)
        ?.searchParams.get("search"),
    ).toBe("Ocean");
    expect(
      requests
        .filter((url) => url.pathname === "/api/admin/governance")
        .at(-1)
        ?.searchParams.get("page"),
    ).toBe("1");
    expect(await page.$(projectPager)).toBeNull();
    expect(await page.$eval(".governance-page", (node) => node.textContent)).toContain(
      "No settings checks recorded yet.",
    );
    expect(requests.filter((url) => url.pathname.endsWith("/technologies"))).toHaveLength(0);
    await technologyHeader.click();
    await page.waitForSelector('section[aria-label="Project technologies"] .ant-table-row');
    expect(await page.$eval(".project-technologies", (node) => node.textContent)).toContain(
      "Code usage unverified",
    );
    const sourceDetails = ".project-technologies details";
    await page.locator(`${sourceDetails} summary`).click();
    expect(await page.$eval(sourceDetails, (node) => (node as HTMLDetailsElement).open)).toBe(true);
    expect(await page.$eval(sourceDetails, (node) => node.textContent)).toContain(
      "artifacts/main.js:12:3",
    );
    expect(await page.$eval(sourceDetails, (node) => node.textContent)).toContain("scene.render");
    expect(
      await page.$$eval(".project-technologies .ant-tag", (nodes) =>
        nodes
          .filter((node) =>
            ["Browser loaded", "Runtime version observed"].includes(node.textContent || ""),
          )
          .every((node) => !node.classList.contains("ant-tag-green")),
      ),
    ).toBe(true);
    await page.locator(`${sourceDetails} summary`).click();
    expect(requests.at(-1)?.pathname).toBe("/api/admin/governance/project-1/technologies");
    expect(requests.at(-1)?.searchParams.get("pageSize")).toBe("8");
    const fields = await page.$$eval(".technology-explorer__field", (nodes) =>
      nodes.map((node) => ({
        x: node.getBoundingClientRect().x,
        y: node.getBoundingClientRect().y,
        width: node.getBoundingClientRect().width,
      })),
    );
    expect(new Set(fields.map((field) => Math.round(field.y))).size).toBe(1);
    expect(await page.$('section[aria-label="Project technologies"] h4')).toBeNull();
    await (await page.$(".technology-explorer"))!.screenshot({
      path: path.join(pictures, "technology-dark-wide.png"),
    });
    await page.setViewport({ width: 420, height: 900 });
    await page.waitForFunction(() => {
      const fields = [...document.querySelectorAll(".technology-explorer__field")];
      return (
        fields.length === 3 &&
        new Set(fields.map((node) => Math.round(node.getBoundingClientRect().y))).size === 3
      );
    });
    expect(
      await page.$eval(".technology-explorer", (node) => node.scrollWidth <= node.clientWidth + 1),
    ).toBe(true);
    await (await page.$(".technology-explorer"))!.screenshot({
      path: path.join(pictures, "technology-dark-narrow.png"),
    });
    await page.setViewport({ width: 1200, height: 900 });

    expect(
      await page.$$eval(sectionHeaders, (headers) => headers.map((header) => header.textContent)),
    ).toEqual([
      "Project technologies",
      "User input and settings",
      "Model prompts · 0 prompts",
      "Usage by model and function",
    ]);
    const openSectionIndexes = await page.$$eval(sectionHeaders, (headers) =>
      headers.flatMap((header, index) =>
        header.getAttribute("aria-expanded") === "true" ? [index + 1] : [],
      ),
    );
    expect(openSectionIndexes).toHaveLength(3);
    for (const index of openSectionIndexes) {
      const header = `${sectionGroup} > .ant-collapse-item:nth-child(${index}) > .ant-collapse-header`;
      await page.locator(`${header}[aria-expanded="true"]`).click();
      await page.waitForSelector(`${header}[aria-expanded="false"]`);
    }
    await page.waitForSelector(".technology-explorer", { hidden: true });
    await expect
      .poll(() =>
        page.$eval(sectionGroup, (group) => {
          const lastHeader = group.querySelector(
            ":scope > .ant-collapse-item:last-child > .ant-collapse-header",
          )!;
          return group.getBoundingClientRect().bottom - lastHeader.getBoundingClientRect().bottom;
        }),
      )
      .toBeLessThanOrEqual(2);
    for (const width of [1200, 420]) {
      await page.setViewport({ width, height: 900 });
      const group = (await page.$(sectionGroup))!;
      expect(
        await group.evaluate(
          (element) =>
            element.getBoundingClientRect().right <= document.documentElement.clientWidth &&
            element.scrollWidth <= element.clientWidth + 1,
        ),
      ).toBe(true);
      await group.evaluate((element) => element.scrollIntoView({ block: "center" }));
      await group.screenshot({
        path: path.join(pictures, `governance-project-sections-${width}.png`),
      });
    }
    await page.setViewport({ width: 1200, height: 900 });
    await technologyHeader.click();
    await page.waitForSelector('section[aria-label="Project technologies"] .ant-table-row');

    await page.focus('section[aria-label="Project technologies"] .ant-pagination-item-2 a');
    await page.keyboard.press("Enter");
    await page.waitForFunction(() =>
      document
        .querySelector('section[aria-label="Project technologies"]')
        ?.textContent?.includes("Technology 2-0"),
    );
    expect(requests.at(-1)?.searchParams.get("page")).toBe("2");
    await page.locator(".technology-explorer__field--search input").fill("three");
    await page.focus(".technology-explorer__field--search input");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() =>
      document
        .querySelector('section[aria-label="Project technologies"]')
        ?.textContent?.includes("Technology 1-0"),
    );
    expect(requests.at(-1)?.searchParams.get("search")).toBe("three");
    const projectOptions = ".ant-select-dropdown:not(.ant-select-dropdown-hidden)";
    await page.locator(".governance-ant-select").click();
    await page.focus(".governance-ant-select input");
    await chooseRenderedSelectOption(page, `${projectOptions} [data-project-id="option-1"]`);
    await page.waitForSelector('.governance-panel[data-project-id="option-1"]');
    await page.locator(".governance-ant-select").click();
    await page.waitForSelector(`${projectOptions} [data-project-id="option-0"]`);
    expect(await page.$(`${projectOptions} [data-project-id="option-2"]`)).toBeTruthy();
    await page
      .locator(`${projectOptions} .ant-select-dropdown-list-holder`)
      .scroll({ scrollTop: 1600 });

    await expect
      .poll(
        () =>
          requests
            .filter((url) => url.pathname.endsWith("/projects"))
            .at(-1)
            ?.searchParams.get("page"),
        { timeout: 10000 },
      )
      .toBe("2");
    const optionsRequest = requests.filter((url) => url.pathname.endsWith("/projects")).at(-1)!;
    expect(optionsRequest.searchParams.get("page")).toBe("2");
    expect(optionsRequest.searchParams.has("projectId")).toBe(false);
    await page.locator(".governance-ant-select input").fill("find last");
    await page.waitForSelector(`${projectOptions} [data-project-id="option-25"]`);
    const searchedOptions = requests.filter((url) => url.pathname.endsWith("/projects")).at(-1)!;
    expect(searchedOptions.searchParams.get("search")).toBe("find last");
    expect(searchedOptions.searchParams.get("page")).toBe("1");
    await page.keyboard.press("Escape");
    const refresh = page.locator(".governance-page .page-heading button");
    const reportError = ".governance-page .ant-alert-error";
    reportUnavailable = true;
    await refresh.click();
    await page.waitForSelector(reportError);
    expect(await page.$eval(reportError, (node) => node.textContent)).toContain(
      "Unable to load governance data.",
    );
    reportUnavailable = false;
    await refresh.click();
    await page.waitForSelector(reportError, { hidden: true });
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
}, 60000);
