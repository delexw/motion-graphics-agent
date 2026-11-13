import { installedAudioStudio } from "./installation-state";
import path from "node:path";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { appRoot, dataRoot } from "../../../runtime/config";
import { userHome } from "../../../runtime/platform";
import type { AgentMcpCapability } from "../shared/types";

export const audioStudioTools = ["generate_audio", "edit_audio", "process_audio", "unload_models"];

/** Use an explicit executable or the project-local upstream installation; never install during a job. */
export function audioStudioCommand() {
  let managed: string | undefined;
  if (!process.env.AUDIO_STUDIO_MCP_COMMAND) {
    try {
      managed = installedAudioStudio()?.executable;
    } catch {
      /* Preserve legacy setup when managed state is damaged. */
    }
  }
  const command =
    process.env.AUDIO_STUDIO_MCP_COMMAND ||
    managed ||
    path.join(
      dataRoot,
      "audio-studio-mcp",
      ".venv",
      process.platform === "win32" ? "Scripts/audio-studio-mcp.exe" : "bin/audio-studio-mcp",
    );
  return path.isAbsolute(command) && existsSync(command) ? command : undefined;
}

export function audioStudioCapability(workspace: string): AgentMcpCapability | undefined {
  const command = audioStudioCommand();
  if (!command) return;
  return {
    command: process.execPath,
    args: [
      "--import",
      pathToFileURL(path.join(appRoot, "node_modules/tsx/dist/loader.mjs")).href,
      path.join(appRoot, "src/server/agents/capabilities/audio-studio/server.ts"),
      JSON.stringify({ workspace, command }),
    ],
    // Keep the configured service's model caches when an SDK isolates its own process home.
    env: {
      HOME: userHome(),
      ...(process.platform === "win32" ? { USERPROFILE: userHome() } : {}),
    },
    enabledTools: audioStudioTools,
    toolTimeoutSeconds: 1800,
  };
}
