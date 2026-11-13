import { z } from "zod";
const page = z.coerce.number().int().min(1).max(100000).default(1);
export const GovernanceProjectQuerySchema = z.object({
  page,
  pageSize: z.coerce.number().int().min(1).max(25).default(20),
  search: z.string().trim().max(200).default(""),
});
export const GovernanceQuerySchema = z.object({
  page,
  pageSize: z.coerce.number().int().min(1).max(25).default(5),
  search: z.string().trim().max(200).default(""),
  projectId: z.string().min(1).max(100).optional(),
  checksPage: page,
  checksPageSize: z.coerce.number().int().min(1).max(25).default(10),
  checksSearch: z.string().trim().max(200).default(""),
});
export const TechnologyQuerySchema = z.object({
  jobId: z.string().min(1).max(100),
  page,
  pageSize: z.coerce.number().int().min(1).max(50).default(8),
  search: z.string().trim().max(200).default(""),
  selection: z.enum(["all", "selected", "not_selected"]).default("all"),
});
