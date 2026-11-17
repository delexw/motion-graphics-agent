import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Run } from "../../shared/contracts";
import { AnalyzeMusicInputSchema } from "../../shared/music-analysis";
import { CodedError } from "../../shared/errors";
import { inspectMusicAnalysis } from "./music-analysis-inspection";

export function registerMusicAnalysisRoutes(app: FastifyInstance, getRun: (id: string) => Run) {
  app.get("/api/music-analysis/:projectId/:jobId", async (request, reply) => {
    const { projectId, jobId } = z
      .object({ projectId: z.string(), jobId: z.string() })
      .parse(request.params);
    const { file } = AnalyzeMusicInputSchema.parse(request.query);
    const job = getRun(projectId).jobs.find((job) => job.id === jobId);
    if (!job || job.outputType === "page")
      throw new CodedError("NOT_FOUND", "Video job not found", 404);
    const controller = new AbortController();
    const abort = () => {
      if (!reply.raw.writableEnded) controller.abort();
    };
    reply.raw.once("close", abort);
    try {
      reply.header("Cache-Control", "no-store");
      return await inspectMusicAnalysis(
        job.workspace,
        file,
        AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
      );
    } finally {
      reply.raw.off("close", abort);
    }
  });
}
