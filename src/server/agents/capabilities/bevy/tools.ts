import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BevyRenderInputSchema, type BevyRenderResult } from "../../../../shared/bevy-render";
import { safeMessage } from "../../../runtime/config";
import { bevyGuidance } from "./prompt";
import { renderBevyFrames } from "./render";

export function createBevyTools(workspace: string, readOnly = false) {
  const server = new McpServer(
    { name: "bevy", version: "1.0.0" },
    { instructions: bevyGuidance, capabilities: { tools: {} } },
  );
  if (!readOnly)
    server.registerTool(
      "render_frames",
      {
        description:
          "Build-only. Run a project-local compiled Bevy scene in the render sandbox for up to 180 seconds. Inputs are a render-input executable path, a new shot name, width and height up to 4096 pixels, FPS up to 120, and up to 3000 frames. Returns the local directory and numbering of PNG frames after checking count, format and dimensions. Existing shots are preserved. Failed or cancelled runs discard staged frames. No dependency installation, external network, inference or final video rendering.",
        inputSchema: BevyRenderInputSchema,
        annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      },
      async (input, extra) => {
        try {
          const structuredContent = await renderBevyFrames(workspace, input, extra.signal);
          return {
            content: [{ type: "text", text: JSON.stringify(structuredContent) }],
            structuredContent,
          };
        } catch (error) {
          const structuredContent: BevyRenderResult = {
            kind: "error",
            message: safeMessage(error),
          };
          return {
            content: [{ type: "text", text: structuredContent.message }],
            structuredContent,
            isError: true,
          };
        }
      },
    );
  return server;
}
