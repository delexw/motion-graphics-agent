import { browserPackageSources } from "./package-provenance";
import { systemEnvironment } from "../runtime/platform";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { lstat, readFile, writeFile, copyFile, realpath } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { acquireFileLease } from "../runtime/file-lease";
import { appRoot } from "../runtime/config";
import { projectArtifactPath } from "../runtime/workspace";
import { projectTechnologyRoot } from "./project-runtime";
import { technologyEnvironment } from "./availability";
import { technologyPool, type TechnologyDefinition } from "../../shared/technology-pool";
import { type CreativeRequest } from "../../shared/contracts";
import {
  ProjectTechnologyRecordSchema,
  type ProjectTechnologySelection,
} from "../../shared/project-technologies";

const execute = promisify(execFile);
const version = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[0-9][0-9A-Za-z.!+_-]*$/);
export const projectTechnologyFile = "PROJECT_TECHNOLOGIES.json";
const policyFile = "PROJECT_DEPENDENCIES.json";
const packageMetadata = z.object({ name: z.string(), version });
async function readJson(file: string) {
  return JSON.parse(await readFile(file, "utf8"));
}
async function writeOwned(file: string, content: string) {
  const existing = await lstat(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
  if (existing && !existing.isFile())
    throw Error("Dependency files must not be links or directories");
  await writeFile(file, content);
}

/** Bootstrap only the selected renderer's required runtime, preserving finalized dependencies on retry. */
export async function setupProjectDependencies(
  workspace: string,
  request: CreativeRequest,
  legacy = false,
) {
  const fixedNpm: Record<string, string> = {};
  const names =
    request.outputType === "video" && (request.renderer ?? "hyperframes") === "hyperframes"
      ? ["hyperframes", "gsap"]
      : [];
  for (const name of names) {
    const meta = packageMetadata.parse(
      await readJson(path.join(appRoot, "node_modules", name, "package.json")),
    );
    fixedNpm[name] = meta.version;
  }
  const policy = { fixedNpm, outputType: request.outputType };
  if (
    !legacy ||
    (await lstat(path.join(workspace, policyFile)).then(
      () => true,
      () => false,
    ))
  )
    await writeOwned(path.join(workspace, policyFile), JSON.stringify(policy, null, 2));
  let saved;
  try {
    saved = ProjectTechnologyRecordSchema.parse(
      await readJson(path.join(workspace, projectTechnologyFile)),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const dependencies = {
    ...fixedNpm,
    ...Object.fromEntries(
      (saved?.selected ?? [])
        .filter((entry) => entry.ecosystem === "npm")
        .map((entry) => [entry.package!, entry.version!]),
    ),
  };
  await writeOwned(
    path.join(workspace, "package.json"),
    JSON.stringify(
      {
        name: request.outputType === "page" ? "interactive-page" : "video-composition",
        private: true,
        type: "module",
        dependencies,
      },
      null,
      2,
    ),
  );
  if (names.includes("gsap"))
    await copyFile(
      path.join(appRoot, "node_modules/gsap/dist/gsap.min.js"),
      path.join(workspace, projectArtifactPath(workspace, "vendor", "gsap.min.js")),
    );
}

/** Final selection only. Resolves actual versions, writes manifests, and never installs or executes project code. */
export async function selectProjectTechnologies(
  workspace: string,
  selections: ProjectTechnologySelection[],
  signal: AbortSignal,
) {
  const lease = await acquireFileLease(path.join(workspace, "technology-selection"), signal);
  try {
    signal = lease.signal;
    const policy = z
      .object({ fixedNpm: z.record(z.string(), version) })
      .parse(await readJson(path.join(workspace, policyFile)));
    const selected: z.infer<typeof ProjectTechnologyRecordSchema>["selected"] = [];
    if (new Set(selections.map((entry) => entry.id)).size !== selections.length)
      throw Error("Choose each technology once");
    for (const selection of selections) {
      signal.throwIfAborted();
      if (!Object.hasOwn(technologyPool, selection.id))
        throw Error("Unknown technology; search the pool first");
      const definition: TechnologyDefinition =
        technologyPool[selection.id as keyof typeof technologyPool];
      const root = await projectTechnologyRoot(workspace, selection.runtimeDirectory);
      const environment = { ...process.env };
      let python: string | undefined;
      if (selection.pythonExecutable) {
        const folder = await projectTechnologyRoot(
          workspace,
          path.dirname(selection.pythonExecutable),
        );
        python = path.join(folder, path.basename(selection.pythonExecutable));
        environment.KITEVA_TECHNOLOGY_PYTHON = python;
      }
      const availability = await technologyEnvironment(root, environment).inspect(selection.id);
      const entry: (typeof selected)[number] = {
        ...selection,
        name: definition.name,
        ecosystem: "native",
      };
      if (
        definition.package &&
        policy.fixedNpm[definition.package] &&
        selection.runtimeDirectory === "."
      ) {
        Object.assign(entry, {
          ecosystem: "npm",
          package: definition.package,
          version: policy.fixedNpm[definition.package],
        });
      } else if (definition.kind === "python_library") {
        if (!python || !definition.package)
          throw Error("Final Python selection requires a project-local pythonExecutable");
        const result = await execute(
          python,
          [
            "-c",
            "import importlib.metadata,json,sys; print(json.dumps({'prefix':sys.prefix,'version':importlib.metadata.version(sys.argv[1])}))",
            definition.package,
          ],
          { signal, timeout: 10000, maxBuffer: 4096, env: systemEnvironment() },
        );
        const metadata = z.object({ prefix: z.string(), version }).parse(JSON.parse(result.stdout));
        const prefix = await realpath(metadata.prefix);
        const base = await realpath(workspace);
        if (!prefix.startsWith(base + path.sep))
          throw Error("Python environment must belong to this project");
        Object.assign(entry, {
          ecosystem: "python",
          package: definition.package,
          version: metadata.version,
        });
      } else if (definition.package && availability.package) {
        if (availability.status !== "available")
          throw Error(`${availability.name}: prepare its project dependencies first`);
        const packageRoot = await realpath(path.join(root, "node_modules", definition.package));
        if (!packageRoot.startsWith((await realpath(root)) + path.sep))
          throw Error("Package is outside the project runtime");
        const meta = packageMetadata.parse(await readJson(path.join(packageRoot, "package.json")));
        if (meta.name !== definition.package) throw Error("Installed package identity mismatch");
        Object.assign(entry, { ecosystem: "npm", package: meta.name, version: meta.version });
        entry.browserSources = await browserPackageSources(
          workspace,
          selection.runtimeDirectory,
          meta.name,
          meta.version,
        );
      } else {
        if (availability.status === "unavailable")
          throw Error(`${availability.name} is unavailable`);
        entry.ecosystem =
          availability.category === "host_tool"
            ? "external"
            : availability.category === "asset"
              ? "asset"
              : availability.category === "technique"
                ? "technique"
                : "native";
      }
      selected.push(entry);
    }
    const npm = { ...policy.fixedNpm };
    const python = new Map<string, string>();
    for (const entry of selected) {
      if (!entry.package || !entry.version) continue;
      const map = entry.ecosystem === "python" ? python : undefined;
      const previous = map ? map.get(entry.package) : npm[entry.package];
      if (previous && previous !== entry.version)
        throw Error("Selected technologies require conflicting versions");
      if (map) map.set(entry.package, entry.version);
      else npm[entry.package] = entry.version;
    }
    const current = z
      .record(z.string(), z.unknown())
      .parse(await readJson(path.join(workspace, "package.json")));
    await writeOwned(
      path.join(workspace, "package.json"),
      JSON.stringify({ ...current, dependencies: npm }, null, 2),
    );
    await writeOwned(
      path.join(workspace, "requirements.txt"),
      [...python].map(([name, pinned]) => `${name}==${pinned}`).join("\n") +
        (python.size ? "\n" : ""),
    );
    const record = ProjectTechnologyRecordSchema.parse({
      updatedAt: new Date().toISOString(),
      fixedNpm: policy.fixedNpm,
      selected,
    });
    await writeOwned(path.join(workspace, projectTechnologyFile), JSON.stringify(record, null, 2));
    return record;
  } finally {
    await lease.release();
  }
}

/** Existing projects without the new policy remain readable; new projects must declare final choices. */
export async function validateProjectDependencySelection(workspace: string) {
  try {
    await readFile(path.join(workspace, policyFile));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  const record = ProjectTechnologyRecordSchema.parse(
    await readJson(path.join(workspace, projectTechnologyFile)).catch(() => {
      throw Error(
        "Call creative_pool.select_project_technologies with final choices (or an empty list) before returning production.",
      );
    }),
  );
  const npm = {
    ...record.fixedNpm,
    ...Object.fromEntries(
      record.selected
        .filter((entry) => entry.ecosystem === "npm")
        .map((entry) => [entry.package!, entry.version!]),
    ),
  };
  const actual = z
    .object({ dependencies: z.record(z.string(), z.string()) })
    .parse(await readJson(path.join(workspace, "package.json")));
  if (
    JSON.stringify(Object.entries(actual.dependencies).sort()) !==
    JSON.stringify(Object.entries(npm).sort())
  )
    throw Error(
      "package.json disagrees with final technology selection; select the final tools again",
    );
  const expected = record.selected
    .filter((entry) => entry.ecosystem === "python")
    .map((entry) => `${entry.package}==${entry.version}`)
    .sort();
  const requirements = (await readFile(path.join(workspace, "requirements.txt"), "utf8"))
    .split(/\r?\n/)
    .filter(Boolean)
    .sort();
  if (JSON.stringify([...new Set(expected)]) !== JSON.stringify(requirements))
    throw Error("requirements.txt disagrees with final technology selection");
}
