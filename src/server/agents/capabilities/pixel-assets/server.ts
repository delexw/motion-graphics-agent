import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerLpcTools } from "../lpc/tools";
import { registerPixelFxTools } from "../pixel-fx/tools";

const { workspace, root, id } = z
  .object({
    workspace: z.string(),
    root: z.string(),
    id: z.enum(["lpc", "pixel_fx"]),
  })
  .parse(JSON.parse(process.argv[2]));
const server = new McpServer({ name: id, version: "1.0.0" }, { capabilities: { tools: {} } });
if (id === "lpc") registerLpcTools(server, workspace, root);
else registerPixelFxTools(server, workspace, root);
const close = () => {
  void server.close().finally(() => process.exit(0));
};
process.once("SIGTERM", close);
process.once("SIGINT", close);
process.stdin.once("end", close);
await server.connect(new StdioServerTransport());
