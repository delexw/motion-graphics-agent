import { access, realpath } from "node:fs/promises";
import { projectTechnologyFile } from "./project-dependencies";
import path from "node:path";
import { appRoot, safeMessage } from "../runtime/config";
import { isolatedCommand } from "../runtime/process";

/** Observer records local browser loads, not proof that each library affected the final image. */
export async function observeProjectTechnologies(
  workspace: string,
  sourceFile: string,
  signal: AbortSignal,
  emit: (type: string, message: string) => void,
) {
  if (!sourceFile.endsWith(".html")) return;
  workspace = await realpath(workspace);
  try {
    await access(path.join(workspace, projectTechnologyFile));
  } catch {
    return;
  }
  try {
    await isolatedCommand(
      process.execPath,
      [
        "--import",
        "tsx",
        path.join(appRoot, "scripts/observe-project-technologies.ts"),
        workspace,
        sourceFile,
      ],
      workspace,
      signal,
      () => {},
      60000,
    );
  } catch (error) {
    signal.throwIfAborted();
    emit("warning", `Technology usage observation unavailable: ${safeMessage(error)}`);
  }
}
