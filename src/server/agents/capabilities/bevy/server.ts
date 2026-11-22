import { z } from "zod";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createBevyTools } from "./tools";
const config = z
  .object({ workspace: z.string(), readOnly: z.boolean().default(false) })
  .parse(JSON.parse(process.argv[2]));
const server = createBevyTools(config.workspace, config.readOnly);
const close = () => {
  void server.close().finally(() => process.exit(0));
};
process.once("SIGTERM", close);
process.once("SIGINT", close);
process.stdin.once("end", close);
await server.connect(new StdioServerTransport());
