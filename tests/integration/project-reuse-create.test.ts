import { buildRouteOf } from "../../src/shared/build-route";
import { afterEach, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { Store } from "../../src/server/jobs/store";
import { loadCatalog } from "../../src/server/catalog/catalog";
import { RequestSchema, type Run } from "../../src/shared/contracts";
import { VideoRequestSchema } from "../../src/shared/domains/video";
import { CreateProjectReuseSchema } from "../../src/shared/project-reuse";
import { createProjectReuseDraft } from "../../src/server/project-reuse/create";
import { writeUploadedAsset } from "../../src/server/requests/asset-storage";
import { writeProjectRequest } from "../../src/server/requests/project-request";
import { prepareNarrationCapability } from "../../src/server/audio/narration";
import { narrationCapability } from "../../src/server/agents/capabilities/narration/capability";
import { individualLanguageTracks, LanguageTrackRowSchema } from "../../src/shared/language-tracks";
const stores: Store[] = [];
const folders: string[] = [];
afterEach(async () => {
  stores.splice(0).forEach((store) => store.close());
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
});
async function fixture() {
  const store = new Store(":memory:");
  stores.push(store);
  const folder = await mkdtemp(path.join(os.tmpdir(), "project-reuse-create-"));
  folders.push(folder);
  const catalog = await loadCatalog();
  const source: Run = {
    id: "example-source",
    phase: "ready",
    createdAt: "2026-01-01",
    request: RequestSchema.parse({
      instructions: "OLD subject to replace",
      provider: "claude",
      candidateCount: 3,
      selectedStyleIds: ["style-001"],
      duration: 90,
      resolution: "1440p",
      frameRate: 60,
      renderer: "multiplane",
      subtitles: { mode: "provided", text: "OLD subtitles" },
      speech: {
        mode: "narration",
        voice: "af_heart",
        source: "provided",
        text: "OLD narration",
        instructions: "OLD script",
      },
    }),
    candidates: [
      {
        id: "direction",
        primaryStyleId: "style-001",
        supportingStyleIds: [],
        sceneRoles: [],
        rationale: "Reference direction",
        feasible: true,
        missingAssets: [],
        score: 90,
        confidence: 1,
        dimensions: {},
      },
    ],
    jobs: [
      {
        id: "example-version",
        runId: "example-source",
        candidateId: "direction",
        kind: "full",
        phase: "ready",
        workspace: "/unused",
        duration: 90,
        video: "final.mp4",
        model: "example-model",
        version: 1,
      },
    ],
  };
  store.save(source);
  const input = CreateProjectReuseSchema.parse({
    projectId: source.id,
    jobId: "example-version",
    operationId: "example-operation",
    idea: "A deeper introduction to emergency vehicles",
  });
  return { store, folder, catalog, source, input };
}
it("creates a real draft with source style/settings and fresh text, preserving the original and stage handoff", async () => {
  const f = await fixture();
  const before = JSON.stringify(f.store.get(f.source.id));
  const result = await createProjectReuseDraft(f.store, f.catalog, f.input, f.folder);
  expect(f.store.room().drafts.new?.id).toBe(result.draftId);
  expect(result.request.candidateCount).toBe(0);
  expect(buildRouteOf(result.request)).toBe("direct-build");
  expect(f.store.get(f.source.id)?.request.candidateCount).toBe(3);
  expect(result.request).toMatchObject({
    instructions: f.input.idea,
    resolution: "1440p",
    frameRate: 60,
    duration: 90,
    renderer: "multiplane",
    selectedStyleIds: ["style-001"],
    subtitles: { mode: "write" },
    speech: { source: "write", text: "", instructions: "" },
    projectReuse: { projectId: f.source.id, jobId: "example-version" },
  });
  expect(JSON.stringify(result.request)).not.toContain("OLD");
  expect(result.request.scriptItems).toBeUndefined();
  expect(await prepareNarrationCapability(f.folder, result.request, 90)).toBe(true);
  expect(narrationCapability(f.folder)?.enabledTools).toContain("create_narration");
  expect(JSON.stringify(f.store.get(f.source.id))).toBe(before);
  expect(f.store.allRuns()).toHaveLength(1);
  await writeProjectRequest(f.folder, result.request);
  const handoff = JSON.parse(await readFile(path.join(f.folder, "PROJECT_REQUEST.json"), "utf8"));
  expect(handoff.projectReuseGuidance.designReferences[0].palette).toBeTruthy();
  expect(handoff.projectReuseGuidance.choices.content).toBe(false);
});
it("keeps inherited English narration and Chinese subtitles active when replacing the script", async () => {
  const f = await fixture();
  const original = VideoRequestSchema.parse(f.source.request);
  original.languageTracks = individualLanguageTracks(original, [
    LanguageTrackRowSchema.parse({
      language: "en",
      generateNarration: true,
      showSubtitles: false,
      speech: original.speech,
    }),
    LanguageTrackRowSchema.parse({
      language: "zh",
      generateNarration: false,
      showSubtitles: true,
      speech: { mode: "narration", language: "zh", voice: "zf_xiaobei" },
    }),
  ]);
  original.scriptItems = [];
  f.source.request = original;
  f.store.save(f.source);
  const result = await createProjectReuseDraft(f.store, f.catalog, f.input, f.folder);
  expect(result.request.scriptItems).toBeUndefined();
  expect(result.request.languageTracks).toMatchObject({
    defaultNarration: "en",
    subtitles: ["zh"],
    narration: [{ language: "en", speech: { voice: "af_heart", source: "write", text: "" } }],
  });
  expect(await prepareNarrationCapability(f.folder, result.request, 90)).toBe(true);
  expect(narrationCapability(f.folder)?.enabledTools).toContain("create_narration");
});
it("replays a successful operation without duplication and rejects changed retries", async () => {
  const f = await fixture();
  const one = await createProjectReuseDraft(f.store, f.catalog, f.input, f.folder);
  const two = await createProjectReuseDraft(f.store, f.catalog, f.input, f.folder);
  expect(two.draftId).toBe(one.draftId);
  expect(two.revision).toBe(one.revision);
  await expect(
    createProjectReuseDraft(
      f.store,
      f.catalog,
      { ...f.input, idea: "Different content with reused operation" },
      f.folder,
    ),
  ).rejects.toThrow("different choices");
});
it("never overwrites a nonempty draft or repeats a reuse already attached to a project", async () => {
  const f = await fixture();
  f.store.patchRoom({
    client: "example-client",
    baseRevision: 0,
    drafts: {
      new: {
        step: 0,
        stepLayout: "separate-video",
        request: { instructions: "An existing user draft" },
        assets: [],
      },
    },
    windows: {},
    views: {},
    questionDrafts: {},
    dismissedQuestions: [],
    force: [],
  });
  await expect(createProjectReuseDraft(f.store, f.catalog, f.input, f.folder)).rejects.toThrow(
    "not overwritten",
  );
  expect(f.store.room().drafts.new?.request.instructions).toBe("An existing user draft");
});
it("copies selected assets to independent new files and owners; foreign selections are rejected", async () => {
  const f = await fixture();
  const asset = await writeUploadedAsset(
    await sharp({ create: { width: 4, height: 4, channels: 3, background: "white" } })
      .png()
      .toBuffer(),
    "example-image.png",
    "image/png",
    f.folder,
  );
  asset.owner = { kind: "project", id: f.source.id };
  f.store.asset(asset);
  f.source.request.assetIds = [asset.id];
  f.store.save(f.source);
  await expect(
    createProjectReuseDraft(
      f.store,
      f.catalog,
      {
        ...f.input,
        choices: { ...f.input.choices, assets: true },
        selectedAssetIds: ["11111111-1111-4111-8111-111111111111"],
      },
      f.folder,
    ),
  ).rejects.toThrow("outside");
  const result = await createProjectReuseDraft(
    f.store,
    f.catalog,
    { ...f.input, choices: { ...f.input.choices, assets: true }, selectedAssetIds: [asset.id] },
    f.folder,
  );
  expect(result.request.assetIds).toHaveLength(1);
  expect(result.request.assetIds[0]).not.toBe(asset.id);
  const copy = f.store.getAsset(result.request.assetIds[0])!;
  expect(copy.owner).toEqual({ kind: "draft", id: result.draftId });
  expect(copy.path).not.toBe(asset.path);
  expect(await readFile(copy.path)).toEqual(await readFile(asset.path));
  expect(f.store.getAsset(asset.id)?.owner).toEqual(asset.owner);
});

it("only returns to direction previews when the source visual direction is explicitly replaced", async () => {
  const f = await fixture();
  const result = await createProjectReuseDraft(
    f.store,
    f.catalog,
    { ...f.input, choices: { ...f.input.choices, visual: false } },
    f.folder,
  );
  expect(result.request.selectedStyleIds).toBeUndefined();
  expect(result.request.candidateCount).toBe(3);
  expect(buildRouteOf(result.request)).toBe("automatic-previews");
});

it("inherits reviewed character identities independently of the old content and rejects unrecorded selections", async () => {
  const f = await fixture();
  f.source.jobs[0].workspace = f.folder;
  f.store.save(f.source);
  const character = {
    id: "guide",
    name: "Scout",
    appearance: "A cream puppy with brown ears and a red cap.",
    personality: "Friendly and patient.",
    role: "On-screen educational guide.",
    evidence: "Reviewed source illustration and storyboard.",
  };
  await writeFile(path.join(f.folder, "CHARACTER_REFERENCES.json"), JSON.stringify([character]));
  const choices = { ...f.input.choices, characters: true, content: false };
  await expect(
    createProjectReuseDraft(
      f.store,
      f.catalog,
      { ...f.input, choices, selectedCharacterIds: [] },
      f.folder,
    ),
  ).rejects.toThrow("Select at least one");
  await expect(
    createProjectReuseDraft(
      f.store,
      f.catalog,
      { ...f.input, choices, selectedCharacterIds: ["foreign"] },
      f.folder,
    ),
  ).rejects.toThrow("not recorded");
  await expect(
    createProjectReuseDraft(
      f.store,
      f.catalog,
      {
        ...f.input,
        choices: { ...f.input.choices, characters: false },
        selectedCharacterIds: ["guide"],
      },
      f.folder,
    ),
  ).rejects.toThrow("Enable character inheritance");
  const result = await createProjectReuseDraft(
    f.store,
    f.catalog,
    { ...f.input, choices, selectedCharacterIds: ["guide"] },
    f.folder,
  );
  expect(result.request.projectReuse?.characters).toEqual([character]);
  expect(result.request.scriptItems).toBeUndefined();
  await writeProjectRequest(f.folder, result.request);
  const handoff = JSON.parse(await readFile(path.join(f.folder, "PROJECT_REQUEST.json"), "utf8"));
  expect(handoff.projectReuseGuidance.characters).toEqual([character]);
  expect(handoff.projectReuseGuidance.characterPolicy).toContain("new topic and script");
  expect(JSON.stringify(handoff)).not.toContain("OLD");
});
