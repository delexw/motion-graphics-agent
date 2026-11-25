import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import Fastify from "fastify";
import { expect, it, onTestFinished, vi } from "vitest";
import { mkdtemp, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { Store } from "../../src/server/jobs/store";
import { createKitevaMcpTools } from "../../src/server/mcp/tools";
import { registerKitevaMcpRoutes } from "../../src/server/mcp/routes";
import { loadCatalog } from "../../src/server/catalog/catalog";
import { RoomPatchSchema } from "../../src/shared/room";
import { toggleRoomAsset } from "../../src/shared/brief-attachments";
import { type VideoRequest, VideoRequestSchema } from "../../src/shared/domains/video";
import type { KitevaMcpResult } from "../../src/shared/kiteva-mcp";
import type { AssetOwner } from "../../src/shared/asset-owner";
import type { Run } from "../../src/shared/contracts";
import { kitevaMcpPath } from "../../src/shared/kiteva-mcp";
import { assetLimits } from "../../src/shared/asset-limits";
import { customerToolActivity } from "../../src/shared/activity-model";

async function setup(transport: "memory" | "http" = "memory") {
  const cleanups: (() => Promise<unknown> | void)[] = [];
  onTestFinished(async () => {
    for (const close of cleanups.reverse()) await close();
  });
  const directory = await mkdtemp(path.join(tmpdir(), "mcp-assets-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const store = new Store(":memory:");
  cleanups.push(() => store.close());
  const start = vi.fn(async (request: VideoRequest) => {
    const run = {
      id: randomUUID(),
      request,
      phase: "queued",
      createdAt: new Date().toISOString(),
      candidates: [],
      jobs: [],
    } as Run;
    store.save(run);
    return { id: run.id, phase: run.phase };
  });
  const dependencies = {
    store,
    start,
    catalog: await loadCatalog(),
    webUrl: "http://localhost:18419",
    assetDirectory: path.join(directory, "runtime"),
  };
  const client = new Client({ name: "asset-test", version: "1" });
  let serverUrl: string | undefined;
  if (transport === "http") {
    const app = Fastify();
    registerKitevaMcpRoutes(app, dependencies);
    cleanups.push(() => app.close());
    serverUrl = await app.listen({ host: "127.0.0.1", port: 0 });
    await client.connect(new StreamableHTTPClientTransport(new URL(kitevaMcpPath, serverUrl)));
  } else {
    const server = createKitevaMcpTools(dependencies);
    cleanups.push(() => server.close());
    const [left, right] = InMemoryTransport.createLinkedPair();
    await server.connect(left);
    await client.connect(right);
  }
  cleanups.push(() => client.close());
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = CallToolResultSchema.parse(await client.callTool({ name, arguments: args }));
    return { ...result, data: result.structuredContent as KitevaMcpResult };
  };
  const created = await call("create_idea", { idea: "Create a film using supplied assets" });
  if (created.data.kind !== "created") throw Error("Draft creation failed");
  const target: AssetOwner = { kind: "draft", id: created.data.draftId };
  const file = path.join(directory, "image.png");
  await writeFile(
    file,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aIl0AAAAASUVORK5CYII=",
      "base64",
    ),
  );
  const requestUpload = async (owner: AssetOwner, filename: string, bytes: number) => {
    const result = await call("request_upload", { target: owner, filename, bytes });
    if (result.data.kind !== "upload_requested" || !serverUrl) throw Error("Upload link required");
    return { ...result.data, url: new URL(result.data.uploadUrl, serverUrl) };
  };
  return { store, start, client, call, directory, target, file, requestUpload, cleanups };
}

it("receives raw client bytes through a one-use link and confirms through the UI attachment rules", async () => {
  const { store, call, target, start, requestUpload, client } = await setup("http");
  const filename = "reference.svg";
  const bytes = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg"><!--' +
      "x".repeat(600_000) +
      '--><rect width="1" height="1"/></svg>',
  );
  const before = VideoRequestSchema.parse(store.room().drafts.new.request);
  const ticket = await requestUpload(target, filename, bytes.length);
  const { url, method, headers, uploadId } = ticket;
  expect(url.pathname).toBe(`/mcp/uploads/${uploadId}`);
  expect(Object.keys(headers).sort()).toEqual(["content-type", "x-kiteva-upload-token"]);
  expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(
    expect.arrayContaining(["request_upload", "confirm_upload"]),
  );
  expect((await call("confirm_upload", { uploadId })).isError).toBe(true);

  const upload = () => fetch(url, { method, headers, body: new Uint8Array(bytes) });
  const responses = await Promise.all([upload(), upload()]);
  expect(responses.map(({ status }) => status).sort()).toEqual([204, 403]);
  expect(store.room().drafts.new.request.assetIds || []).toEqual([]);

  const confirmations = await Promise.all([
    call("confirm_upload", { uploadId }),
    call("confirm_upload", { uploadId }),
  ]);
  expect(confirmations.filter((result) => result.isError)).toHaveLength(1);
  const imported = confirmations.find((result) => result.data.kind === "asset_imported")?.data;
  if (imported?.kind !== "asset_imported") throw Error("Import failed");
  const { asset, revision } = imported;
  expect(asset).toMatchObject({
    originalName: filename,
    bytes: bytes.length,
    owner: target,
    attached: true,
  });
  expect(revision).toBe(store.room().revision);
  expect(store.room().drafts.new.request).toEqual(toggleRoomAsset(before, asset, []));
  expect(await readFile(store.getAsset(asset.id)!.path)).toEqual(bytes);
  expect(start).not.toHaveBeenCalled();
  expect(customerToolActivity("mcp__kiteva__request_upload", "tool_call")).toBe(
    "Preparing a file upload…",
  );
  expect(customerToolActivity("confirm_upload", "tool_call")).toBe("Confirming a file upload…");
});

it("rejects unsupported, oversized, unauthorised and expired uploads without attaching anything", async () => {
  const { store, call, target, directory, requestUpload } = await setup("http");
  const before = store.room();
  for (const filename of ["../reference.png", "folder\\reference.png", "reference.exe"]) {
    expect((await call("request_upload", { target, filename, bytes: 1 })).isError).toBe(true);
  }
  expect(
    (
      await call("request_upload", {
        target,
        filename: "reference.png",
        bytes: assetLimits.images.bytes + 1,
      })
    ).data,
  ).toMatchObject({ kind: "error", message: "Images, videos and documents: 10 MB per file" });
  expect(
    (
      await call("request_upload", {
        target: { kind: "draft", id: randomUUID() },
        filename: "reference.png",
        bytes: 1,
      })
    ).isError,
  ).toBe(true);

  const { url, method, headers, uploadId, expiresAt } = await requestUpload(
    target,
    "reference.png",
    1,
  );
  expect(
    (await fetch(url, { method, headers: { "content-type": headers["content-type"] }, body: "x" }))
      .status,
  ).toBe(403);
  expect(
    (
      await fetch(url, {
        method,
        headers: { ...headers, origin: "https://example.com" },
        body: "x",
      })
    ).status,
  ).toBe(403);
  expect((await fetch(url, { method, headers, body: "xy" })).status).toBe(400);
  vi.spyOn(Date, "now").mockReturnValue(Date.parse(expiresAt));
  expect((await fetch(url, { method, headers, body: "x" })).status).toBe(403);
  expect((await call("confirm_upload", { uploadId })).isError).toBe(true);
  expect(store.room()).toEqual(before);
  expect(await readdir(directory)).not.toContain("runtime");
});

it("checks the uploaded document at confirmation and discards rejected bytes", async () => {
  const { store, call, target, directory, requestUpload } = await setup("http");
  const before = store.room();
  const body = "word ".repeat(assetLimits.documents.pages * assetLimits.documents.wordsPerPage + 1);
  const { url, method, headers, uploadId } = await requestUpload(
    target,
    "notes.txt",
    Buffer.byteLength(body),
  );
  expect((await fetch(url, { method, headers, body })).status).toBe(204);
  expect((await call("confirm_upload", { uploadId })).data).toMatchObject({
    kind: "error",
    message: "Documents must total at most 30 pages",
  });
  expect((await call("confirm_upload", { uploadId })).isError).toBe(true);
  expect(store.room()).toEqual(before);
  expect(await readdir(path.join(directory, "runtime", "draft", target.id))).toEqual([]);
});

it("links draft, imported asset and started project IDs and preserves UI attachment semantics", async () => {
  const { store, call, target, file, start } = await setup();
  const before = VideoRequestSchema.parse(store.room().drafts.new.request);
  const imported = await call("import_asset", {
    target,
    source: { kind: "local_file", path: file },
  });
  expect(imported.isError).not.toBe(true);
  if (imported.data.kind !== "asset_imported") throw Error("Import failed");
  const asset = imported.data.asset;
  const uiRequest = toggleRoomAsset(before, asset, []);
  expect(store.room().drafts.new.request).toEqual(uiRequest);
  expect(asset.owner).toEqual(target);
  expect(asset.attached).toBe(true);
  expect(imported.content).not.toEqual([]);
  expect(JSON.stringify(imported.data)).not.toContain(file);
  const read = await call("read_idea", { id: target.id });
  expect(read.data).toMatchObject({ draftId: target.id, request: { assetIds: [asset.id] } });
  const started = await call("start_idea", { draftId: target.id, revision: store.room().revision });
  expect(start).toHaveBeenCalledOnce();
  expect(started.data.kind).toBe("started");
  if (started.data.kind !== "started") throw Error("Start failed");
  expect(started.data.projectId).toBe(started.data.id);
  expect(started.data.draftId).toBe(target.id);
  expect(store.getAsset(asset.id)?.owner).toEqual({ kind: "project", id: started.data.projectId });
  expect(store.room().drafts.new).toBeUndefined();
});

it("matches UI pool Add/Remove without deleting the imported file", async () => {
  const { store, call, target, file } = await setup();
  const imported = await call("import_asset", {
    target,
    source: { kind: "local_file", path: file },
  });
  if (imported.data.kind !== "asset_imported") throw Error("Import failed");
  const assetId = imported.data.asset.id;
  const detached = await call("manage_idea_assets", {
    draftId: target.id,
    action: "detach",
    assetId,
    revision: store.room().revision,
  });
  expect(detached.isError).not.toBe(true);
  expect(detached.data).toMatchObject({
    kind: "assets",
    assets: [expect.objectContaining({ id: assetId, attached: false })],
  });
  expect(store.room().drafts.new.request.assetIds).toEqual([]);
  const attached = await call("manage_idea_assets", {
    draftId: target.id,
    action: "attach",
    assetId,
    revision: store.room().revision,
  });
  expect(attached.isError).not.toBe(true);
  expect(store.room().drafts.new.request.assetIds).toEqual([assetId]);
  const removed = await call("manage_idea_assets", {
    draftId: target.id,
    action: "remove_from_pool",
    assetId,
    revision: store.room().revision,
  });
  expect(removed.isError).not.toBe(true);
  expect(store.library()).toEqual([]);
  expect(store.room().drafts.new.request.assetIds).toEqual([]);
  expect(store.getAsset(assetId)).toBeDefined();
});

it("rejects cross-project reuse, wrong draft ID and stale edits", async () => {
  const { store, call, target, file, start } = await setup();
  const result = await call("import_asset", {
    target: { ...target, id: randomUUID() },
    source: { kind: "local_file", path: file },
  });
  expect(result.isError).toBe(true);
  expect(
    (await call("start_idea", { draftId: randomUUID(), revision: store.room().revision })).isError,
  ).toBe(true);
  expect(start).not.toHaveBeenCalled();
  const imported = await call("import_asset", {
    target,
    source: { kind: "local_file", path: file },
  });
  if (imported.data.kind !== "asset_imported") throw Error("Import failed");
  const assetId = imported.data.asset.id;
  expect(
    (
      await call("manage_idea_assets", {
        draftId: target.id,
        action: "detach",
        assetId,
        revision: 0,
      })
    ).isError,
  ).toBe(true);
  store.transferDraftAssets(target.id, randomUUID(), [assetId]);
  expect(
    (await call("start_idea", { draftId: target.id, revision: store.room().revision })).isError,
  ).toBe(true);
  expect(() =>
    store.patchRoom(
      RoomPatchSchema.parse({
        client: "ui",
        baseRevision: store.room().revision,
        drafts: { new: store.room().drafts.new },
      }),
    ),
  ).toThrow(/different draft or project/);
});

it("imports a ComfyUI view URL through a real local HTTP download", async () => {
  const { call, target, cleanups } = await setup();
  const http = createServer((_req, res) => {
    res.setHeader("content-type", "text/markdown");
    res.end("# Input notes\nUse the selected media.");
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => new Promise<void>((resolve) => http.close(() => resolve())));
  const address = http.address();
  if (!address || typeof address === "string") throw Error("No port");
  const url = `http://127.0.0.1:${address.port}/view?filename=notes.md&type=output`;
  const imported = await call("import_asset", { target, source: { kind: "comfyui_output", url } });
  expect(imported.isError).not.toBe(true);
  expect(imported.data).toMatchObject({
    kind: "asset_imported",
    asset: { originalName: "notes.md", attached: true },
  });
  expect(
    (
      await call("import_asset", {
        target,
        source: { kind: "comfyui_output", url: url.replace("/view?", "/settings?") },
      })
    ).isError,
  ).toBe(true);
});

it("rejects unsupported files and stores imported media only in the runtime target directory", async () => {
  const { call, target, directory, store } = await setup();
  const source = path.join(directory, "source.ts");
  await writeFile(source, "source code");
  expect(
    (await call("import_asset", { target, source: { kind: "local_file", path: source } })).isError,
  ).toBe(true);
  const video = path.join(directory, "clip.mp4");
  await writeFile(video, "test clip bytes");
  const result = await call("import_asset", {
    target,
    source: { kind: "local_file", path: video },
  });
  expect(result.isError).not.toBe(true);
  if (result.data.kind !== "asset_imported") throw Error("Import failed");
  const saved = VideoRequestSchema.parse(store.room().drafts.new.request);
  expect(saved.requirements?.videos.assetIds).toEqual([result.data.asset.id]);
  expect(saved.requirements?.images.assetIds).toEqual([]);
  const read = await call("read_idea", { id: target.id });
  expect(read.data).toMatchObject({
    request: {
      requirements: {
        videos: { assetIds: [result.data.asset.id] },
        images: { assetIds: [] },
      },
    },
  });
  expect(await readdir(path.join(directory, "runtime", "draft", target.id))).toHaveLength(1);
});

it("migrates legacy image-section clips without changing attachment IDs or notes", async () => {
  const { store, target, call } = await setup();
  const id = randomUUID();
  store.asset({
    id,
    name: "legacy.mp4",
    originalName: "legacy.mp4",
    kind: "video/mp4",
    bytes: 10,
    path: "/tmp/legacy.mp4",
  });
  const draft = store.room().drafts.new;
  const request = VideoRequestSchema.parse(draft.request);
  request.assetIds = [id];
  request.requirements = {
    main: { instructions: "", assetIds: [] },
    music: { instructions: "", assetIds: [] },
    images: { instructions: "Preserve this note", assetIds: [id] },
    videos: { instructions: "", assetIds: [] },
    urls: { instructions: "" },
  };
  store.patchRoom(
    RoomPatchSchema.parse({
      client: "legacy",
      baseRevision: store.room().revision,
      drafts: {
        new: {
          ...draft,
          request,
          assets: [{ id, originalName: "legacy.mp4", kind: "video/mp4", bytes: 10 }],
        },
      },
    }),
  );
  for (let attempt = 0; attempt < 2; attempt++) {
    const read = await call("read_idea", { id: target.id });
    expect(read.data).toMatchObject({
      request: {
        assetIds: [id],
        requirements: {
          images: { instructions: "Preserve this note", assetIds: [] },
          videos: { assetIds: [id] },
        },
      },
    });
  }
});

it("keeps project imports scoped and does not restart or change the active build request", async () => {
  const { store, call, file, target, start, requestUpload } = await setup("http");
  const projectId = randomUUID();
  const request = VideoRequestSchema.parse(store.room().drafts.new.request);
  store.save({
    id: projectId,
    request,
    phase: "ready",
    createdAt: "2026-01-01",
    candidates: [],
    jobs: [],
  } as Run);
  const bytes = new Uint8Array(await readFile(file));
  const { url, method, headers, uploadId } = await requestUpload(
    { kind: "project", id: projectId },
    path.basename(file),
    bytes.length,
  );
  expect((await fetch(url, { method, headers, body: bytes })).status).toBe(204);
  const result = await call("confirm_upload", { uploadId });
  expect(result.isError).not.toBe(true);
  if (result.data.kind !== "asset_imported") throw Error("Import failed");
  expect(result.data.asset.attached).toBe(false);
  expect(store.getAsset(result.data.asset.id)?.owner).toEqual({ kind: "project", id: projectId });
  expect(store.get(projectId)?.request).toEqual(request);
  expect(start).not.toHaveBeenCalled();
  expect(
    (
      await call("manage_idea_assets", {
        draftId: target.id,
        action: "attach",
        assetId: result.data.asset.id,
        revision: store.room().revision,
      })
    ).isError,
  ).toBe(true);
});

it("rejects a draft changed during download and removes the unregistered runtime file", async () => {
  const { store, call, target, directory, cleanups } = await setup();
  const http = createServer((_req, res) => {
    const room = store.room();
    store.patchRoom(
      RoomPatchSchema.parse({
        client: "ui",
        baseRevision: room.revision,
        drafts: {
          new: {
            ...room.drafts.new,
            request: {
              ...room.drafts.new.request,
              instructions: "A newer user request that must be kept",
            },
          },
        },
      }),
    );
    res.end("# Reference notes");
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => new Promise<void>((resolve) => http.close(() => resolve())));
  const address = http.address();
  if (!address || typeof address === "string") throw Error("No port");
  const result = await call("import_asset", {
    target,
    source: {
      kind: "comfyui_output",
      url: `http://127.0.0.1:${address.port}/view?filename=notes.md&type=output`,
    },
  });
  expect(result.isError).toBe(true);
  expect(store.room().drafts.new.request.instructions).toBe(
    "A newer user request that must be kept",
  );
  expect(store.room().drafts.new.id).toBe(target.id);
  expect(await readdir(path.join(directory, "runtime", "draft", target.id))).toEqual([]);
});

it("lists a shared UI pool item without attaching it and uses the same Add result", async () => {
  const { store, call, target, file } = await setup();
  const id = randomUUID();
  const asset = {
    id,
    name: id + ".png",
    originalName: "shared.png",
    kind: "image/png",
    bytes: 100,
    path: file,
  };
  store.asset(asset);
  store.addLibraryAsset(id);
  const listed = await call("manage_idea_assets", { draftId: target.id, action: "list" });
  expect(listed.data).toMatchObject({ assets: [expect.objectContaining({ id, attached: false })] });
  const before = VideoRequestSchema.parse(store.room().drafts.new.request);
  await call("manage_idea_assets", {
    draftId: target.id,
    action: "attach",
    assetId: id,
    revision: store.room().revision,
  });
  expect(store.room().drafts.new.request).toEqual(toggleRoomAsset(before, asset, []));
});
