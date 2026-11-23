import { expect } from "@playwright/test";
import { RequestSchema } from "../../src/shared/contracts";
import { test } from "../fixtures/playwright-app";

test.use({
  fixtureHtml: `<!doctype html><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{ConfigProvider}from'antd';
import{roomTheme,roomCssVariables}from'/src/client/theme.ts';import{GovernancePage}from'/src/client/governance/page.tsx';import'/src/client/style.css';import'/src/client/room/room.css';
createRoot(document.getElementById('root')).render(React.createElement(ConfigProvider,{theme:roomTheme},React.createElement('div',{className:'room-utility',style:{...roomCssVariables,width:'100%',height:'auto',padding:16,background:'var(--room-surface)'}},React.createElement(GovernancePage))));
</script>`,
});

test("requests project/search pages from the server and loads only an opened technology page", async ({
  page,
  fixtureUrl,
}) => {
  const requests: URL[] = [];
  let reportUnavailable = false;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.route(
    (url) =>
      url.origin === new URL(fixtureUrl).origin && url.pathname.startsWith("/api/admin/governance"),
    (route) => {
      const url = new URL(route.request().url());
      requests.push(url);
      if (reportUnavailable && url.pathname === "/api/admin/governance") {
        return route.fulfill({ status: 503 });
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
      return route.fulfill({ json: response });
    },
  );
  await page.goto(fixtureUrl);
  await page.waitForSelector('.governance-panel[data-project-id="project-1"]');
  const sectionGroup = ".governance-panel .governance-ant-sections";
  const sectionHeaders = `${sectionGroup} > .ant-collapse-item > .ant-collapse-header`;
  const technologyHeader = page
    .locator(sectionGroup)
    .getByRole("button", { name: "Project technologies", exact: true });
  await expect(technologyHeader).toHaveAttribute("aria-expanded", "false");
  const projectPager = 'nav[aria-label="Project pages"]';
  expect(
    await page.locator(".governance-timing-card").evaluate((timing, pager) => {
      const usage = document.querySelector(".governance-stats")!;
      const project = document.querySelector(".governance-panel")!;
      const pagination = document.querySelector(pager)!;
      return {
        name: timing.querySelector(".ant-card-head-title")?.textContent,
        timingAboveUsage: timing.getBoundingClientRect().bottom < usage.getBoundingClientRect().top,
        projectAbovePagination:
          project.getBoundingClientRect().bottom < pagination.getBoundingClientRect().top,
        duplicateTiming: Boolean(project.querySelector(".governance-timing")),
      };
    }, projectPager),
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
  await expect(page.locator(`${checkDetails} pre`)).toHaveCount(0);
  await expect(page.locator(`${checkDetails} .governance-jev-call`)).toHaveCount(0);
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
    await page.setViewportSize({ width, height: 900 });
    await page.locator(`${detailPanel} .governance-jev-call`).evaluate((card) => {
      card.scrollIntoView({ block: "center" });
    });
    await expect
      .poll(
        () =>
          page.locator(detailPanel).evaluate((panel) => {
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
    expect(
      await page.locator(projectPager).evaluate((nav) => {
        const pages = nav.querySelector(".ant-pagination")!;
        return (
          nav.getBoundingClientRect().right <= document.documentElement.clientWidth &&
          pages.scrollWidth <= nav.clientWidth + 1 &&
          getComputedStyle(pages).justifyContent === "end"
        );
      }),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1200, height: 900 });
  await page
    .locator(".room-utility")
    .evaluate((room) => ((room as HTMLElement).style.maxWidth = "420px"));
  await page.waitForFunction(() => {
    const metrics = [...document.querySelectorAll(".governance-jev-call-metrics > div")];
    return (
      metrics.length === 4 &&
      new Set(metrics.map((metric) => metric.getBoundingClientRect().top)).size > 1
    );
  });
  await page
    .locator(".room-utility")
    .evaluate((room) => ((room as HTMLElement).style.maxWidth = ""));
  await page.locator(`${projectPager} .ant-pagination-item-2 a`).click();
  await page.waitForSelector('.governance-panel[data-project-id="project-2"]');
  expect(
    await page.locator(".governance-timing-card").evaluate((node) => node.textContent),
  ).toContain("In progress");
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
  await expect(page.locator(projectPager)).toHaveCount(0);
  expect(await page.locator(".governance-page").evaluate((node) => node.textContent)).toContain(
    "No settings checks recorded yet.",
  );
  expect(requests.filter((url) => url.pathname.endsWith("/technologies"))).toHaveLength(0);
  await technologyHeader.click();
  await page.waitForSelector('section[aria-label="Project technologies"] .ant-table-row');
  expect(
    await page.locator(".project-technologies").evaluate((node) => node.textContent),
  ).toContain("Code usage unverified");
  const sourceDetails = ".project-technologies details";
  await page.locator(`${sourceDetails} summary`).click();
  expect(
    await page.locator(sourceDetails).evaluate((node) => (node as HTMLDetailsElement).open),
  ).toBe(true);
  expect(await page.locator(sourceDetails).evaluate((node) => node.textContent)).toContain(
    "artifacts/main.js:12:3",
  );
  expect(await page.locator(sourceDetails).evaluate((node) => node.textContent)).toContain(
    "scene.render",
  );
  expect(
    await page
      .locator(".project-technologies .ant-tag")
      .evaluateAll((nodes) =>
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
  const fields = await page.locator(".technology-explorer__field").evaluateAll((nodes) =>
    nodes.map((node) => ({
      x: node.getBoundingClientRect().x,
      y: node.getBoundingClientRect().y,
      width: node.getBoundingClientRect().width,
    })),
  );
  expect(new Set(fields.map((field) => Math.round(field.y))).size).toBe(1);
  await expect(page.locator('section[aria-label="Project technologies"] h4')).toHaveCount(0);
  await page.setViewportSize({ width: 420, height: 900 });
  await page.waitForFunction(() => {
    const fields = [...document.querySelectorAll(".technology-explorer__field")];
    return (
      fields.length === 3 &&
      new Set(fields.map((node) => Math.round(node.getBoundingClientRect().y))).size === 3
    );
  });
  expect(
    await page
      .locator(".technology-explorer")
      .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
  ).toBe(true);
  await page.setViewportSize({ width: 1200, height: 900 });

  expect(
    await page
      .locator(sectionHeaders)
      .evaluateAll((headers) => headers.map((header) => header.textContent)),
  ).toEqual([
    "Project technologies",
    "User input and settings",
    "Model prompts · 0 prompts",
    "Usage by model and function",
  ]);
  for (const name of [
    "Project technologies",
    "User input and settings",
    "Usage by model and function",
  ]) {
    const header = page.locator(sectionGroup).getByRole("button", { name, exact: true });
    await expect(header).toHaveAttribute("aria-expanded", "true");
    await header.click();
    await expect(header).toHaveAttribute("aria-expanded", "false");
  }
  await expect(page.locator(".technology-explorer")).toBeHidden();
  await expect
    .poll(() =>
      page.locator(sectionGroup).evaluate((group) => {
        const lastHeader = group.querySelector(
          ":scope > .ant-collapse-item:last-child > .ant-collapse-header",
        )!;
        return group.getBoundingClientRect().bottom - lastHeader.getBoundingClientRect().bottom;
      }),
    )
    .toBeLessThanOrEqual(2);
  for (const width of [1200, 420]) {
    await page.setViewportSize({ width, height: 900 });
    const group = page.locator(sectionGroup);
    expect(
      await group.evaluate(
        (element) =>
          element.getBoundingClientRect().right <= document.documentElement.clientWidth &&
          element.scrollWidth <= element.clientWidth + 1,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1200, height: 900 });
  await technologyHeader.click();
  await page.waitForSelector('section[aria-label="Project technologies"] .ant-table-row');

  await page
    .locator('section[aria-label="Project technologies"] .ant-pagination-item-2 a')
    .press("Enter");
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
  await page.locator(`${projectOptions} [data-project-id="option-1"]`).click();
  await page.waitForSelector('.governance-panel[data-project-id="option-1"]');
  await page.locator(".governance-ant-select").click();
  await page.waitForSelector(`${projectOptions} [data-project-id="option-0"]`);
  await expect(page.locator(`${projectOptions} [data-project-id="option-2"]`)).toBeVisible();
  await page
    .locator(`${projectOptions} .ant-select-dropdown-list-holder`)
    .evaluate((list) => list.scrollTo({ top: 1600 }));

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
  expect(await page.locator(reportError).evaluate((node) => node.textContent)).toContain(
    "Unable to load governance data.",
  );
  reportUnavailable = false;
  await refresh.click();
  await expect(page.locator(reportError)).toBeHidden();
  expect(errors).toEqual([]);
});
