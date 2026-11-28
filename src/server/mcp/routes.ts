import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { assetLimits } from "../../shared/asset-limits";
import { kitevaMcpPath } from "../../shared/kiteva-mcp";
import { createKitevaMcpTools, type KitevaMcpDependencies } from "./tools";
import { McpUploads, mcpUploadPath, mcpUploadTokenHeader, mcpUploadContentType } from "./uploads";

/** Bundle the agent interface into the application's existing HTTP listener. */
export function registerKitevaMcpRoutes(app: FastifyInstance, dependencies: KitevaMcpDependencies) {
  // This guard lives across HTTP requests, rather than inside an individual MCP connection.
  let submitting = false;
  const start: KitevaMcpDependencies["start"] = async (request, sourceDraft) => {
    if (submitting) throw Error("An idea submission is already in progress; do not submit twice.");
    submitting = true;
    try {
      return await dependencies.start(request, sourceDraft);
    } finally {
      submitting = false;
    }
  };
  const uploads = new McpUploads(dependencies.store, dependencies.assetDirectory);
  const connections = new Set<() => Promise<void>>();
  app.addHook("onClose", async () => {
    uploads.close();
    await Promise.allSettled([...connections].map((close) => close()));
  });
  const checkLocalAccess = async (request: FastifyRequest, reply: FastifyReply) => {
    // The existing app is local-only. Preserve that boundary for direct/dev access too.
    let hostname: string;
    try {
      hostname = new URL(`http://${request.headers.host}`).hostname;
    } catch {
      return reply.code(403).send({ error: "Local host required" });
    }
    if (!["127.0.0.1", "localhost", "[::1]"].includes(hostname))
      return reply.code(403).send({ error: "Local host required" });
    const origin = request.headers.origin;
    if (
      origin &&
      !new Set([new URL(dependencies.webUrl).origin, `http://${request.headers.host}`]).has(origin)
    )
      return reply.code(403).send({ error: "Foreign origin rejected" });
  };
  void app.register(async (uploadRoutes) => {
    uploadRoutes.addContentTypeParser(
      mcpUploadContentType,
      { parseAs: "buffer" },
      (_request, body, done) => done(null, body),
    );
    uploadRoutes.put<{ Params: { id: string }; Body: Buffer }>(`${mcpUploadPath}/:id`, {
      bodyLimit: assetLimits.audio.bytes,
      onRequest: [
        checkLocalAccess,
        async (request) => {
          uploads.authorizePut(request.params.id, request.headers[mcpUploadTokenHeader]);
        },
      ],
      handler: async (request, reply) => {
        if (!Buffer.isBuffer(request.body))
          return reply.code(415).send({ error: "Send the raw file as application/octet-stream" });
        uploads.receive(request.params.id, request.headers[mcpUploadTokenHeader], request.body);
        return reply.code(204).send();
      },
    });
  });
  app.route({
    method: ["POST", "GET", "DELETE"],
    url: kitevaMcpPath,
    bodyLimit: 512_000,
    onRequest: checkLocalAccess,
    handler: async (request, reply) => {
      const server = createKitevaMcpTools({ ...dependencies, start }, uploads);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      let closed: Promise<void> | undefined;
      const close = () =>
        (closed ??= Promise.allSettled([server.close(), transport.close()]).then(() => {
          connections.delete(close);
        }));
      connections.add(close);
      reply.raw.once("close", () => {
        void close();
      });
      await server.connect(transport);
      reply.hijack();
      try {
        await transport.handleRequest(request.raw, reply.raw, request.body);
      } finally {
        await close();
      }
    },
  });
}
