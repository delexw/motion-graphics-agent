import { roomMaterialSection } from "../../shared/brief-attachments";
import { lookup } from "node:dns/promises";
import { open, realpath, rm } from "node:fs/promises";
import path from "node:path";
import ipaddr from "ipaddr.js";
import { z } from "zod";
import type { AssetOwner } from "../../shared/asset-owner";
import { assetLimits, validateAssetLimits } from "../../shared/asset-limits";
import type { Asset } from "../../shared/contracts";
import { dataRoot } from "../runtime/config";
import type { Store } from "../jobs/store";
import { referenceResource } from "../requests/reference-resource";
import { writeUploadedAsset, assetMimeTypes } from "../requests/asset-storage";

export const AssetTargetSchema = z.object({
  kind: z.enum(["draft", "project"]),
  id: z
    .string()
    .uuid()
    .describe("Stable draftId from create_idea/read_idea, or the projectId from start_idea."),
});
export const AssetSourceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("local_file"),
    path: z
      .string()
      .min(1)
      .describe(
        "Absolute path to the selected asset on the Kiteva host; never a source directory or credentials file.",
      ),
  }),
  z.object({
    kind: z.literal("comfyui_output"),
    url: z
      .url()
      .describe(
        "ComfyUI /view or /api/view URL for an actual output/temp asset. Not an arbitrary website or instructions.",
      ),
  }),
]);

async function validateComfyUrl(value: string) {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    !["/view", "/api/view"].includes(url.pathname) ||
    !["output", "temp"].includes(url.searchParams.get("type") || "")
  )
    throw Error("Use a ComfyUI output/temp view URL without credentials");
  const filename = url.searchParams.get("filename") || "";
  if (
    !filename ||
    filename.includes("/") ||
    filename.includes("\\") ||
    !roomMaterialSection(filename)
  )
    throw Error("ComfyUI output has an unsupported filename");
  const addresses = await lookup(url.hostname.replace(/^\[|\]$/g, ""), { all: true });
  if (
    !addresses.length ||
    addresses.some(
      ({ address }) =>
        !["unicast", "private", "loopback"].includes(ipaddr.process(address).range()),
    )
  )
    throw Error("ComfyUI address is not a supported local/LAN/public host");
  return { url, addresses };
}

function inspectAssetTarget(store: Store, target: AssetOwner) {
  const room = store.room();
  const draft = Object.values(room.drafts).find((item) => item.id === target.id);
  const project = target.kind === "project" ? store.get(target.id) : undefined;
  if (target.kind === "draft" && !draft)
    throw Error("Draft not found; create/read the draft first");
  if (target.kind === "project" && !project) throw Error("Project not found");
  const ids =
    target.kind === "draft"
      ? (draft!.request.assetIds as string[]) || []
      : project!.request.assetIds;
  const existing = new Map(ids.map((id) => store.getAsset(id)!).map((a) => [a.id, a]));
  return { revision: room.revision, existing: [...existing.values()] };
}

export function validateMcpUpload(
  store: Store,
  target: AssetOwner,
  filename: string,
  bytes: number,
) {
  if (
    filename !== path.posix.basename(filename) ||
    filename !== path.win32.basename(filename) ||
    filename.includes("\0") ||
    !roomMaterialSection(filename) ||
    !assetMimeTypes[path.extname(filename).toLowerCase()]
  )
    throw Error("Use a supported filename without a path");
  const { existing } = inspectAssetTarget(store, target);
  validateAssetLimits([...existing, { name: filename, bytes }]);
}

export async function importMcpAsset(
  store: Store,
  target: AssetOwner,
  source: z.infer<typeof AssetSourceSchema>,
  directory?: string,
) {
  const snapshot = inspectAssetTarget(store, target);
  let filename: string;
  let buffer: Buffer;
  if (source.kind === "local_file") {
    if (!path.isAbsolute(source.path)) throw Error("Local asset path must be absolute");
    const filenamePath = await realpath(source.path);
    filename = path.basename(filenamePath);
    if (!roomMaterialSection(filename)) throw Error("Unsupported asset type");
    const file = await open(filenamePath, "r");
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > assetLimits.audio.bytes)
        throw Error("Select one supported asset of at most 25 MB");
      buffer = await file.readFile();
    } finally {
      await file.close();
    }
  } else {
    // Reuse the pinned-DNS, bounded download transport. Redirects are not followed.
    const validated = await validateComfyUrl(source.url);
    filename = validated.url.searchParams.get("filename")!;
    const response = await referenceResource(
      source.url,
      AbortSignal.timeout(30000),
      "local",
      {},
      () => {},
      async () => validated,
    );
    if (response.status !== 200)
      throw Error(`ComfyUI rejected asset download (${response.status})`);
    buffer = response.body;
  }
  return attachMcpAssetBytes(store, target, filename, buffer, directory, snapshot);
}

export async function attachMcpAssetBytes(
  store: Store,
  target: AssetOwner,
  filename: string,
  buffer: Buffer,
  directory = path.join(dataRoot, "uploads"),
  { revision, existing }: { revision: number; existing: Asset[] } = inspectAssetTarget(
    store,
    target,
  ),
) {
  const asset = await writeUploadedAsset(
    buffer,
    filename,
    assetMimeTypes[path.extname(filename).toLowerCase()],
    path.join(directory, target.kind, target.id),
    existing,
  );
  try {
    return store.commitImportedAsset(asset, target, revision);
  } catch (error) {
    await rm(asset.path, { force: true });
    throw error;
  }
}
