import { createProjectReuseDraft } from "../project-reuse/create";
import { readSourceCharacters, selectedSourceCharacters } from "../project-reuse/characters";
import { CreateProjectReuseSchema } from "../../shared/project-reuse";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Store } from "../jobs/store";
import type { Catalog } from "../catalog/catalog";
import type { KitevaMcpResult, KitevaMcpToolResponse } from "../../shared/kiteva-mcp";
import { ProjectReuseChoicesSchema, projectReuseSource } from "../../shared/project-reuse";
import { projectName } from "../../shared/project-name";
import { confirmedLanguageSettings } from "./contract";

/** Read-only external MCP surface. Never creates a draft, copies assets or invokes a model. */
export function registerProjectReuseTool(
  server: McpServer,
  dependencies: { store: Store; catalog: Pick<Catalog, "styles">; webUrl: string },
  result: (
    action: () => KitevaMcpResult | Promise<KitevaMcpResult>,
  ) => Promise<KitevaMcpToolResponse>,
) {
  server.registerTool(
    "create_project_from_version",
    {
      description:
        "Create one new editable draft from an exact completed video version and the choices reviewed with preview_project_reuse. Does not generate or modify the source. Uses the same creation owner as the UI; copies selected owned assets to new file IDs, clears replaced story and language text, retains selected style references and effective production/voice settings, and refuses to overwrite an existing draft. Supply a stable operationId across retries, an explicit projectId/jobId, a new idea (unless keeping content), choices and source-owned selectedAssetIds. Returns draftId and revision for the existing start_idea tool. No model calls. A successful result is a saved draft, not a finished video. Retry an uncertain response only with the same operationId; correct validation/conflict errors without deleting someone else's draft.",
      inputSchema: CreateProjectReuseSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (input) =>
      result(async () => {
        const draft = await createProjectReuseDraft(
          dependencies.store,
          dependencies.catalog,
          input,
        );
        return {
          kind: "created",
          id: "draft:new",
          ...draft,
          url: new URL("/", dependencies.webUrl).href,
          languageSettings: confirmedLanguageSettings(draft.request),
          started: false,
        };
      }),
  );
  server.registerTool(
    "preview_project_reuse",
    {
      description:
        "Preview the same inheritance/replacement choices shown by New project from this style. Use list_versions (default) to discover eligible completed video job IDs, then preview with the user's exact jobId. Never choose the latest version implicitly. Inputs: existing projectId, optional strict choices (true=keep, false=replace), source-owned selectedAssetIds, bounded version pagination. Returns typed version list or a preview including names, effective settings, requested choices, source asset metadata and the in-app link. Read-only and safe in planning: no writes, draft creation, file copies, uploads, model calls, network access or generation. A preview has canCreateDraft=true, persisted=false and started=false; use create_project_from_version explicitly to save a draft, then start_idea to build. Missing/unfinished/page versions and out-of-source assets return errors; correct the input and retry. Does not expose source code, workspace paths, events or sessions.",
      inputSchema: {
        projectId: z.string().min(1).max(120),
        action: z.enum(["list_versions", "preview"]).default("list_versions"),
        jobId: z.string().min(1).max(120).optional(),
        choices: ProjectReuseChoicesSchema.optional(),
        selectedAssetIds: z.array(z.string().uuid()).max(20).default([]),
        selectedCharacterIds: CreateProjectReuseSchema.shape.selectedCharacterIds,
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(50).default(20),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (input) =>
      result(async () => {
        const { store, catalog, webUrl } = dependencies;
        const project = store.get(input.projectId);
        if (!project) throw Error("Project not found");
        if (input.action === "list_versions") {
          const eligible = project.jobs.flatMap((job) => {
            const source = projectReuseSource(project, job.id);
            return source
              ? [{ jobId: job.id, version: source.version, finishedAt: job.finishedAt }]
              : [];
          });
          return {
            kind: "project_reuse_versions",
            projectId: project.id,
            versions: eligible.slice(input.offset, input.offset + input.limit),
            total: eligible.length,
            offset: input.offset,
            limit: input.limit,
          };
        }
        if (!input.jobId)
          throw Error("Choose an exact completed video jobId before previewing reuse");
        const source = projectReuseSource(project, input.jobId);
        if (!source) throw Error("That completed video version is not available in this project");
        const choices = ProjectReuseChoicesSchema.parse(input.choices || {});
        const characters = await readSourceCharacters(source);
        const selectedCharacters = await selectedSourceCharacters(
          source,
          choices.characters,
          input.selectedCharacterIds,
        );
        if (input.selectedAssetIds.length && !choices.assets)
          throw Error("Enable source asset inheritance before selecting source files");
        if (input.selectedAssetIds.some((id) => !source.request.assetIds.includes(id)))
          throw Error("Selected asset does not belong to the source version");
        const { aspectRatio, resolution, frameRate, renderer, duration } = source.request;
        const ids = source.candidate
          ? [source.candidate.primaryStyleId, ...source.candidate.supportingStyleIds]
          : [];
        return {
          kind: "project_reuse_preview",
          projectId: project.id,
          jobId: source.job.id,
          version: source.version,
          sourceName: projectName(project),
          styleNames: ids.map(
            (id) => catalog.styles.find((style) => style.id === id)?.name_en || id,
          ),
          choices,
          characters,
          selectedCharacterIds: selectedCharacters.map((character) => character.id),
          selectedAssetIds: [...new Set(input.selectedAssetIds)],
          sourceAssets: source.request.assetIds.flatMap((id) => {
            const asset = store.getAsset(id);
            return asset
              ? [{ id, originalName: asset.originalName || asset.name, bytes: asset.bytes }]
              : [];
          }),
          versionSettings: { aspectRatio, resolution, frameRate, renderer, duration },
          languageSettings: confirmedLanguageSettings(source.request),
          settingsSource: source.hasVersionSettings ? "version" : "original_project",
          canCreateDraft: true,
          persisted: false,
          started: false,
          url: `${webUrl}/projects/${encodeURIComponent(project.id)}?reuse=${encodeURIComponent(source.job.id)}`,
          limitations: [
            "Creating a draft is a separate explicit create_project_from_version operation; starting is handled by start_idea.",
            "Catalog directions do not guarantee the source video's exact appearance.",
            "Palette, typography and motion have no independent design snapshot in this preview.",
          ],
        };
      }),
  );
}
