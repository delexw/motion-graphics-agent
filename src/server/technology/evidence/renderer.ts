import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { TechnologyEvidenceContext, TechnologyUsageDetector } from "./contracts";
export class RendererEvidenceDetector implements TechnologyUsageDetector {
  async detect(context: TechnologyEvidenceContext) {
    const { id, fixed, job, readFile } = context;
    const usageEvidence: string[] = [];
    if (
      id === "hyperframes" &&
      fixed &&
      job.phase === "ready" &&
      job.outputType === "video" &&
      job.video
    ) {
      try {
        const validation = z
          .object({
            verifiedAt: z.string(),
            production: z.object({ pipeline: z.string(), sourceFile: z.string() }),
            probe: z.object({
              streams: z.array(
                z.object({
                  codec_type: z.string(),
                  width: z.number().optional(),
                  height: z.number().optional(),
                }),
              ),
            }),
          })
          .parse(JSON.parse(await readFile("renders/validation.json")));
        const verified = Date.parse(validation.verifiedAt);
        const base = await realpath(job.workspace);
        for (const file of [validation.production.sourceFile, job.video]) {
          const resolved = await realpath(path.join(base, file));
          if (!resolved.startsWith(base + path.sep))
            throw Error("Render evidence is outside the project");
        }
        const source = await stat(path.join(job.workspace, validation.production.sourceFile));
        const video = await stat(path.join(job.workspace, job.video));
        if (
          validation.production.pipeline.toLowerCase() === "hyperframes" &&
          source.mtimeMs <= verified + 1000 &&
          video.mtimeMs <= verified + 1000 &&
          validation.probe.streams.some(
            (stream) =>
              stream.codec_type === "video" && (stream.width ?? 0) > 0 && (stream.height ?? 0) > 0,
          )
        )
          usageEvidence.push("Render validated");
      } catch {
        /* A configured renderer alone is not a validated render. */
      }
    }
    return usageEvidence;
  }
}
