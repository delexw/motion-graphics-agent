import { z } from "zod";

export const ProjectTechnologySelectionSchema = z.object({
  id: z.string().min(1),
  purpose: z.string().min(1),
  runtimeDirectory: z.string().default("."),
  pythonExecutable: z.string().optional(),
});
export const ProjectTechnologyRecordSchema = z.object({
  updatedAt: z.string(),
  fixedNpm: z.record(z.string(), z.string()),
  selected: z.array(
    ProjectTechnologySelectionSchema.extend({
      name: z.string(),
      ecosystem: z.enum(["npm", "python", "native", "external", "technique", "asset"]),
      package: z.string().optional(),
      version: z.string().optional(),
      browserSources: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)).optional(),
    }),
  ),
});
export type ProjectTechnologySelection = z.infer<typeof ProjectTechnologySelectionSchema>;
export type ProjectTechnologyRecord = z.infer<typeof ProjectTechnologyRecordSchema>;
export interface TechnologyCodeUsage {
  file: string;
  line: number;
  column: number;
  expression: string;
}

export interface ProjectTechnologyMonitor {
  pagination?: { page: number; pageSize: number; total: number; search: string };
  jobId: string;
  updatedAt?: string;
  error?: string;
  entries: {
    id: string;
    name: string;
    selected: boolean | null;
    purpose?: string;
    package?: string;
    version?: string;
    ecosystem?: string;
    dependencyApplicable?: boolean;
    usageEvidence?: string[];
    codeUsage?: TechnologyCodeUsage[];
    prepared: boolean;
    browserLoaded: boolean;
  }[];
}
