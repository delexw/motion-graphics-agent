import { zstdCompressSync } from "node:zlib";
import { expect, it } from "vitest";
import { parseJevRequest } from "./jev-request";

it.each([false, true])("decodes SDK request JSON with compression=%s", async (compressed) => {
  const request = {
    state: { instructions: "保持原始要求" },
    questions: { choice: { type: "choice" } },
  };
  const json = JSON.stringify(request);
  const body = compressed ? new Uint8Array(zstdCompressSync(Buffer.from(json))) : json;
  expect(
    await parseJevRequest({ body, headers: compressed ? { "content-encoding": "zstd" } : {} }),
  ).toEqual(request);
});
