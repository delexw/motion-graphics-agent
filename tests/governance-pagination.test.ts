import { afterEach, expect, it, vi } from "vitest";
import { Store } from "../src/server/jobs/store";
import { createApp } from "../src/server/app";
import { RequestSchema, type Run } from "../src/shared/contracts";
import { GovernanceCache } from "../src/server/governance/cache";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const cleanup: (() => Promise<unknown> | void)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
  vi.restoreAllMocks();
});
const makeRun = (index: number): Run => ({
  id: `project-${index}`,
  createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
  phase: "ready",
  request: RequestSchema.parse({
    instructions: `${index % 2 ? "Forest" : "Ocean"} station ${index}`,
  }),
  candidates: [],
  jobs: [],
});
it("performs bounded SQL pagination and indexed text search, updating search entries on save/delete", () => {
  const store = new Store(":memory:");
  cleanup.push(() => store.close());
  for (let i = 0; i < 26; i++) store.save(makeRun(i));
  const first = store.governanceRuns({ page: 1, pageSize: 5, search: "" });
  expect(first.runs.map((run) => run.id)).toEqual(
    [25, 24, 23, 22, 21].map((index) => `project-${index}`),
  );
  expect(first.pagination.total).toBe(26);
  const search = store.governanceRuns({ page: 2, pageSize: 5, search: "Ocean" });
  expect(search.pagination.total).toBe(13);
  expect(search.runs).toHaveLength(5);
  expect(search.runs.every((run) => run.request.instructions.startsWith("Ocean"))).toBe(true);
  const changed = makeRun(0);
  changed.request.instructions = "Unique observatory";
  store.save(changed);
  expect(
    store.governanceRuns({ page: 1, pageSize: 5, search: "observatory" }).runs.map((run) => run.id),
  ).toEqual([changed.id]);
  store.delete(changed.id);
  expect(
    store.governanceRuns({ page: 1, pageSize: 5, search: "observatory" }).pagination.total,
  ).toBe(0);
  expect(store.governanceRuns({ page: 1, pageSize: 5, search: '" OR 1=1' }).pagination.total).toBe(
    0,
  );
});
it("returns only the requested project/check page and caches unchanged event aggregation", async () => {
  const store = new Store(":memory:");
  for (let i = 0; i < 26; i++) store.save(makeRun(i));
  const { app } = await createApp({ store });
  cleanup.push(() => app.close());
  const all = vi.spyOn(store, "allRuns").mockImplementation(() => {
    throw Error("Must not scan all runs");
  });
  const events = vi.spyOn(store, "allEvents");
  const request = {
    url: "/api/admin/governance?page=2&pageSize=3&search=Ocean",
    headers: { host: "127.0.0.1:4317" },
  };
  const response = await app.inject(request);
  expect(response.statusCode).toBe(200);
  expect(response.json().pagination).toMatchObject({ page: 2, pageSize: 3, total: 13 });
  expect(response.json().projects).toHaveLength(3);
  expect(
    response
      .json()
      .projects.every((project: { technologies?: unknown }) => project.technologies === undefined),
  ).toBe(true);
  expect(all).not.toHaveBeenCalled();
  expect(events).toHaveBeenCalledTimes(3);
  await app.inject(request);
  expect(events).toHaveBeenCalledTimes(3);
  expect(
    (await app.inject({ ...request, url: "/api/admin/governance?pageSize=1000" })).statusCode,
  ).toBe(400);
});
it("invalidates cached reports when project state or event history changes", () => {
  const run = makeRun(1);
  let revision = 1;
  const history = vi.fn(() => []);
  const cache = new GovernanceCache({ latestEventId: () => revision, allEvents: history });
  cache.get(run);
  cache.get(run);
  expect(history).toHaveBeenCalledOnce();
  revision++;
  cache.get(run);
  expect(history).toHaveBeenCalledTimes(2);
  run.request.instructions = "A changed example";
  cache.get(run);
  expect(history).toHaveBeenCalledTimes(3);
});
it("queries technology evidence only through its paged, searched project/job endpoint", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "technology-page-"));
  cleanup.push(() => rm(workspace, { recursive: true, force: true }));
  await writeFile(
    path.join(workspace, "PROJECT_TECHNOLOGIES.json"),
    JSON.stringify({ updatedAt: "2026-01-01T00:00:00Z", fixedNpm: {}, selected: [] }),
  );
  const store = new Store(":memory:");
  const run = makeRun(1);
  run.jobs = [
    {
      id: "job",
      runId: run.id,
      candidateId: "candidate",
      kind: "preview",
      phase: "ready",
      workspace,
      model: "fixture",
      duration: 3,
    },
  ];
  store.save(run);
  const { app } = await createApp({ store });
  cleanup.push(() => app.close());
  const headers = { host: "127.0.0.1:4317" };
  const response = await app.inject({
    url: `/api/admin/governance/${run.id}/technologies?jobId=job&page=2&pageSize=8`,
    headers,
  });
  expect(response.statusCode).toBe(200);
  expect(response.json().entries).toHaveLength(8);
  expect(response.json().pagination.total).toBeGreaterThan(80);
  const search = await app.inject({
    url: `/api/admin/governance/${run.id}/technologies?jobId=job&search=three_js&pageSize=8`,
    headers,
  });
  expect(search.json().entries.map((entry: { id: string }) => entry.id)).toEqual(["three_js"]);
  expect(
    (
      await app.inject({
        url: `/api/admin/governance/${run.id}/technologies?jobId=another`,
        headers,
      })
    ).statusCode,
  ).toBe(404);
});

it("paginates and searches settings checks beyond the former latest-200 limit", () => {
  const store = new Store(":memory:");
  cleanup.push(() => store.close());
  for (let index = 0; index < 230; index++) {
    store.saveSettingsCheck({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      runId: index % 2 ? "example-project" : "other-project",
      requestHash: "a".repeat(64),
      startedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      model: index % 2 ? "fixture-alpha" : "fixture-beta",
      status: "compatible",
      events: [],
    });
  }
  const oldPage = store.settingsCheckPage({ page: 23, pageSize: 10 });
  expect(oldPage.pagination.total).toBe(230);
  expect(oldPage.records).toHaveLength(10);
  expect(oldPage.records.at(-1)?.id).toBe("00000000-0000-4000-8000-000000000000");
  const filtered = store.settingsCheckPage({
    page: 2,
    pageSize: 10,
    projectId: "example-project",
    search: "alpha",
  });
  expect(filtered.pagination.total).toBe(115);
  expect(
    filtered.records.every(
      (record) => record.runId === "example-project" && record.model === "fixture-alpha",
    ),
  ).toBe(true);
});

it("keeps project picker options independent from the filtered report and never aggregates event histories", async () => {
  const store = new Store(":memory:");
  for (let index = 0; index < 26; index++) store.save(makeRun(index));
  const { app } = await createApp({ store });
  cleanup.push(() => app.close());
  const events = vi.spyOn(store, "allEvents");
  const all = vi.spyOn(store, "allRuns").mockImplementation(() => {
    throw Error("No full scans");
  });
  const headers = { host: "127.0.0.1:4317" };
  const report = await app.inject({ url: "/api/admin/governance?projectId=project-1", headers });
  expect(report.json().projects).toHaveLength(1);
  events.mockClear();
  const options = await app.inject({
    url: "/api/admin/governance/projects?page=2&pageSize=5&projectId=project-1",
    headers,
  });
  expect(options.statusCode).toBe(200);
  expect(options.json().pagination).toMatchObject({ page: 2, pageSize: 5, total: 26 });
  expect(options.json().projects).toHaveLength(5);
  expect(options.json().projects[0]).toMatchObject({ id: "project-20", name: expect.any(String) });
  expect(options.json().projects[0]).not.toHaveProperty("request");
  expect(options.json().projects[0]).not.toHaveProperty("activity");
  expect(events).not.toHaveBeenCalled();
  expect(all).not.toHaveBeenCalled();
  const search = await app.inject({
    url: "/api/admin/governance/projects?search=Ocean&pageSize=5",
    headers,
  });
  expect(search.json().pagination.total).toBe(13);
  expect(
    search.json().projects.every((project: { name: string }) => project.name.startsWith("Ocean")),
  ).toBe(true);
  expect(
    (await app.inject({ url: "/api/admin/governance/projects?pageSize=9999", headers })).statusCode,
  ).toBe(400);
});
