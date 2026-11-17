import path from "node:path";
import { pathToFileURL } from "node:url";
import { appRoot } from "../../../runtime/config";
import type { AgentMcpCapability } from "../shared/types";

export function musicAnalysisCapability(workspace: string): AgentMcpCapability {
  return {
    command: process.execPath,
    args: [
      "--import",
      pathToFileURL(path.join(appRoot, "node_modules/tsx/dist/loader.mjs")).href,
      path.join(appRoot, "src/server/agents/capabilities/music-analysis/server.ts"),
      JSON.stringify({ workspace }),
    ],
    env: {},
    enabledTools: ["analyze_music"],
    toolTimeoutSeconds: 210,
  };
}
