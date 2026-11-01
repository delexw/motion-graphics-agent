import { zstdDecompressSync } from "node:zlib";

/** Decode the actual SDK transport body so fixture assertions inspect the logical request. */
export async function parseJevRequest(init: RequestInit) {
  const bytes = Buffer.from(await new Response(init.body).arrayBuffer());
  const encoding = new Headers(init.headers).get("content-encoding");
  return JSON.parse((encoding === "zstd" ? zstdDecompressSync(bytes) : bytes).toString("utf8"));
}
