import { SettingsConflictError } from "../../src/shared/request-settings-review";
import { CodedError } from "../../src/shared/errors";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect, it, onTestFinished, vi } from "vitest";
import Fastify from "fastify";
import { Store } from "../../src/server/jobs/store";
import { loadCatalog } from "../../src/server/catalog/catalog";
import { createKitevaMcpTools } from "../../src/server/mcp/tools";
import {
  IdeaSettingsSchema,
  ideaRequest,
  kitevaIdeaDefaults,
  kitevaPageIdeaDefaults,
  ideaToolGuidance,
} from "../../src/server/mcp/contract";
import { RoomPatchSchema } from "../../src/shared/room";
import { defaultProviderModels } from "../../src/shared/model-display-name";
import type { Run } from "../../src/shared/contracts";
import { roomDraftRequest, roomSubmission } from "../../src/client/room/onboarding";
import { registerKitevaMcpRoutes } from "../../src/server/mcp/routes";
import { kitevaMcpPath } from "../../src/shared/kiteva-mcp";
import { DEFAULT_WEB_PORT } from "../../src/shared/local-ports";
import { styleGuideSectionNames } from "../../src/shared/agents/schemas/combined-style-guide";

async function connect() {
  const cleanup: (() => Promise<unknown> | void)[] = [];
  onTestFinished(async () => {
    for (const close of cleanup.reverse()) await close();
  });
  const store = new Store(":memory:");
  cleanup.push(() => store.close());
  const start = vi.fn(async () => ({ id: "new-project", phase: "queued" }));
  const server = createKitevaMcpTools({
    store,
    catalog: await loadCatalog(),
    webUrl: `http://127.0.0.1:${DEFAULT_WEB_PORT}`,
    start,
  });
  const client = new Client({ name: "idea-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  await client.connect(a);
  cleanup.push(
    () => server.close(),
    () => client.close(),
  );
  return { store, client, start };
}

it("saves the requested defaults at Review without starting a build", async () => {
  const { store, client, start } = await connect();
  const idea = [
    "Show how a city prepares for spring. Open before sunrise as the first produce truck pulls into the market.",
    "Follow two neighbours through the market as the view widens from crates of seedlings to the square filling with people. End on the first shoots growing outside their building.",
  ].join("\n\n");
  const result = await client.callTool({
    name: "create_idea",
    arguments: { idea },
  });
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent).toMatchObject({
    kind: "created",
    started: false,
    id: "draft:new",
    request: { ...kitevaIdeaDefaults, renderer: "hyperframes" },
  });
  expect(store.room().drafts.new).toMatchObject({
    step: 8,
    request: { instructions: idea, ...kitevaIdeaDefaults },
  });
  expect(start).not.toHaveBeenCalled();
  expect(store.allRuns()).toEqual([]);
  expect(roomSubmission(roomDraftRequest(store.room().drafts.new))).toMatchObject(
    kitevaIdeaDefaults,
  );
});

it("advertises the Music picker styles and saves a style with custom music instructions", async () => {
  const { store, client, start } = await connect();
  const options = await client.callTool({ name: "get_idea_options" });
  expect(options.isError).not.toBe(true);
  const groups = (
    options.structuredContent as { musicStyleGroups: { name: string; styles: string[] }[] }
  ).musicStyleGroups;
  expect(groups).toHaveLength(10);
  expect(groups.flatMap(({ styles }) => styles)).toHaveLength(50);
  expect(groups).toContainEqual({
    name: "Pop",
    styles: ["J-pop", "K-pop", "City Pop", "Indie Pop", "Synthpop"],
  });
  expect(groups.find(({ name }) => name === "Brazilian and Latin")?.styles).toContain("Bossa Nova");

  const instructions = "Use brushed drums, no vocals, and leave the ending quiet.";
  const created = await client.callTool({
    name: "create_idea",
    arguments: {
      idea: "A quiet train journey at dusk.",
      settings: {
        requirements: {
          main: {},
          images: {},
          urls: {},
          music: { style: "City Pop", instructions },
        },
      },
    },
  });
  expect(created.isError).not.toBe(true);
  expect(roomDraftRequest(store.room().drafts.new).requirements?.music).toMatchObject({
    style: "City Pop",
    instructions,
  });
  expect(start).not.toHaveBeenCalled();
});

it("preserves an explicit opt-in of dynamic effort through MCP and the draft", async () => {
  const { store, client } = await connect();
  const result = await client.callTool({
    name: "create_idea",
    arguments: {
      idea: "Explain how a city prepares for spring.",
      settings: { dynamicModelEffort: true },
    },
  });
  expect(result.structuredContent).toMatchObject({
    kind: "created",
    request: { dynamicModelEffort: true },
  });
  expect(roomSubmission(roomDraftRequest(store.room().drafts.new)).dynamicModelEffort).toBe(true);
});
it("uses one settings contract for server instructions, tool descriptions and runtime defaults", async () => {
  const { client } = await connect();
  const tools = (await client.listTools()).tools;
  const create = tools.find((tool) => tool.name === "create_idea")!;
  expect(create.description).toContain(ideaToolGuidance.creation);
  expect(create.description).toContain(ideaToolGuidance.settings);
  expect(create.description).toContain(ideaToolGuidance.idea);
  expect(create.inputSchema.properties?.idea).toMatchObject({
    description: ideaToolGuidance.idea,
  });
  expect(ideaToolGuidance.idea).toContain("in as much detail as possible");
  expect(ideaToolGuidance.idea).toContain("11 style guide sections as a checklist");
  expect(ideaToolGuidance.idea).toContain(styleGuideSectionNames.join(", "));
  expect(client.getInstructions()).toContain(ideaToolGuidance.idea);
  expect(client.getInstructions()).toContain(ideaToolGuidance.settings);
  const settingsSchema = create.inputSchema.properties?.settings as {
    anyOf: { properties: Record<string, { description?: string; default?: unknown }> }[];
  };
  const schema = settingsSchema.anyOf.find(({ properties }) => "renderer" in properties)!;
  for (const field of Object.values(schema.properties))
    expect(field.description?.length).toBeGreaterThan(10);
  for (const [field, value] of Object.entries(kitevaIdeaDefaults)) {
    if (field !== "mainModel") expect(schema.properties[field].default).toBe(value);
  }
  const options = await client.callTool({ name: "get_idea_options" });
  expect(options.isError).not.toBe(true);
  expect(options.structuredContent).toMatchObject({
    kind: "options",
    defaults: kitevaIdeaDefaults,
  });
});

it("lists every supported optional setting so agents ask the user before omitting it", async () => {
  const { client } = await connect();
  const options = await client.callTool({ name: "get_idea_options" });
  const { optionalSettings, settingsSchema } = options.structuredContent as {
    optionalSettings: { name: string; description: string; default?: unknown }[];
    settingsSchema: { properties: Record<string, unknown> };
  };
  expect(optionalSettings.map((setting) => setting.name).sort()).toEqual(
    Object.keys(settingsSchema.properties).sort(),
  );
  for (const setting of optionalSettings) expect(setting.description.length).toBeGreaterThan(10);
  for (const [field, value] of Object.entries(kitevaIdeaDefaults))
    expect(optionalSettings.find((setting) => setting.name === field)?.default).toBe(value);
  expect(ideaToolGuidance.settings).toContain("ask the user about each optionalSettings entry");
  expect(ideaToolGuidance.settings).not.toContain("Omitted fields use the advertised defaults");
});

it("advertises HTML page settings without video controls", async () => {
  const { client, start } = await connect();
  const options = await client.callTool({
    name: "get_idea_options",
    arguments: { outputType: "page" },
  });
  expect(options.isError).not.toBe(true);
  expect(options.structuredContent).toMatchObject({
    kind: "options",
    outputType: "page",
    defaults: kitevaPageIdeaDefaults,
    musicStyleGroups: [],
    settingsSchema: {
      required: expect.arrayContaining(["outputType"]),
      properties: {
        outputType: { const: "page" },
        viewport: { enum: ["desktop", "mobile"], default: "desktop" },
      },
    },
  });
  const { optionalSettings, settingsSchema } = options.structuredContent as {
    optionalSettings: { name: string }[];
    settingsSchema: { properties: Record<string, unknown> };
  };
  expect(optionalSettings.map(({ name }) => name)).toContain("viewport");
  for (const field of ["duration", "renderer", "resolution", "subtitles", "languageTracks"])
    expect(settingsSchema.properties).not.toHaveProperty(field);
  expect(start).not.toHaveBeenCalled();
});

it("rejects video settings on an HTML page without saving a draft", async () => {
  const { client, store, start } = await connect();
  const result = await client.callTool({
    name: "create_idea",
    arguments: {
      idea: "An interactive lesson about folding a paper bus.",
      settings: { outputType: "page", duration: 30 },
    },
  });
  expect(result.isError).toBe(true);
  expect(store.room().drafts.new).toBeUndefined();
  expect(start).not.toHaveBeenCalled();
});

it("preserves explicit choices and uses the selected provider's actual default model", () => {
  const settings = IdeaSettingsSchema.parse({
    provider: "codex",
    resolution: "1080p",
    frameRate: 30,
    renderer: "multiplane",
    preference: "context",
    candidateCount: 2,
    duration: 120,
  });
  expect(ideaRequest("A springtime city story", settings)).toMatchObject({
    ...settings,
    mainModel: defaultProviderModels.codex,
    duration: 120,
  });
  expect(
    ideaRequest("A springtime city story", { mainModel: "explicit-main-model" }).mainModel,
  ).toBe("explicit-main-model");
});

it("advertises and configures Gemini 4 Neon and Gemini 4 Carbon through MCP without silent substitution", async () => {
  const { store, client } = await connect();
  const options = await client.callTool({ name: "get_idea_options" });
  expect(options.isError).not.toBe(true);
  expect(options.structuredContent).toMatchObject({
    kind: "options",
    modelChoices: expect.arrayContaining([
      { provider: "gemini", mainModel: "gemini-4-neon", label: "Gemini 4 Neon" },
      { provider: "gemini", mainModel: "gemini-4-carbon", label: "Gemini 4 Carbon" },
    ]),
  });

  const neonDefault = ideaRequest("A springtime city story", { provider: "gemini" });
  expect(neonDefault).toMatchObject({
    provider: "gemini",
    mainModel: "gemini-4-neon",
  });

  const created = await client.callTool({
    name: "create_idea",
    arguments: {
      idea: "A springtime city story rendered with Gemini Carbon",
      settings: { provider: "gemini", mainModel: "gemini-4-carbon" },
    },
  });
  expect(created.isError).not.toBe(true);
  expect(created.structuredContent).toMatchObject({
    kind: "created",
    request: {
      provider: "gemini",
      mainModel: "gemini-4-carbon",
    },
  });
  expect(store.room().drafts.new.request).toMatchObject({
    provider: "gemini",
    mainModel: "gemini-4-carbon",
  });

  const mismatch = await client.callTool({
    name: "create_idea",
    arguments: {
      idea: "Another story with mismatched provider and model",
      settings: { provider: "claude", mainModel: "gemini-4-carbon" },
    },
  });
  expect(mismatch.isError).toBe(true);
  expect(mismatch.structuredContent).toMatchObject({
    kind: "error",
    message: expect.stringContaining("no silent substitution"),
  });
});

it("rejects unknown settings and applies canonical cross-field validation", async () => {
  const { store, client } = await connect();
  for (const settings of [
    { resolution: "4k" },
    { unexpected: true },
    { candidateCount: 0 },
    { selectedStyleIds: ["style-999"] },
    { assetIds: ["11111111-1111-4111-8111-111111111111"] },
  ]) {
    const result = await client.callTool({
      name: "create_idea",
      arguments: { idea: "A springtime city story", settings },
    });
    expect(result.isError).toBe(true);
    expect(store.room().drafts.new).toBeUndefined();
  }
});

it("saves and starts a separate idea without replacing existing drafts", async () => {
  const { store, client, start } = await httpApp();
  store.patchRoom(
    RoomPatchSchema.parse({
      client: "browser",
      baseRevision: 0,
      drafts: {
        new: { request: { instructions: "My unsaved idea" } },
        "edit:existing": { request: { instructions: "Keep this too" } },
      },
    }),
  );
  const before = store.room();
  const result = await client.callTool({
    name: "create_idea",
    arguments: { idea: "Another new idea" },
  });
  expect(result.isError).not.toBe(true);
  const { draftId, revision } = result.structuredContent as { draftId: string; revision: number };
  expect(draftId).not.toBe(before.drafts.new.id);
  const read = await client.callTool({ name: "read_idea", arguments: { id: draftId } });
  expect(read.structuredContent).toMatchObject({
    kind: "idea",
    draftId,
    revision,
    request: { instructions: "Another new idea" },
  });
  expect(start).not.toHaveBeenCalled();
  const started = await client.callTool({ name: "start_idea", arguments: { draftId, revision } });
  expect(started.structuredContent).toMatchObject({ kind: "started", draftId });
  expect(start).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ instructions: "Another new idea" }),
    { draftId, revision },
  );
  expect(store.room().drafts).toEqual(before.drafts);
});

it("does not overwrite a draft created by another client between read and save", async () => {
  const { store, client } = await connect();
  const patch = store.patchRoom.bind(store);
  vi.spyOn(store, "patchRoom").mockImplementationOnce((incoming) => {
    patch(
      RoomPatchSchema.parse({
        client: "other-agent",
        baseRevision: 0,
        drafts: { new: { request: { instructions: "A concurrently saved idea" } } },
      }),
    );
    return patch(incoming);
  });
  const result = await client.callTool({
    name: "create_idea",
    arguments: { idea: "A different new idea" },
  });
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent).toMatchObject({ id: expect.stringMatching(/^draft:idea:/) });
  expect(store.room().drafts.new.request.instructions).toBe("A concurrently saved idea");
});

it("attaches public source metadata without exposing local file locations", async () => {
  const { store, client } = await connect();
  const id = "11111111-1111-4111-8111-111111111111";
  store.asset({
    id,
    name: "source.pdf",
    originalName: "Source notes.pdf",
    path: "/private/source.pdf",
    kind: "application/pdf",
    bytes: 100,
  });
  const result = await client.callTool({
    name: "create_idea",
    arguments: {
      idea: "Explain the attached notes",
      settings: {
        assetIds: [id],
        requirements: { main: { assetIds: [id] }, images: {}, music: {}, urls: {} },
      },
    },
  });
  expect(result.isError).not.toBe(true);
  expect(store.room().drafts.new.assets).toEqual([
    { id, originalName: "Source notes.pdf", kind: "application/pdf", bytes: 100 },
  ]);
  expect(JSON.stringify(result)).not.toContain("/private/");
});

it("searches older projects as well as drafts without returning execution data", async () => {
  const { store, client } = await connect();
  for (let i = 0; i < 55; i++) {
    const run: Run = {
      id: `project-${i}`,
      request: ideaRequest(i === 0 ? "Secret garden animation" : `City animation ${i}`, {}),
      createdAt: new Date().toISOString(),
      phase: "ready",
      candidates: [],
      jobs: [],
    };
    store.save(run);
  }
  const result = await client.callTool({ name: "search_ideas", arguments: { query: "garden" } });
  expect(result.structuredContent).toMatchObject({
    kind: "search",
    ideas: [{ id: "project-0", name: "Secret garden animation" }],
  });
  expect(JSON.stringify(result)).not.toContain('"jobs"');
  const styles = await client.callTool({
    name: "search_styles",
    arguments: { query: "", limit: 2 },
  });
  expect(styles.structuredContent).toMatchObject({
    kind: "styles",
    styles: [{ id: expect.any(String) }, { id: expect.any(String) }],
  });
  expect(JSON.stringify(styles)).not.toContain("executable_prompt_template");
});

it("rejects a stale submission and only calls the build API on explicit start", async () => {
  const { store, client, start } = await connect();
  await client.callTool({ name: "create_idea", arguments: { idea: "A springtime city story" } });
  const stale = await client.callTool({ name: "start_idea", arguments: { revision: 0 } });
  expect(stale.isError).toBe(true);
  expect(start).not.toHaveBeenCalled();
  const read = await client.callTool({ name: "read_idea", arguments: { id: "draft:new" } });
  expect(read.structuredContent).toMatchObject({ kind: "idea", revision: store.room().revision });
  const sourceDraft = { draftId: store.room().drafts.new.id, revision: store.room().revision };
  const result = await client.callTool({
    name: "start_idea",
    arguments: { revision: store.room().revision },
  });
  expect(result.structuredContent).toMatchObject({ kind: "started", id: "new-project" });
  expect(start).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining(kitevaIdeaDefaults),
    sourceDraft,
  );
  expect(store.room().drafts.new).toBeUndefined();
});

it("keeps the draft when starting fails and never silently retries", async () => {
  const { store, client, start } = await connect();
  await client.callTool({ name: "create_idea", arguments: { idea: "A springtime city story" } });
  start.mockRejectedValueOnce(Error("Backend unavailable"));
  const result = await client.callTool({
    name: "start_idea",
    arguments: { revision: store.room().revision },
  });
  expect(result.isError).toBe(true);
  expect(store.room().drafts.new).toBeDefined();
  expect(start).toHaveBeenCalledTimes(1);
});

it("preserves edits made while the previous draft is being submitted", async () => {
  const { store, client, start } = await connect();
  await client.callTool({ name: "create_idea", arguments: { idea: "A springtime city story" } });
  start.mockImplementationOnce(async () => {
    store.patchRoom(
      RoomPatchSchema.parse({
        client: "browser",
        baseRevision: store.room().revision,
        drafts: { new: { request: { instructions: "My newer edited idea" } } },
      }),
    );
    return { id: "submitted-project", phase: "queued" };
  });
  const result = await client.callTool({
    name: "start_idea",
    arguments: { revision: store.room().revision },
  });
  expect(result.structuredContent).toMatchObject({ kind: "started", id: "submitted-project" });
  expect(store.room().drafts.new.request.instructions).toBe("My newer edited idea");
});

async function httpApp() {
  const cleanup: (() => Promise<unknown> | void)[] = [];
  onTestFinished(async () => {
    for (const close of cleanup.reverse()) await close();
  });
  const store = new Store(":memory:");
  const app = Fastify();
  const start = vi.fn(async () => ({ id: "http-project", phase: "queued" }));
  registerKitevaMcpRoutes(app, {
    store,
    catalog: await loadCatalog(),
    webUrl: `http://127.0.0.1:${DEFAULT_WEB_PORT}`,
    start,
  });
  cleanup.push(
    () => store.close(),
    () => app.close(),
  );
  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  const client = new Client({ name: "http-test", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(kitevaMcpPath, address)));
  cleanup.push(() => client.close());
  return { store, app, client, start, address };
}

it("saves and starts an HTML page through the existing MCP tools over HTTP", async () => {
  const { client, store, start } = await httpApp();
  const video = await client.callTool({
    name: "create_idea",
    arguments: { idea: "A springtime city story" },
  });
  expect(video.isError).not.toBe(true);
  const idea = "An interactive lesson about folding a paper bus.";
  const settings = {
    outputType: "page",
    viewport: "mobile",
    provider: "codex",
    candidateCount: 0,
    selectedStyleIds: ["style-048"],
  };
  const created = await client.callTool({
    name: "create_idea",
    arguments: { idea, settings },
  });
  expect(created.isError).not.toBe(true);
  const data = created.structuredContent as { draftId: string; id: string; revision: number };
  expect(created.structuredContent).toMatchObject({
    kind: "created",
    request: { instructions: idea, ...settings, mainModel: defaultProviderModels.codex },
    started: false,
  });
  expect(data.id).not.toBe("draft:new");
  const saved = store.room().drafts[data.id.slice("draft:".length)];
  expect(roomSubmission(roomDraftRequest(saved))).toMatchObject(settings);
  expect(start).not.toHaveBeenCalled();

  const read = await client.callTool({ name: "read_idea", arguments: { id: data.id } });
  expect(read.structuredContent).toMatchObject({
    kind: "idea",
    request: { instructions: idea, ...settings },
    revision: data.revision,
  });
  const started = await client.callTool({
    name: "start_idea",
    arguments: { draftId: data.draftId, revision: data.revision },
  });
  expect(started.structuredContent).toMatchObject({ kind: "started", projectId: "http-project" });
  expect(start).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ instructions: idea, ...settings }),
    { draftId: data.draftId, revision: data.revision },
  );
  expect(store.room().drafts.new.request.outputType).toBe("video");
  expect(store.room().drafts[data.id.slice("draft:".length)]).toBeUndefined();
});

it("serves the full MCP protocol over the application's URL without a local launcher", async () => {
  const { client, store, start } = await httpApp();
  expect((await client.listTools()).tools.map((tool) => tool.name)).toContain("create_idea");
  expect(client.getInstructions()).toContain(ideaToolGuidance.settings);
  const result = await client.callTool({ name: "get_idea_options" });
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent).toMatchObject({ defaults: kitevaIdeaDefaults });
  const created = await client.callTool({
    name: "create_idea",
    arguments: { idea: "A springtime city story" },
  });
  expect(created.structuredContent).toMatchObject({ kind: "created", request: kitevaIdeaDefaults });
  expect(start).not.toHaveBeenCalled();
  const read = await client.callTool({ name: "read_idea", arguments: { id: "draft:new" } });
  expect(read.structuredContent).toMatchObject({ revision: store.room().revision });
  const started = await client.callTool({
    name: "start_idea",
    arguments: { revision: store.room().revision },
  });
  expect(started.structuredContent).toMatchObject({ kind: "started", id: "http-project" });
  expect(start).toHaveBeenCalledTimes(1);
});

it("rejects foreign origins and rebinding hosts at the HTTP boundary", async () => {
  const { app, start } = await httpApp();
  for (const headers of [
    { host: "example.com" },
    { host: "127.0.0.1", origin: "https://example.com" },
    { host: "127.0.0.1", origin: "null" },
  ]) {
    const response = await app.inject({
      method: "POST",
      url: kitevaMcpPath,
      headers,
      payload: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    });
    expect(response.statusCode).toBe(403);
  }
  expect(start).not.toHaveBeenCalled();
});

it("rejects overlapping HTTP starts rather than creating duplicate builds", async () => {
  const { client, start, store } = await httpApp();
  await client.callTool({ name: "create_idea", arguments: { idea: "A springtime city story" } });
  let release: (value: { id: string; phase: string }) => void = () => {};
  start.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const first = client.callTool({
    name: "start_idea",
    arguments: { revision: store.room().revision },
  });
  await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));
  try {
    const second = await client.callTool({
      name: "start_idea",
      arguments: { revision: store.room().revision },
    });
    expect(second.isError).toBe(true);
    expect(start).toHaveBeenCalledTimes(1);
  } finally {
    release({ id: "http-project", phase: "queued" });
    await first;
  }
});

it("reports structured setting conflicts without clearing or starting the draft", async () => {
  const { store, client, start } = await connect();
  await client.callTool({
    name: "create_idea",
    arguments: { idea: "Make a vertical product video" },
  });
  const before = structuredClone(store.room());
  const details = {
    requestHash: "a".repeat(64),
    model: "jev-1.14.0",
    conflicts: [
      {
        setting: "aspectRatio" as const,
        value: "16:9",
        source: { field: "instructions", label: "Main idea" },
      },
    ],
  };
  start.mockRejectedValueOnce(new SettingsConflictError(details));
  const response = await client.callTool({
    name: "start_idea",
    arguments: { revision: before.revision },
  });
  expect(response.isError).toBe(true);
  expect(response.structuredContent).toMatchObject({
    kind: "settings_conflict",
    draftId: before.drafts.new?.id,
    revision: before.revision,
    details,
  });
  expect(store.room()).toEqual(before);
  expect(store.allRuns()).toEqual([]);
});
it("reports an unavailable settings check without losing the draft", async () => {
  const { store, client, start } = await connect();
  await client.callTool({
    name: "create_idea",
    arguments: { idea: "An ordinary illustrated story" },
  });
  const before = structuredClone(store.room());
  start.mockRejectedValueOnce(
    new CodedError("SETTINGS_CHECK_UNAVAILABLE", "The check is unavailable", 503),
  );
  const response = await client.callTool({
    name: "start_idea",
    arguments: { revision: before.revision },
  });
  expect(response.isError).toBe(true);
  expect(response.structuredContent).toMatchObject({ kind: "settings_check_unavailable" });
  expect(store.room()).toEqual(before);
});

it("confirms each language independently and reports both new-language defaults disabled", async () => {
  const { client, start } = await connect();
  const options = await client.callTool({ name: "get_idea_options" });
  expect(options.structuredContent).toMatchObject({
    languageDefaults: { generateNarration: false, showSubtitles: false },
  });
  const result = await client.callTool({
    name: "create_idea",
    arguments: {
      idea: "Explain an example concept",
      settings: {
        languageTracks: {
          narration: [],
          subtitles: ["zh"],
          languages: [
            { language: "en", speech: { mode: "narration", voice: "af_heart" } },
            {
              language: "zh",
              showSubtitles: true,
              speech: { mode: "narration", voice: "zf_xiaobei" },
            },
          ],
          defaultSubtitle: "zh",
        },
      },
    },
  });
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent).toMatchObject({
    languageSettings: [
      { language: "en", generateNarration: false, showSubtitles: false },
      { language: "zh", generateNarration: false, showSubtitles: true },
    ],
  });
  const read = await client.callTool({ name: "read_idea", arguments: { id: "draft:new" } });
  expect(read.structuredContent).toMatchObject({
    languageSettings: [
      { language: "en", generateNarration: false, showSubtitles: false },
      { language: "zh", generateNarration: false, showSubtitles: true },
    ],
  });
  expect(start).not.toHaveBeenCalled();
});

it("guides agents to confirm primary narration/subtitle languages without enabling them by default", async () => {
  const { client } = await connect();
  const tools = (await client.listTools()).tools;
  const create = tools.find((tool) => tool.name === "create_idea")!;
  expect(create.description).toContain(
    "at least one primary narration language and one primary subtitle language",
  );
  expect(create.description).toContain("ask the user to confirm");
  expect(create.description).toContain("does not enable either function");
  const options = await client.callTool({ name: "get_idea_options" });
  expect(options.structuredContent).toMatchObject({
    settingsSchema: {
      properties: { languageTracks: { description: expect.stringContaining("default to false") } },
    },
  });
});
