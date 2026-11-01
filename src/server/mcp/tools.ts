import { assetLimits } from "../../shared/asset-limits";
import { briefSectionFileAccept } from "../../shared/brief-sections";
import { AssetSourceSchema, AssetTargetSchema, importMcpAsset } from "./assets";
import type { Asset } from "../../shared/contracts";
import type { AssetOwner } from "../../shared/asset-owner";
import { toggleRoomAsset } from "../../shared/brief-attachments";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { randomUUID } from "node:crypto";
import MiniSearch from "minisearch";
import { z } from "zod";
import type { Store } from "../jobs/store";
import type { Catalog } from "../catalog/catalog";
import type { KitevaIdeaSummary, KitevaMcpResult } from "../../shared/kiteva-mcp";
import { projectName } from "../../shared/project-name";
import { RoomPatchSchema } from "../../shared/room";
import { VideoRequestSchema } from "../../shared/domains/video";
import { validateBriefSections } from "../requests/brief-sections";
import {
  ideaRequest,
  ideaToolGuidance,
  IdeaSettingsSchema,
  kitevaIdeaDefaults,
  kitevaMcpInstructions,
} from "./contract";

export type KitevaMcpDependencies = {
  store: Store;
  catalog: Pick<Catalog, "styles">;
  webUrl: string;
  assetDirectory?: string;
  start: (request: z.infer<typeof VideoRequestSchema>) => Promise<{ id: string; phase: string }>;
};

function search<T extends { id: string }>(
  records: T[],
  query: string,
  fields: (keyof T & string)[],
  limit: number,
): T[] {
  if (!query.trim()) return records.slice(0, limit);
  const index = new MiniSearch<T>({ fields, storeFields: ["id"] });
  index.addAll(records);
  const matches = new Map(records.map((record) => [record.id, record]));
  return index
    .search(query, { prefix: true, combineWith: "AND" })
    .slice(0, limit)
    .map((match) => matches.get(String(match.id))!);
}

export function createKitevaMcpTools({
  store,
  catalog,
  webUrl,
  start,
  assetDirectory,
}: KitevaMcpDependencies) {
  const clientId = `kiteva-mcp-${randomUUID()}`;
  const server = new McpServer(
    { name: "kiteva", version: "1.0.0" },
    { instructions: kitevaMcpInstructions },
  );
  async function run(action: () => KitevaMcpResult | Promise<KitevaMcpResult>) {
    try {
      const result = await action();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: result,
      };
    } catch (error) {
      const result: KitevaMcpResult = {
        kind: "error",
        message: error instanceof Error ? error.message : "Kiteva tool failed",
      };
      return {
        isError: true,
        content: [{ type: "text" as const, text: result.message }],
        structuredContent: result,
      };
    }
  }
  const publicAsset = (asset: Asset, attached: boolean) => ({
    id: asset.id,
    originalName: asset.originalName || asset.name,
    kind: asset.kind,
    bytes: asset.bytes,
    owner: asset.owner,
    attached,
  });
  const scopedAssets = (target: AssetOwner) => {
    const room = store.room();
    const draft = Object.values(room.drafts).find((item) => item.id === target.id);
    const project = target.kind === "project" ? store.get(target.id) : undefined;
    if (target.kind === "draft" && !draft) throw Error("Draft not found");
    if (target.kind === "project" && !project) throw Error("Project not found");
    const ids =
      target.kind === "draft"
        ? (draft!.request.assetIds as string[]) || []
        : project!.request.assetIds;
    return [
      ...new Map(
        [...ids.map((id) => store.getAsset(id)!), ...store.ownedAssets(target)].map((asset) => [
          asset.id,
          asset,
        ]),
      ).values(),
    ];
  };
  server.registerTool(
    "import_asset",
    {
      description:
        "Import one selected local file or ComfyUI output into an existing draft/project. Use the exact draftId from create_idea/read_idea or projectId from start_idea. Files go to private runtime storage, never source code or Git. Draft imports attach using the same UI section/limit rules: image files belong to images, MP4/MOV/WebM clips to videos, audio to music and documents to main; project imports are available for that project's later edits and never restart a build. Returns actual asset ID and current revision. No model calls. Do not automatically retry an uncertain import.",
      inputSchema: { target: AssetTargetSchema, source: AssetSourceSchema },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    ({ target, source }) =>
      run(async () => {
        const asset = await importMcpAsset(store, target, source, assetDirectory);
        return {
          kind: "asset_imported",
          target,
          asset: publicAsset(asset, target.kind === "draft"),
          revision: target.kind === "draft" ? store.room().revision : undefined,
        };
      }),
  );
  server.registerTool(
    "manage_idea_assets",
    {
      description:
        "List current draft attachments and available asset-pool items, Add an existing item, Remove its draft attachment, or remove an item from the shared pool. Uses the same UI attachment/section/limit logic. Detaching or removing from the pool does not delete source files or affect a project's build. Use exact draftId, returned asset IDs and latest room revision for edits. Never treat pool items as attached automatically.",
      inputSchema: {
        draftId: z.string().uuid(),
        action: z.enum(["list", "attach", "detach", "remove_from_pool"]),
        assetId: z.string().uuid().optional(),
        revision: z.number().int().min(0).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    ({ draftId, action, assetId, revision }) =>
      run(() => {
        const room = store.room();
        const entry = Object.entries(room.drafts).find(([, draft]) => draft.id === draftId);
        if (!entry) throw Error("Draft not found");
        const [key, draft] = entry;
        const ids = (draft.request.assetIds as string[]) || [];
        if (action !== "list") {
          if (revision !== room.revision || !assetId)
            throw Error("Read the latest draft revision and supply an asset ID before editing");
          store.assertAssetOwner([assetId], { kind: "draft", id: draftId });
          const asset = store.getAsset(assetId)!;
          if ((action === "attach") !== ids.includes(assetId)) {
            if (
              action === "attach" &&
              !store.library().some((item) => item.id === assetId) &&
              asset.owner?.id !== draftId
            )
              throw Error("Asset is not in this draft or its available pool");
            const request = toggleRoomAsset(
              VideoRequestSchema.parse(draft.request),
              { ...asset, originalName: asset.originalName || asset.name },
              ids.map((id) => {
                const a = store.getAsset(id)!;
                return { ...a, originalName: a.originalName || a.name };
              }),
            );
            const result = store.patchRoom(
              RoomPatchSchema.parse({
                client: clientId,
                baseRevision: revision,
                drafts: {
                  [key]: {
                    ...draft,
                    request,
                    assets: request.assetIds.map((id) => {
                      const a = store.getAsset(id)!;
                      return { ...a, originalName: a.originalName || a.name };
                    }),
                  },
                },
              }),
            );
            if (result.conflicts.length)
              throw Error("Draft changed; read it again before retrying");
          }
        }
        if (action === "remove_from_pool" && assetId) store.removeLibraryAsset(assetId);
        const current = store.room();
        const attached = (current.drafts[key].request.assetIds as string[]) || [];
        const assets = [
          ...new Map(
            [
              ...attached.map((id) => store.getAsset(id)!),
              ...store
                .library()
                .filter(
                  (asset) =>
                    !asset.owner || (asset.owner.kind === "draft" && asset.owner.id === draftId),
                ),
            ].map((asset) => [asset.id, asset]),
          ).values(),
        ];
        return {
          kind: "assets",
          target: { kind: "draft", id: draftId },
          revision: current.revision,
          assets: assets.map((asset) => publicAsset(asset, attached.includes(asset.id))),
        };
      }),
  );
  const querySchema = {
    query: z
      .string()
      .max(1000)
      .default("")
      .describe(
        "Words from the idea, project title or Motion Graphic metadata. Empty lists recent available entries; this is text search, not model-based semantic ranking.",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(20)
      .describe("Maximum results, between 1 and 50. Default: 20."),
  };
  server.registerTool(
    "search_ideas",
    {
      description:
        "Search saved Assistant drafts and existing projects by title and idea text. Returns public summaries only, not generated files, logs or implementation code. No model calls or writes.",
      inputSchema: querySchema,
      annotations: { readOnlyHint: true },
    },
    ({ query, limit }) =>
      run(() => {
        const projects = store.allRuns().map((project) => ({
          id: project.id,
          name: projectName(project),
          kind: "project" as const,
          phase: project.phase,
          text: project.request.instructions,
        }));
        const drafts = Object.entries(store.room().drafts).map(([id, draft]) => ({
          id: `draft:${id}`,
          name: String(draft.request.instructions || "Untitled idea").slice(0, 80),
          kind: "draft" as const,
          phase: "draft",
          text: String(draft.request.instructions || ""),
        }));
        const ideas: KitevaIdeaSummary[] = search(
          [...drafts, ...projects],
          query,
          ["name", "text"],
          limit,
        ).map(({ text: _text, ...summary }) => summary);
        return { kind: "search", ideas };
      }),
  );
  server.registerTool(
    "read_idea",
    {
      description:
        "Read a saved idea's original request and dedicated settings. Drafts also return the room revision required by start_idea. No files, event logs, sessions, credentials or generated code are returned.",
      inputSchema: {
        id: z
          .string()
          .min(1)
          .describe(
            "Stable projectId or draftId returned by start_idea/create_idea/read_idea, or a draft: key such as draft:new from search_ideas.",
          ),
      },
      annotations: { readOnlyHint: true },
    },
    ({ id }) =>
      run(() => {
        const room = store.room();
        const matchingDraft = Object.values(room.drafts).find((draft) => draft.id === id);
        if (id.startsWith("draft:") || matchingDraft) {
          const draft = matchingDraft || room.drafts[id.slice(6)];
          if (!draft) throw Error("Idea draft not found");
          return {
            kind: "idea",
            id,
            draftId: draft.id,
            request: draft.request,
            revision: room.revision,
            assets: draft.assets.map((asset) =>
              publicAsset(
                store.getAsset(asset.id)!,
                ((draft.request.assetIds as string[]) || []).includes(asset.id),
              ),
            ),
          };
        }
        const project = store.get(id);
        if (!project) throw Error("Project not found");
        return {
          kind: "idea",
          id,
          request: { ...project.request },
          assets: scopedAssets({ kind: "project", id }).map((asset) =>
            publicAsset(asset, project.request.assetIds.includes(asset.id)),
          ),
        };
      }),
  );
  server.registerTool(
    "get_idea_options",
    {
      description: `Read valid dedicated video settings and MCP creation defaults before authoring an idea. ${ideaToolGuidance.settings}`,
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () =>
      run(() => ({
        kind: "options",
        defaults: kitevaIdeaDefaults,
        settingsSchema: z.toJSONSchema(IdeaSettingsSchema),
        uploadLimits: assetLimits,
        supportedExtensions: Object.values(briefSectionFileAccept).join(",").split(","),
      })),
  );
  server.registerTool(
    "search_styles",
    {
      description:
        "Search Motion Graphic names and visual directions. Returns style metadata only, never Kiteva implementation code. Use returned IDs only when the user explicitly selects styles; otherwise leave automatic exploration enabled.",
      inputSchema: querySchema,
      annotations: { readOnlyHint: true },
    },
    ({ query, limit }) =>
      run(() => ({
        kind: "styles",
        styles: search(
          catalog.styles.map((style) => ({
            id: style.id,
            name: style.name_en,
            category: style.category,
            visualDirection: style.visual_cues,
          })),
          query,
          ["id", "name", "category", "visualDirection"],
          limit,
        ),
      })),
  );
  server.registerTool(
    "create_idea",
    {
      description: `${ideaToolGuidance.creation} ${ideaToolGuidance.idea} ${ideaToolGuidance.settings} Creation defaults: ${JSON.stringify(kitevaIdeaDefaults)}.`,
      inputSchema: {
        idea: z.string().trim().min(8).max(24000).describe(ideaToolGuidance.idea),
        settings: IdeaSettingsSchema.describe(ideaToolGuidance.settings),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    ({ idea, settings }) =>
      run(() => {
        const request = ideaRequest(idea, settings);
        const draftId = store.room().drafts.new?.id || randomUUID();
        store.assertAssetOwner(request.assetIds, { kind: "draft", id: draftId });
        const assets = request.assetIds.map((id) => {
          const asset = store.getAsset(id);
          if (!asset)
            throw Error("Attached asset not found; use an existing Kiteva attachment ID.");
          return {
            id: asset.id,
            originalName: asset.originalName || asset.name,
            kind: asset.kind,
            bytes: asset.bytes,
          };
        });
        validateBriefSections(request, (id) => store.getAsset(id));
        if (
          [
            ...(request.selectedStyleIds || []),
            ...(request.pinnedStyleId ? [request.pinnedStyleId] : []),
          ].some((id) => !catalog.styles.some((style) => style.id === id))
        )
          throw Error(
            "Unknown Motion Graphic ID; use search_styles to find an existing selection.",
          );
        const room = store.room();
        const previous = room.drafts.new;
        if (
          previous &&
          (String(previous.request.instructions || "").trim() ||
            previous.assets.length ||
            Object.keys(previous.request).some(
              (key) => !["instructions", "outputLanguage", "scriptItems"].includes(key),
            ))
        )
          throw Error(
            "The Assistant already has a New idea draft. Review or remove it in Kiteva before creating another; it was not overwritten.",
          );
        const result = store.patchRoom(
          RoomPatchSchema.parse({
            client: clientId,
            baseRevision: room.revision,
            drafts: {
              new: { id: draftId, step: 8, stepLayout: "separate-video", request, assets },
            },
          }),
        );
        if (result.conflicts.length)
          throw Error(
            "The draft changed concurrently; it was not overwritten. Read the current draft before continuing.",
          );
        return {
          kind: "created",
          id: "draft:new",
          request,
          url: new URL("/", webUrl).href,
          started: false,
          draftId,
        };
      }),
  );
  server.registerTool(
    "start_idea",
    {
      description: ideaToolGuidance.start,
      inputSchema: {
        draftId: z
          .string()
          .uuid()
          .optional()
          .describe(
            "Stable draftId returned by create_idea/read_idea/import_asset. Supply it to start exactly that draft.",
          ),
        revision: z
          .number()
          .int()
          .min(0)
          .describe(
            "Current room revision from read_idea(draft:new). Rejects a stale draft so newly edited instructions are never silently submitted.",
          ),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    ({ revision, draftId }) =>
      run(async () => {
        const room = store.room();
        if (room.revision !== revision)
          throw Error("The room changed. Read draft:new again before starting.");
        if (!room.drafts.new) throw Error("No New idea draft to start");
        if (draftId && room.drafts.new.id !== draftId)
          throw Error("Draft ID does not match the current New idea");
        const sourceDraftId = room.drafts.new.id;
        const request = VideoRequestSchema.parse(room.drafts.new.request);
        store.assertAssetOwner(
          request.assetIds,
          sourceDraftId ? { kind: "draft", id: sourceDraftId } : undefined,
        );
        const project = await start(request);
        if (sourceDraftId) store.transferDraftAssets(sourceDraftId, project.id, request.assetIds);
        store.patchRoom(
          RoomPatchSchema.parse({
            client: clientId,
            baseRevision: revision,
            drafts: { new: null },
          }),
        );
        return {
          kind: "started",
          id: project.id,
          projectId: project.id,
          phase: project.phase,
          draftId: sourceDraftId,
          url: new URL(`/projects/${project.id}`, webUrl).href,
        };
      }),
  );
  return server;
}
