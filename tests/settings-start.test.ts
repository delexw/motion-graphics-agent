import { deferred } from "./fixtures/deferred";
import { afterEach, expect, it, vi } from "vitest";
import { rm } from "node:fs/promises";
import path from "node:path";
import { createApp } from "../src/server/app";
import { Store } from "../src/server/jobs/store";
import { Workflow } from "../src/server/jobs/workflow";
import { dataRoot } from "../src/server/runtime/config";
import { CodedError } from "../src/shared/errors";
import { RequestSchema } from "../src/shared/contracts";
import { RoomPatchSchema } from "../src/shared/room";
import { randomUUID } from "node:crypto";

const review = vi.hoisted(() => vi.fn());
vi.mock("../src/server/jev/strategies/settings-conflict", async (original) => ({
  ...(await original<typeof import("../src/server/jev/strategies/settings-conflict")>()),
  reviewRequestSettings: review,
}));
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
  vi.restoreAllMocks();
  review.mockReset();
});
const report = { requestHash: "a".repeat(64), model: "jev-1.14.0", conflicts: [] };
async function fixture() {
  const store = new Store(":memory:");
  const server = await createApp({ store });
  const prepare = vi.spyOn(Workflow.prototype, "prepare").mockResolvedValue();
  cleanup.push(async () => {
    const ids = store.list().map((run) => run.id);
    await server.app.close();
    for (const id of ids)
      await rm(path.join(dataRoot, "runs", id), { recursive: true, force: true });
  });
  return { ...server, prepare };
}
const headers = { host: "127.0.0.1:4317" };
it.each([
  { candidateCount: 0, selectedStyleIds: ["style-001"] },
  { candidateCount: 2 },
  { outputType: "page", viewport: "mobile", candidateCount: 1 },
])("blocks conflicting starts before saving or generation (%j)", async (route) => {
  const { app, store, prepare } = await fixture();
  review.mockResolvedValue({
    ...report,
    conflicts: [
      {
        setting: "aspectRatio",
        value: "16:9",
        source: { field: "instructions", label: "Main idea" },
      },
    ],
  });
  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers,
    payload: { instructions: "Make a vertical video story", ...route },
  });
  expect(response.statusCode).toBe(409);
  expect(response.json()).toMatchObject({
    code: "SETTINGS_CONFLICT",
    details: { conflicts: [{ setting: "aspectRatio", value: "16:9" }] },
  });
  expect(store.list()).toEqual([]);
  expect(prepare).not.toHaveBeenCalled();
  expect(review).toHaveBeenCalledOnce();
  const governance = await app.inject({ method: "GET", url: "/api/admin/governance", headers });
  expect(governance.json()).toMatchObject({
    models: expect.arrayContaining([
      expect.objectContaining({ function: "Request/settings compatibility check" }),
    ]),
    settingsChecks: [
      {
        status: "conflict",
        model: "jev-1.14.0",
        review: {
          conflicts: [
            {
              setting: "aspectRatio",
              value: "16:9",
              source: { field: "instructions", label: "Main idea" },
            },
          ],
        },
      },
    ],
  });
  expect(store.settingsChecks()[0].runId).toBeUndefined();
});
it("does not start a project when JEV cannot check", async () => {
  const { app, store, prepare } = await fixture();
  review.mockRejectedValue(
    new CodedError("SETTINGS_CHECK_UNAVAILABLE", "Nothing has started", 503),
  );
  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers,
    payload: { instructions: "A clear illustrated story" },
  });
  expect(response.json().code).toBe("SETTINGS_CHECK_UNAVAILABLE");
  expect(response.statusCode).toBe(503);
  expect(store.list()).toEqual([]);
  expect(prepare).not.toHaveBeenCalled();
});
it("only starts the unchanged request after the check completes", async () => {
  const { app, store, prepare } = await fixture();
  const pending = deferred();
  review.mockReturnValue(pending.promise.then(() => report));
  const request = RequestSchema.parse({
    instructions: "Explain how a seed grows",
    candidateCount: 0,
    selectedStyleIds: ["style-001"],
  });
  const response = app.inject({ method: "POST", url: "/api/runs", headers, payload: request });
  await vi.waitFor(() => expect(review).toHaveBeenCalledOnce());
  expect(store.list()).toEqual([]);
  expect(prepare).not.toHaveBeenCalled();
  pending.resolve();
  const result = await response;
  expect(result.statusCode).toBe(202);
  expect(store.list()).toHaveLength(1);
  expect(store.list()[0].request).toEqual(request);
  expect(prepare).toHaveBeenCalledOnce();
});
it("rejects an identical concurrent submit without a second check or project", async () => {
  const { app, store } = await fixture();
  const pending = deferred();
  review.mockReturnValue(pending.promise.then(() => report));
  const payload = { instructions: "An ordinary visual explanation" };
  const first = app.inject({ method: "POST", url: "/api/runs", headers, payload });
  await vi.waitFor(() => expect(review).toHaveBeenCalledOnce());
  const second = await app.inject({ method: "POST", url: "/api/runs", headers, payload });
  expect(second.statusCode).toBe(409);
  expect(second.json().code).toBe("PROJECT_ACTIVE");
  expect(review).toHaveBeenCalledOnce();
  pending.resolve();
  expect((await first).statusCode).toBe(202);
  expect(store.list()).toHaveLength(1);
});
it("rejects an edited draft and retains it instead of starting stale settings", async () => {
  const { app, store, prepare } = await fixture();
  const draftId = randomUUID();
  const request = RequestSchema.parse({ instructions: "Original saved idea" });
  store.patchRoom(
    RoomPatchSchema.parse({
      client: "fixture",
      baseRevision: store.room().revision,
      drafts: { new: { id: draftId, request, step: 8 } },
    }),
  );
  const pending = deferred();
  review.mockReturnValue(pending.promise.then(() => report));
  const response = app.inject({ method: "POST", url: "/api/runs", headers, payload: request });
  await vi.waitFor(() => expect(review).toHaveBeenCalledOnce());
  store.patchRoom(
    RoomPatchSchema.parse({
      client: "fixture",
      baseRevision: store.room().revision,
      drafts: {
        new: {
          id: draftId,
          request: { ...request, instructions: "An edited idea from another tab" },
          step: 8,
        },
      },
    }),
  );
  pending.resolve();
  expect((await response).statusCode).toBe(409);
  expect(prepare).not.toHaveBeenCalled();
  expect(store.list()).toEqual([]);
  expect(store.room().drafts.new?.request.instructions).toBe("An edited idea from another tab");
});

it("rechecks corrected settings after a blocked attempt instead of caching the conflict", async () => {
  const { app, store, prepare } = await fixture();
  review
    .mockResolvedValueOnce({
      ...report,
      conflicts: [
        { setting: "frameRate", value: 60, source: { field: "instructions", label: "Main idea" } },
      ],
    })
    .mockResolvedValueOnce(report);
  const payload = { instructions: "Use 30 fps for this story", frameRate: 60 };
  expect(
    (await app.inject({ method: "POST", url: "/api/runs", headers, payload })).statusCode,
  ).toBe(409);
  expect(store.list()).toEqual([]);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/runs",
        headers,
        payload: { ...payload, frameRate: 30 },
      })
    ).statusCode,
  ).toBe(202);
  expect(review).toHaveBeenCalledTimes(2);
  expect(prepare).toHaveBeenCalledOnce();
  expect(store.list()[0].request).toMatchObject({
    frameRate: 30,
    instructions: payload.instructions,
  });
});
