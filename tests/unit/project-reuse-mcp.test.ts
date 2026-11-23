import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, expect, it, vi } from "vitest";
import { Store } from "../../src/server/jobs/store";
import { loadCatalog } from "../../src/server/catalog/catalog";
import { createKitevaMcpTools } from "../../src/server/mcp/tools";
import { RequestSchema, ProductionSchema, type Run } from "../../src/shared/contracts";
import { ProjectReuseChoicesSchema } from "../../src/shared/project-reuse";

const cleanup: (() => unknown | Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
async function setup() {
  const store = new Store(":memory:");
  cleanup.push(() => store.close());
  const run: Run = {
    id: "example-project",
    phase: "ready",
    createdAt: "2026-01-01",
    request: RequestSchema.parse({
      instructions: "Explain a community bookstore",
      resolution: "1080p",
    }),
    candidates: [],
    jobs: [
      {
        id: "completed",
        runId: "example-project",
        candidateId: "direction",
        kind: "full",
        phase: "ready",
        duration: 20,
        version: 2,
        video: "final.mp4",
        workspace: "/private/example-workspace",
        sessionId: "private-session",
        model: "example-model",
      },
      {
        id: "pending",
        runId: "example-project",
        candidateId: "direction",
        kind: "full",
        phase: "generating",
        duration: 20,
        workspace: "/private/example-workspace",
        model: "example-model",
      },
    ],
  };
  store.save(run);
  const start = vi.fn(async () => ({ id: "unexpected-project", phase: "queued" }));
  const server = createKitevaMcpTools({
    store,
    catalog: await loadCatalog(),
    webUrl: "http://127.0.0.1:18419",
    start,
  });
  const client = new Client({ name: "example-client", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  await client.connect(a);
  cleanup.push(
    () => server.close(),
    () => client.close(),
  );
  return { store, client, start };
}
it("registers bounded read-only reuse and lists completed video versions with pagination", async () => {
  const { client, start, store } = await setup();
  const tool = (await client.listTools()).tools.find(
    (tool) => tool.name === "preview_project_reuse",
  );
  expect(tool?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
  const result = await client.callTool({
    name: "preview_project_reuse",
    arguments: { projectId: "example-project", limit: 1 },
  });
  expect(result.structuredContent).toMatchObject({
    kind: "project_reuse_versions",
    total: 1,
    versions: [{ jobId: "completed", version: 2 }],
  });
  const next = await client.callTool({
    name: "preview_project_reuse",
    arguments: { projectId: "example-project", offset: 1, limit: 1 },
  });
  expect(next.structuredContent).toMatchObject({ versions: [], total: 1 });
  expect(start).not.toHaveBeenCalled();
  expect(store.room().drafts.new).toBeUndefined();
});
it("uses shared defaults and reports a preview without leaking workspaces or changing either project or draft", async () => {
  const { client, store, start } = await setup();
  const before = JSON.stringify({ room: store.room(), run: store.get("example-project") });
  const result = await client.callTool({
    name: "preview_project_reuse",
    arguments: {
      projectId: "example-project",
      action: "preview",
      jobId: "completed",
      choices: { palette: false },
    },
  });
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent).toMatchObject({
    kind: "project_reuse_preview",
    jobId: "completed",
    version: 2,
    choices: ProjectReuseChoicesSchema.parse({ palette: false }),
    canCreateDraft: true,
    persisted: false,
    started: false,
    settingsSource: "original_project",
  });
  expect(result.content).toEqual([
    { type: "text", text: JSON.stringify(result.structuredContent) },
  ]);
  expect(JSON.stringify(result)).not.toContain("private-session");
  expect(JSON.stringify(result)).not.toContain("/private/example-workspace");
  expect(JSON.stringify({ room: store.room(), run: store.get("example-project") })).toBe(before);
  expect(start).not.toHaveBeenCalled();
});
it("rejects missing, unfinished, foreign and malformed selections without side effects", async () => {
  const { client, store, start } = await setup();
  const before = JSON.stringify(store.room());
  for (const args of [
    { action: "preview" },
    { action: "preview", jobId: "pending" },
    { action: "preview", jobId: "foreign" },
    {
      action: "preview",
      jobId: "completed",
      choices: { assets: true },
      selectedAssetIds: ["11111111-1111-4111-8111-111111111111"],
    },
    { action: "preview", jobId: "completed", choices: { unknown: true } },
    { limit: 1000 },
  ]) {
    const result = await client.callTool({
      name: "preview_project_reuse",
      arguments: { projectId: "example-project", ...args },
    });
    expect(result.isError).toBe(true);
  }
  expect(JSON.stringify(store.room())).toBe(before);
  expect(start).not.toHaveBeenCalled();
});

it("creates the actual reused draft via its registered tool and supplies the revision needed by start_idea", async () => {
  const { client, store, start } = await setup();
  const tools = (await client.listTools()).tools;
  expect(
    tools.find((tool) => tool.name === "create_project_from_version")?.annotations,
  ).toMatchObject({ readOnlyHint: false, idempotentHint: true });
  const result = await client.callTool({
    name: "create_project_from_version",
    arguments: {
      projectId: "example-project",
      jobId: "completed",
      operationId: "example-reuse-operation",
      idea: "Explain the subject in more depth",
      choices: { visual: false },
    },
  });
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent).toMatchObject({
    kind: "created",
    started: false,
    request: {
      instructions: "Explain the subject in more depth",
      projectReuse: { jobId: "completed" },
    },
  });
  const data = result.structuredContent as { draftId: string; revision: number };
  expect(store.room().drafts.new?.id).toBe(data.draftId);
  expect(store.room().revision).toBe(data.revision);
  expect(start).not.toHaveBeenCalled();
  const replay = await client.callTool({
    name: "create_project_from_version",
    arguments: {
      projectId: "example-project",
      jobId: "completed",
      operationId: "example-reuse-operation",
      idea: "Explain the subject in more depth",
      choices: { visual: false },
    },
  });
  expect(replay.structuredContent).toMatchObject({
    draftId: data.draftId,
    revision: data.revision,
  });
});

it("previews and inherits any recorded mascot through the registered MCP tools without copying the old story", async () => {
  const { client, store, start } = await setup();
  const source = store.get("example-project")!;
  const character = {
    id: "guide",
    name: "Scout",
    appearance: "Cream puppy and red cap.",
    personality: "Friendly.",
    role: "Educational guide.",
    evidence: "Reviewed source design.",
  };
  source.jobs[0].production = ProductionSchema.parse({
    characters: [character],
    pipeline: "HyperFrames",
    fallbackReason: null,
    styleRenderer: ["HTML/CSS"],
    motionEngine: ["GSAP"],
    sourceFile: "film.html",
    duration: 20,
    width: 1920,
    height: 1080,
    audioDescription: "Music",
    limitations: [],
  });
  store.save(source);
  const preview = await client.callTool({
    name: "preview_project_reuse",
    arguments: {
      projectId: source.id,
      action: "preview",
      jobId: "completed",
      choices: { characters: true },
      selectedCharacterIds: ["guide"],
    },
  });
  expect(preview.isError).not.toBe(true);
  expect(preview.structuredContent).toMatchObject({
    characters: [character],
    selectedCharacterIds: ["guide"],
    persisted: false,
  });
  const created = await client.callTool({
    name: "create_project_from_version",
    arguments: {
      projectId: source.id,
      jobId: "completed",
      operationId: "example-character-reuse",
      idea: "A fresh explanation about a different topic",
      choices: { visual: false, characters: true, content: false },
      selectedCharacterIds: ["guide"],
    },
  });
  expect(created.isError).not.toBe(true);
  expect(created.structuredContent).toMatchObject({
    request: {
      projectReuse: { characters: [character], choices: { characters: true, content: false } },
    },
    started: false,
  });
  expect(start).not.toHaveBeenCalled();
});
