import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  AnalyzeMusicInputSchema,
  type MusicAnalysisToolResult,
} from "../../../../shared/music-analysis";
import { analyzeMusic } from "../../../audio/music-analysis";
import { safeMessage } from "../../../runtime/config";
import { musicAnalysisGuidance } from "./prompt";

export function createMusicAnalysisTools(workspace: string, readOnly = false) {
  const server = new McpServer(
    { name: "music_analysis", version: "1.0.0" },
    { instructions: musicAnalysisGuidance, capabilities: { tools: {} } },
  );
  if (!readOnly)
    server.registerTool(
      "analyze_music",
      {
        description:
          "Build-only local music beat analysis using the installed HyperFrames CLI. Reads one workspace-relative audio file inside render inputs (up to 256 MiB), saves/replaces its .beats.json sidecar, and returns source SHA-256, estimated BPM and beat timestamps in source seconds. No network, inference, audio edits, renderer changes, section/downbeat detection or quality judgement. Empty beats are valid; errors/cancellation retain prior sidecars. Retry after correcting the file or runtime; reanalyze after audio edits. Timeout: 180 seconds.",
        inputSchema: AnalyzeMusicInputSchema,
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (input, extra) => {
        try {
          const structuredContent: MusicAnalysisToolResult = await analyzeMusic(
            workspace,
            input,
            extra.signal,
          );
          return {
            content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }],
            structuredContent,
          };
        } catch (error) {
          const structuredContent: MusicAnalysisToolResult = {
            kind: "error",
            message: safeMessage(error),
          };
          return {
            content: [{ type: "text" as const, text: structuredContent.message }],
            structuredContent,
            isError: true,
          };
        }
      },
    );
  return server;
}
