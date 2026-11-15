import { z } from "zod";
import type { Run } from "./contracts";
import { jobVersions } from "./job-versions";
import { ProjectCharactersSchema, type ProjectCharacter } from "./project-characters";

/** Bind the design preview to the actual completed version, including version-local settings. */
export function projectReuseSource(run: Run, jobId: string) {
  const job = run.jobs.find((entry) => entry.id === jobId);
  if (
    run.request.outputType === "page" ||
    !job ||
    job.runId !== run.id ||
    job.kind !== "full" ||
    job.outputType === "page" ||
    job.phase !== "ready" ||
    !job.video
  )
    return undefined;
  const request = job.effectiveRequest ?? run.request;
  return {
    job,
    request,
    candidate: run.candidates.find((candidate) => candidate.id === job.candidateId),
    version: jobVersions(run.jobs).get(job.id),
    hasVersionSettings: Boolean(job.effectiveRequest),
  };
}
export type ProjectReuseSource = NonNullable<ReturnType<typeof projectReuseSource>>;

export const ProjectReuseChoicesSchema = z
  .object({
    visual: z.boolean().default(true),
    palette: z.boolean().default(true),
    typography: z.boolean().default(true),
    motion: z.boolean().default(true),
    output: z.boolean().default(true),
    voice: z.boolean().default(true),
    music: z.boolean().default(true),
    content: z.boolean().default(false),
    assets: z.boolean().default(false),
    musicRecording: z.boolean().default(false),
    characters: z
      .boolean()
      .default(true)
      .describe(
        "Independently keep selected recorded characters/mascots, including appearance, personality and narrative role. Does not inherit the old topic or script.",
      ),
  })
  .strict();
export type ProjectReuseChoices = z.infer<typeof ProjectReuseChoicesSchema>;

export type ProjectReuseVersionSummary = { jobId: string; version?: number; finishedAt?: string };
export type ProjectReuseMcpResult =
  | {
      kind: "project_reuse_versions";
      projectId: string;
      versions: ProjectReuseVersionSummary[];
      total: number;
      offset: number;
      limit: number;
    }
  | {
      kind: "project_reuse_preview";
      projectId: string;
      jobId: string;
      version?: number;
      sourceName: string;
      styleNames: string[];
      choices: ProjectReuseChoices;
      selectedAssetIds: string[];
      characters: ProjectCharacter[];
      selectedCharacterIds: string[];
      sourceAssets: { id: string; originalName: string; bytes: number }[];
      versionSettings: Pick<
        import("./domains/video").VideoRequest,
        "aspectRatio" | "resolution" | "frameRate" | "renderer" | "duration"
      >;
      languageSettings: import("./language-tracks").LanguageTrackRow[];
      settingsSource: "version" | "original_project";
      canCreateDraft: true;
      persisted: false;
      started: false;
      url: string;
      limitations: string[];
    };

export const ProjectReuseOriginSchema = z.object({
  projectId: z.string(),
  jobId: z.string(),
  version: z.number().optional(),
  operationId: z.string().min(1).max(120),
  inputHash: z.string().optional(),
  // Old saved projects never selected character inheritance; do not retroactively enable it.
  choices: ProjectReuseChoicesSchema.extend({ characters: z.boolean().default(false) }),
  styles: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        visualCues: z.string().optional(),
        palette: z.record(z.string(), z.string()).optional(),
      }),
    )
    .max(6),
  styleRenderer: z.array(z.string()).optional(),
  motionEngine: z.array(z.string()).optional(),
  characters: ProjectCharactersSchema.optional(),
});
export const CreateProjectReuseSchema = z.object({
  projectId: z.string().min(1).max(120),
  jobId: z.string().min(1).max(120),
  operationId: z.string().min(1).max(120),
  idea: z.string().trim().max(24000).default(""),
  choices: ProjectReuseChoicesSchema.default(ProjectReuseChoicesSchema.parse({})),
  selectedAssetIds: z.array(z.string().uuid()).max(20).default([]),
  selectedCharacterIds: z
    .array(z.string().min(1).max(120))
    .max(20)
    .optional()
    .describe(
      "Character IDs from the reviewed source preview. Omit to keep all recorded characters by default; use choices.characters=false to keep none. Never invent IDs.",
    ),
});
export type CreateProjectReuse = z.infer<typeof CreateProjectReuseSchema>;
