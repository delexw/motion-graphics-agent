import { z } from "zod";
import type {
  ProjectTechnologyRecord,
  TechnologyCodeUsage,
} from "../../../shared/project-technologies";
import type { TechnologyExecution } from "../../../shared/technology-executions";
export const TechnologyObservationSchema = z.object({
  observedAt: z.string(),
  resources: z.record(z.string(), z.string()),
  errors: z.array(z.string()),
  runtimeLibraries: z.record(z.string(), z.string()).optional(),
  native: z.object({ html_css: z.boolean(), svg: z.boolean(), webgl: z.boolean() }).optional(),
});
export type TechnologyEvidenceJob = {
  id: string;
  workspace: string;
  phase?: string;
  outputType?: string;
  video?: string;
};
export interface TechnologyEvidenceContext {
  job: TechnologyEvidenceJob;
  id: string;
  chosen?: ProjectTechnologyRecord["selected"][number];
  fixed?: string;
  observation?: z.infer<typeof TechnologyObservationSchema>;
  executions: TechnologyExecution[];
  browserLoaded: boolean;
  moduleFiles?: string[];
  codeUsage?: TechnologyCodeUsage[];
  hashFile: (file: string) => Promise<string>;
  readFile: (file: string) => Promise<string>;
  observationUnchanged: () => Promise<boolean>;
}
export interface TechnologyUsageDetector {
  detect(context: TechnologyEvidenceContext): Promise<string[]>;
}
