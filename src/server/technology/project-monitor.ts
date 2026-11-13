import { TechnologyObservationSchema } from "./evidence/contracts";
import { technologyCodeUsage } from "./evidence/source-code";
import type { TechnologyEvidenceContext } from "./evidence/contracts";
import { collectTechnologyUsage } from "./evidence/registry";
import { TechnologyExecutionSchema } from "../../shared/technology-executions";
import { technologyExecutionFile } from "./python-execution";
import { browserPackageSources } from "./package-provenance";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { technologyPool } from "../../shared/technology-pool";
import {
  ProjectTechnologyRecordSchema,
  type ProjectTechnologyMonitor,
} from "../../shared/project-technologies";
import { renderInputRoot, projectArtifactPath } from "../runtime/workspace";
import { projectTechnologyFile } from "./project-dependencies";

async function localRead(workspace: string, file: string) {
  const root = await realpath(workspace);
  const resolved = await realpath(path.join(root, file));
  if (!resolved.startsWith(root + path.sep))
    throw Error("Technology evidence is outside the project");
  return readFile(resolved, "utf8");
}
// Cache digests, not source text. Stat/realpath checks still run for each observation.
const evidenceHashes = new Map<string, { signature: string; hash: string }>();
async function localHash(workspace: string, file: string) {
  const root = await realpath(workspace);
  const resolved = await realpath(path.join(root, file));
  if (!resolved.startsWith(root + path.sep))
    throw Error("Technology evidence is outside the project");
  const metadata = await stat(resolved);
  const signature = `${metadata.ino}:${metadata.size}:${metadata.mtimeMs}:${metadata.ctimeMs}`;
  const cached = evidenceHashes.get(resolved);
  if (cached?.signature === signature) return cached.hash;
  const hash = createHash("sha256")
    .update(await readFile(resolved))
    .digest("hex");
  if (evidenceHashes.size >= 256) evidenceHashes.delete(evidenceHashes.keys().next().value!);
  evidenceHashes.set(resolved, { signature, hash });
  return hash;
}
export const technologyObservationFile = "diagnostics/technology-loads.json";

export async function projectTechnologyMonitor(
  job: {
    id: string;
    workspace: string;
    phase?: string;
    outputType?: string;
    video?: string;
  },
  options?: {
    page: number;
    pageSize: number;
    search: string;
    selection: "all" | "selected" | "not_selected";
  },
): Promise<ProjectTechnologyMonitor> {
  const result: ProjectTechnologyMonitor = { jobId: job.id, entries: [] };
  let selection: z.infer<typeof ProjectTechnologyRecordSchema> | undefined;
  try {
    selection = ProjectTechnologyRecordSchema.parse(
      JSON.parse(await localRead(job.workspace, projectTechnologyFile)),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      result.error = "Technology selection could not be read";
  }
  result.updatedAt = selection?.updatedAt;
  const prepared = new Map<string, string[]>();
  try {
    for (const folder of (await readdir(renderInputRoot(job.workspace)))
      .filter((name) => name.startsWith("technology-"))
      .slice(0, 200)) {
      try {
        const record = z
          .object({ id: z.string(), modulePath: z.string() })
          .parse(
            JSON.parse(
              await localRead(
                job.workspace,
                path.relative(
                  job.workspace,
                  path.join(renderInputRoot(job.workspace), folder, "technology.json"),
                ),
              ),
            ),
          );
        // Accept only this bundle's local module, never a path supplied outside the bundle.
        const expected = path
          .relative(job.workspace, path.join(renderInputRoot(job.workspace), folder, "index.js"))
          .split(path.sep)
          .join("/");
        if (record.modulePath === expected)
          prepared.set(record.id, [...(prepared.get(record.id) ?? []), expected]);
      } catch {
        /* An unfinished preparation is not a completed bundle. */
      }
    }
  } catch {
    /* No browser bundles yet. */
  }
  let observation: z.infer<typeof TechnologyObservationSchema> | undefined;
  try {
    observation = TechnologyObservationSchema.parse(
      JSON.parse(await localRead(job.workspace, technologyObservationFile)),
    );
  } catch {
    /* No browser observation; leave usage unverified. */
  }
  let executions: z.infer<typeof TechnologyExecutionSchema>[] = [];
  try {
    executions = z
      .array(TechnologyExecutionSchema)
      .max(100)
      .parse(JSON.parse(await localRead(job.workspace, technologyExecutionFile)));
  } catch {
    /* Missing execution evidence stays unknown. */
  }
  let currentObservation: Promise<boolean> | undefined;
  const observationUnchanged = () =>
    (currentObservation ??= (async () => {
      if (
        !observation ||
        observation.errors.length ||
        (selection && Date.parse(observation.observedAt) < Date.parse(selection.updatedAt))
      )
        return false;
      for (const [file, hash] of Object.entries(observation.resources)) {
        try {
          if ((await localHash(job.workspace, file)) !== hash) return false;
        } catch {
          return false;
        }
      }
      return Object.keys(observation.resources).length > 0;
    })());
  let definitions = Object.entries(technologyPool).filter(([id, definition]) => {
    if (!options) return true;
    const selected = selection
      ? Boolean(selection.selected.some((entry) => entry.id === id) || selection.fixedNpm[id])
      : null;
    const search = options.search.trim().toLowerCase();
    return (
      (!search || (id + " " + definition.name).toLowerCase().includes(search)) &&
      (options.selection === "all" ||
        (options.selection === "selected" ? selected === true : selected === false))
    );
  });
  if (options) {
    definitions.sort(
      ([a], [b]) =>
        Number(
          Boolean(selection?.selected.some((entry) => entry.id === b) || selection?.fixedNpm[b]),
        ) -
        Number(
          Boolean(selection?.selected.some((entry) => entry.id === a) || selection?.fixedNpm[a]),
        ),
    );
    result.pagination = {
      page: options.page,
      pageSize: options.pageSize,
      total: definitions.length,
      search: options.search,
    };
    definitions = definitions.slice(
      (options.page - 1) * options.pageSize,
      options.page * options.pageSize,
    );
  }
  for (const [id, definition] of definitions) {
    const chosen = selection?.selected.find((entry) => entry.id === id);
    const fixed = selection?.fixedNpm[id];
    const files =
      prepared.get(id) ??
      (id === "gsap" && fixed ? [projectArtifactPath(job.workspace, "vendor", "gsap.min.js")] : []);
    let browserLoaded = false;
    const moduleFiles = [...files];
    if (
      observation &&
      selection &&
      Date.parse(observation.observedAt) >= Date.parse(selection.updatedAt)
    ) {
      for (const file of files) {
        try {
          const hash = await localHash(job.workspace, file);
          if (observation.resources[file] === hash) browserLoaded = true;
        } catch {
          /* Missing/changed output invalidates that observation. */
        }
      }
    }
    if (
      !browserLoaded &&
      observation &&
      selection &&
      chosen?.ecosystem === "npm" &&
      chosen.package &&
      chosen.version &&
      Date.parse(observation.observedAt) >= Date.parse(selection.updatedAt)
    ) {
      try {
        const sources =
          chosen.browserSources ??
          (await browserPackageSources(
            job.workspace,
            chosen.runtimeDirectory,
            chosen.package,
            chosen.version,
          ));
        for (const [file, hash] of Object.entries(observation.resources)) {
          if (!Object.values(sources).includes(hash)) continue;
          if ((await localHash(job.workspace, file)) === hash) {
            browserLoaded = true;
            moduleFiles.push(file);
          }
        }
      } catch {
        /* Unavailable provenance remains unverified. */
      }
    }
    const context: TechnologyEvidenceContext = {
      job,
      id,
      chosen,
      fixed,
      observation,
      executions,
      browserLoaded,
      moduleFiles,
      observationUnchanged,
      hashFile: (file) => localHash(job.workspace, file),
      readFile: (file) => localRead(job.workspace, file),
    };
    const codeUsage =
      chosen?.ecosystem === "npm" || fixed ? await technologyCodeUsage(context) : [];
    const usageEvidence = await collectTechnologyUsage({ ...context, codeUsage });
    result.entries.push({
      id,
      name: definition.name,
      selected: selection ? Boolean(chosen || fixed) : null,
      ...(chosen
        ? {
            purpose: chosen.purpose,
            package: chosen.package,
            version: chosen.version,
            ecosystem: chosen.ecosystem,
          }
        : fixed
          ? { purpose: "Required renderer runtime", package: id, version: fixed, ecosystem: "npm" }
          : {}),
      dependencyApplicable: Boolean(definition.package),
      usageEvidence,
      codeUsage,
      prepared: prepared.has(id) || Boolean(chosen?.version || fixed),
      browserLoaded,
    });
  }
  return result;
}
