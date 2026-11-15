import { normalizeStyleSelection } from "../../shared/style-selection";
import { selectedSourceCharacters } from "./characters";
import { createHash, randomUUID } from "node:crypto";
import { readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import {
  CreateProjectReuseSchema,
  projectReuseSource,
  type CreateProjectReuse,
} from "../../shared/project-reuse";
import { VideoRequestSchema } from "../../shared/domains/video";
import { languageTrackRows, individualLanguageTracks } from "../../shared/language-tracks";
import type { SpeechSettings } from "../../shared/speech";
import { RoomDraftSchema, hasRoomDraftContent } from "../../shared/room";
import { toggleRoomAsset } from "../../shared/brief-attachments";
import { BriefRequirementsSchema } from "../../shared/brief-sections";
import type { Asset } from "../../shared/contracts";
import type { Store } from "../jobs/store";
import type { Catalog } from "../catalog/catalog";
import { writeUploadedAsset } from "../requests/asset-storage";
import { validateAssetLimits } from "../../shared/asset-limits";
import { dataRoot } from "../runtime/paths";

function cleanSpeech(
  speech: Extract<SpeechSettings, { mode: "narration" }>,
  keepContent: boolean,
): Extract<SpeechSettings, { mode: "narration" }> {
  if (keepContent) return structuredClone(speech);
  return { ...speech, source: "write", text: "", instructions: "" };
}
/** One creation owner for HTTP and MCP; normal start_idea owns generation and settings review. */
export async function createProjectReuseDraft(
  store: Store,
  catalog: Pick<Catalog, "styles">,
  raw: CreateProjectReuse,
  assetDirectory = path.join(dataRoot, "uploads"),
) {
  const input = CreateProjectReuseSchema.parse(raw);
  const inputHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const room = store.room();
  const replay = room.drafts.new;
  if (
    replay?.request.projectReuse &&
    typeof replay.request.projectReuse === "object" &&
    "operationId" in replay.request.projectReuse &&
    replay.request.projectReuse.operationId === input.operationId
  ) {
    const request = VideoRequestSchema.parse(replay.request);
    if (request.projectReuse?.inputHash !== inputHash)
      throw Error("This operation ID was already used with different choices");
    if (
      request.projectReuse?.projectId !== input.projectId ||
      request.projectReuse.jobId !== input.jobId
    )
      throw Error("Operation ID belongs to a different source");
    return { draftId: replay.id!, request, revision: room.revision };
  }
  if (store.projectForReuseOperation(input.operationId))
    throw Error("This reuse operation already started a project; it was not duplicated.");
  if (hasRoomDraftContent(room.drafts.new))
    throw Error(
      "A New idea draft already exists; review it in Kiteva first. It was not overwritten.",
    );
  const project = store.get(input.projectId);
  if (!project) throw Error("Source project not found");
  const source = projectReuseSource(project, input.jobId);
  if (!source) throw Error("Choose a completed video version in this project");
  const choices = input.choices;
  const characters = await selectedSourceCharacters(
    source,
    choices.characters,
    input.selectedCharacterIds,
  );
  const original = source.request;
  const idea = input.idea.trim() || (choices.content ? original.instructions : "");
  if (idea.length < 8) throw Error("Describe the new project before creating its draft");
  if (input.selectedAssetIds.length && !choices.assets)
    throw Error("Enable source asset inheritance before selecting files");
  const musicIds = choices.musicRecording ? original.requirements?.music.assetIds || [] : [];
  if (choices.musicRecording && !musicIds.length)
    throw Error("No uploaded source music recording is available to copy");
  const selected = [...new Set([...(choices.assets ? input.selectedAssetIds : []), ...musicIds])];
  if (selected.some((id) => !original.assetIds.includes(id)))
    throw Error("Selected asset is outside the source version");
  store.assertAssetOwner(selected, { kind: "project", id: project.id });
  const originals = selected.map((id) => {
    const asset = store.getAsset(id);
    if (!asset) throw Error("Source attachment is unavailable");
    return asset;
  });
  validateAssetLimits(originals);
  const id = randomUUID();
  const copied: Asset[] = [];
  const mapping = new Map<string, string>();
  try {
    for (const asset of originals) {
      const info = await stat(asset.path);
      validateAssetLimits([...copied, { ...asset, bytes: info.size }]);
      const copy = await writeUploadedAsset(
        await readFile(asset.path),
        asset.originalName || asset.name,
        asset.kind,
        assetDirectory,
        copied,
      );
      copy.owner = { kind: "draft", id };
      copied.push(copy);
      mapping.set(asset.id, copy.id);
    }
    if (choices.visual && !source.candidate) throw Error("Source direction is unavailable");
    const selection = normalizeStyleSelection({
      candidateCount: choices.visual ? 0 : original.candidateCount,
      selectedStyleIds:
        choices.visual && source.candidate
          ? [source.candidate.primaryStyleId, ...source.candidate.supportingStyleIds]
          : [],
    });
    let request = VideoRequestSchema.parse({
      instructions: idea,
      provider: original.provider,
      mainModel: original.mainModel,
      preference:
        choices.visual && original.preference === "random" ? "context" : original.preference,
      ...selection,
      ...(choices.output ? { duration: original.duration } : {}),
      outputLanguage: original.outputLanguage,
    });
    if (choices.output)
      request = {
        ...request,
        aspectRatio: original.aspectRatio,
        resolution: original.resolution,
        frameRate: original.frameRate,
        duration: original.duration,
        renderer: original.renderer,
      };
    if (choices.visual) {
      if (!source.candidate) throw Error("Source direction is unavailable");
      request.selectedStyleIds = [
        source.candidate.primaryStyleId,
        ...source.candidate.supportingStyleIds,
      ];
      request.pinnedStyleId = source.candidate.primaryStyleId;
    }
    const requirements = BriefRequirementsSchema.parse(
      choices.content
        ? structuredClone(
            original.requirements || { main: {}, images: {}, videos: {}, music: {}, urls: {} },
          )
        : { main: {}, images: {}, videos: {}, music: {}, urls: {} },
    );
    for (const section of ["main", "images", "videos", "music"] as const)
      requirements[section].assetIds = [];
    requirements.music.instructions = choices.music
      ? original.requirements?.music.instructions || ""
      : "";
    request.requirements = requirements;
    if (choices.content) {
      request.scriptItems = structuredClone(original.scriptItems);
      request.urls = [...original.urls];
      request.translations = structuredClone(original.translations);
      request.subtitles = structuredClone(original.subtitles);
    } else {
      request.subtitles = { mode: "off" };
    }
    if (choices.voice) {
      if (original.speech?.mode === "uploaded") {
        const assetId = mapping.get(original.speech.assetId);
        if (!assetId) throw Error("Select the uploaded narration recording to inherit it");
        request.speech = { ...original.speech, assetId };
      } else if (original.speech)
        request.speech =
          original.speech.mode === "narration"
            ? cleanSpeech(original.speech, choices.content)
            : structuredClone(original.speech);
      const rows = languageTrackRows(original).map((row) => ({
        ...row,
        speech: cleanSpeech(row.speech, choices.content),
      }));
      if (rows.length) request.languageTracks = individualLanguageTracks(original, rows);
      else
        request.subtitles =
          original.subtitles && original.subtitles.mode !== "off"
            ? choices.content
              ? structuredClone(original.subtitles)
              : { mode: "write" }
            : { mode: "off" };
    }
    const references = source.candidate
      ? [source.candidate.primaryStyleId, ...source.candidate.supportingStyleIds]
      : [];
    request.projectReuse = {
      projectId: project.id,
      jobId: source.job.id,
      version: source.version,
      operationId: input.operationId,
      inputHash,
      choices,
      ...(choices.characters ? { characters } : {}),
      styles: references.map((styleId) => {
        const style = catalog.styles.find((entry) => entry.id === styleId);
        if (!style) throw Error("Source Motion Graphic is no longer available");
        return {
          id: style.id,
          name: style.name_en,
          ...(choices.visual ? { visualCues: style.visual_cues } : {}),
          ...(choices.palette ? { palette: style.palette.tokens } : {}),
        };
      }),
      ...(choices.visual ? { styleRenderer: source.job.production?.styleRenderer } : {}),
      ...(choices.motion ? { motionEngine: source.job.production?.motionEngine } : {}),
    };
    for (const asset of copied)
      request = VideoRequestSchema.parse(
        toggleRoomAsset(
          request,
          { ...asset, originalName: asset.originalName || asset.name },
          copied
            .filter((other) => request.assetIds.includes(other.id))
            .map((other) => ({ ...other, originalName: other.originalName || other.name })),
        ),
      );
    request = VideoRequestSchema.parse(request);
    const draft = RoomDraftSchema.parse({
      id,
      step: 8,
      stepLayout: "separate-video",
      request,
      assets: copied.map((asset) => ({
        id: asset.id,
        originalName: asset.originalName || asset.name,
        kind: asset.kind,
        bytes: asset.bytes,
        durationSeconds: asset.durationSeconds,
        documentPages: asset.documentPages,
      })),
    });
    const state = store.saveReusedDraft(draft, copied, room.revision);
    return { draftId: id, request, revision: state.revision };
  } catch (error) {
    await Promise.all(copied.map((asset) => rm(asset.path, { force: true })));
    throw error;
  }
}
