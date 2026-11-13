import { z } from "zod";
export const PythonAssetRequestSchema = z.object({
  script: z.string().min(1).max(500),
  args: z.array(z.string().max(1000)).max(30).optional(),
  outputFiles: z.array(z.string().min(1).max(500)).min(1).max(20),
  technologyIds: z.array(z.string().min(1)).min(1).max(20),
});
export const TechnologyExecutionSchema = z.object({
  id: z.string(),
  observedAt: z.string(),
  script: z.string(),
  scriptSha256: z.string(),
  interpreter: z.string(),
  technologies: z.array(z.object({ id: z.string(), package: z.string(), version: z.string() })),
  outputs: z.array(z.object({ path: z.string(), sha256: z.string() })),
});
export type TechnologyExecution = z.infer<typeof TechnologyExecutionSchema>;
