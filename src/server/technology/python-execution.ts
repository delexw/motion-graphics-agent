import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, realpath, stat, rm } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { isolatedCommand } from "../runtime/process";
import { projectTechnologyRoot } from "./project-runtime";
import { projectTechnologyFile } from "./project-dependencies";
import { ProjectTechnologyRecordSchema } from "../../shared/project-technologies";
import {
  PythonAssetRequestSchema,
  TechnologyExecutionSchema,
  type TechnologyExecution,
} from "../../shared/technology-executions";
import { renderInputRoot } from "../runtime/workspace";
import { acquireFileLease } from "../runtime/file-lease";
export const technologyExecutionFile = "diagnostics/technology-executions.json";
const digest = (data: Buffer) => createHash("sha256").update(data).digest("hex");
async function localFile(workspace: string, relative: string) {
  if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes(".."))
    throw Error("Use project-relative files without traversal");
  const base = await realpath(workspace),
    file = await realpath(path.join(base, relative));
  if (!file.startsWith(base + path.sep)) throw Error("File is outside this project");
  return file;
}
/** Explicit asset production, isolated from credentials/network. Never infer execution from selection. */
export async function runPythonAsset(
  workspace: string,
  input: z.infer<typeof PythonAssetRequestSchema>,
  signal: AbortSignal,
) {
  workspace = await realpath(workspace);
  const request = PythonAssetRequestSchema.parse(input);
  const selection = ProjectTechnologyRecordSchema.parse(
    JSON.parse(await readFile(path.join(workspace, projectTechnologyFile), "utf8")),
  );
  const entries = request.technologyIds.map((id) =>
    selection.selected.find((entry) => entry.id === id),
  );
  if (
    entries.some(
      (entry) =>
        !entry ||
        entry.ecosystem !== "python" ||
        !entry.pythonExecutable ||
        !entry.package ||
        !entry.version,
    )
  )
    throw Error("Choose finalized project-local Python dependencies first");
  const selected = entries.filter((entry): entry is NonNullable<typeof entry> => !!entry);
  const interpreter = selected[0].pythonExecutable!;
  if (selected.some((entry) => entry.pythonExecutable !== interpreter))
    throw Error("Use one Python environment per asset execution");
  await projectTechnologyRoot(workspace, path.dirname(interpreter));
  const script = await localFile(workspace, request.script);
  if (!script.endsWith(".py") || (await stat(script)).size > 256000)
    throw Error("Choose a local Python script up to 256 KB");
  const scriptSha256 = digest(await readFile(script));
  const renderRoot = await realpath(renderInputRoot(workspace));
  for (const relative of request.outputFiles) {
    const parent = await projectTechnologyRoot(workspace, path.dirname(relative));
    if (!parent.startsWith(renderRoot + path.sep) && parent !== renderRoot)
      throw Error("Asset outputs must be inside render inputs");
    const file = await localFile(workspace, relative).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return path.join(parent, path.basename(relative));
    });
    if (!file.startsWith(renderRoot + path.sep))
      throw Error("Asset outputs must be inside render inputs");
  }
  const lease = await acquireFileLease(path.join(workspace, "python-asset-execution"), signal);
  const id = randomUUID(),
    trace = path.join(workspace, "diagnostics", `python-trace-${id}.json`);
  try {
    await mkdir(path.dirname(trace), { recursive: true });
    const startedAt = Date.now();
    const wrapper = `import sys,runpy,json,pathlib,importlib.metadata\nscript,trace,packages,arguments=sys.argv[1:5]\nsys.argv=[script,*json.loads(arguments)]\nrunpy.run_path(script,run_name="__main__")\nloaded={str(pathlib.Path(m.__file__).resolve()) for m in list(sys.modules.values()) if getattr(m,"__file__",None)}\nrecords=[]\nfor package in json.loads(packages):\n d=importlib.metadata.distribution(package)\n used=any(str(pathlib.Path(d.locate_file(f)).resolve()) in loaded for f in (d.files or []))\n records.append({"package":package,"version":d.version,"used":used})\npathlib.Path(trace).write_text(json.dumps({"prefix":sys.prefix,"records":records}))`;
    await isolatedCommand(
      path.join(workspace, interpreter),
      [
        "-c",
        wrapper,
        script,
        trace,
        JSON.stringify(selected.map((entry) => entry.package)),
        JSON.stringify(request.args ?? []),
      ],
      workspace,
      lease.signal,
      () => {},
      60000,
    );
    const observed = z
      .object({
        prefix: z.string(),
        records: z.array(z.object({ package: z.string(), version: z.string(), used: z.boolean() })),
      })
      .parse(JSON.parse(await readFile(trace, "utf8")));
    const prefix = await realpath(observed.prefix),
      base = await realpath(workspace);
    if (!prefix.startsWith(base + path.sep))
      throw Error("Observed interpreter is not a project-local virtual environment");
    for (const entry of selected)
      if (
        !observed.records.some(
          (row) => row.package === entry.package && row.version === entry.version && row.used,
        )
      )
        throw Error(`No observed module execution for ${entry.id}`);
    const outputs = [];
    for (const relative of request.outputFiles) {
      const file = await localFile(workspace, relative);
      if ((await stat(file)).mtimeMs < startedAt - 1000)
        throw Error("Declared asset was not rewritten by this execution");
      outputs.push({ path: relative, sha256: digest(await readFile(file)) });
    }
    if (digest(await readFile(script)) !== scriptSha256)
      throw Error("Asset script changed during execution");
    const evidence: TechnologyExecution = {
      id,
      observedAt: new Date().toISOString(),
      script: request.script,
      scriptSha256,
      interpreter,
      technologies: selected.map((entry) => ({
        id: entry.id,
        package: entry.package!,
        version: entry.version!,
      })),
      outputs,
    };
    let records: TechnologyExecution[] = [];
    try {
      records = z
        .array(TechnologyExecutionSchema)
        .parse(JSON.parse(await readFile(path.join(workspace, technologyExecutionFile), "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await writeFile(
      path.join(workspace, technologyExecutionFile),
      JSON.stringify([...records.slice(-99), evidence], null, 2),
    );
    return evidence;
  } finally {
    await rm(trace, { force: true });
    await lease.release();
  }
}
