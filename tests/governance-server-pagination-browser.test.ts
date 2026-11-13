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
createRoot(document.getElementById('root')).render(React.createElement(ConfigProvider,{theme:roomTheme},React.createElement('div',{className:'room-utility',style:{...roomCssVariables,width:'100%',height:'auto',padding:16}},React.createElement(GovernancePage))));
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
                settingsChecks: [],
                pagination: { page: current, pageSize, total: search ? 1 : 26, search },
                checksPagination: { page: 1, pageSize: 10, total: 0, search: "" },
                projects: [
                  {
                    id: url.searchParams.get("projectId") || `project-${current}`,
                    name: `${search || "Example"} project ${current}`,
                    status: "ready",
                    started: "2026-01-01T00:00:00Z",
                    finished: null,
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
    await expect
      .poll(() => requests.filter((url) => url.pathname.endsWith("/technologies")).length)
      .toBe(1);
    await page.locator(".ant-pagination-item-2 a").click();
    await page.waitForSelector('.governance-panel[data-project-id="project-2"]');
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
    const pictures = path.join(appRoot, "work/governance-layout");
    await mkdir(pictures, { recursive: true });
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
    await page.locator(".governance-ant-select").click();
    await page.waitForSelector('.ant-select-dropdown [data-project-id="option-1"]');
    await page.focus(".governance-ant-select input");
    await chooseRenderedSelectOption(
      page,
      '.ant-select-dropdown:not(.ant-select-dropdown-hidden) [data-project-id="option-1"]',
    );
    await page.waitForSelector('.governance-panel[data-project-id="option-1"]');
    await page.locator(".governance-ant-select").click();
    await page.waitForSelector('.ant-select-dropdown [data-project-id="option-0"]');
    expect(await page.$('.ant-select-dropdown [data-project-id="option-2"]')).toBeTruthy();
    await page.focus(".governance-ant-select input");
    for (let index = 0; index < 22; index++) await page.keyboard.press("ArrowDown");
    await page.hover(".ant-select-dropdown .ant-select-dropdown-list-holder");
    await page.mouse.wheel({ deltaY: 1600 });

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
    await page.waitForSelector('.ant-select-dropdown [data-project-id="option-25"]');
    const searchedOptions = requests.filter((url) => url.pathname.endsWith("/projects")).at(-1)!;
    expect(searchedOptions.searchParams.get("search")).toBe("find last");
    expect(searchedOptions.searchParams.get("page")).toBe("1");
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
}, 60000);
