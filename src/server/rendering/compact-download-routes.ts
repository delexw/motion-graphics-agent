import { createReadStream } from "node:fs";
import type { FastifyInstance } from "fastify";
import type { Run } from "../../shared/contracts";
import type { CompactVideoPreset } from "../../shared/compact-video-download";
import { CodedError } from "../../shared/errors";
import { jobDownloadBasename } from "../../shared/job-download-name";
import type { Workflow } from "../jobs/workflow";
import { CompactDownloads } from "./compact-downloads";

type Params = { runId: string; jobId: string };
type CompactRequest = { Params: Params; Querystring: { preset?: unknown } };

function resolvePreset(preset: unknown): CompactVideoPreset {
  if (preset === undefined || preset === "quality") return "quality";
  if (preset === "10mb") return preset;
  throw new CodedError("INVALID_REQUEST", "Unknown compression preset", 400);
}

export function registerCompactDownloadRoutes(
  app: FastifyInstance,
  getRun: (id: string) => Run,
  artifact: (runId: string, jobId: string, file: string) => Promise<string>,
  workflow: Pick<Workflow, "projectDependency">,
  downloads = new CompactDownloads(),
) {
  async function resolve({ runId, jobId }: Params) {
    const run = getRun(runId);
    const job = run.jobs.find((item) => item.id === jobId);
    if (job?.kind !== "full" || job.outputType === "page" || job.phase !== "ready" || !job.video)
      throw new CodedError("ARTIFACT_UNAVAILABLE", "A finished video is required", 404);
    return { run, job, source: await artifact(runId, jobId, job.video) };
  }

  const route = "/api/projects/:runId/:jobId/compact-video";
  app.get<CompactRequest>(route, async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const preset = resolvePreset(req.query.preset);
    return downloads.status((await resolve(req.params)).source, preset);
  });
  app.post<CompactRequest>(route, async (req, reply) => {
    const preset = resolvePreset(req.query.preset);
    const { run, source } = await resolve(req.params);
    const status = await downloads.start(
      source,
      (work) => workflow.projectDependency(run, new AbortController().signal, work),
      preset,
    );
    return reply.code(status.status === "queued" ? 202 : 200).send(status);
  });
  app.get<CompactRequest>(`${route}/file`, async (req, reply) => {
    const preset = resolvePreset(req.query.preset);
    const { run, job, source } = await resolve(req.params);
    const file = await downloads.file(source, preset);
    const suffix = preset === "10mb" ? "compact-10mb" : "compact";
    if (!file) return reply.code(404).send({ error: "Compact video is unavailable" });
    return reply
      .header(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(jobDownloadBasename(run, job))}-${suffix}.mp4`,
      )
      .type("video/mp4")
      .send(createReadStream(file));
  });
}
