import { assetMimeTypes } from "../../shared/asset-media-types";
export { assetMimeTypes } from "../../shared/asset-media-types";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import type { Asset } from "../../shared/contracts";
import { validateAssetLimits } from "../../shared/asset-limits";
import { CodedError } from "../../shared/errors";
import { inspectAssetLimits } from "./asset-limits";

/** Shared HTTP/MCP storage; registration and project association belong to the caller. */
export async function writeUploadedAsset(
  buffer: Buffer,
  filename: string,
  kind: string,
  directory: string,
  existing: Asset[] = [],
): Promise<Asset> {
  const extension = path.extname(filename).toLowerCase();
  if (!assetMimeTypes[extension])
    throw new CodedError("FILE_TYPE_UNSUPPORTED", "Unsupported asset type");
  const id = randomUUID();
  const asset: Asset = {
    id,
    name: `${id}${extension}`,
    path: path.join(directory, `${id}${extension}`),
    originalName: path.basename(filename),
    kind: kind || assetMimeTypes[extension],
    bytes: buffer.length,
  };
  validateAssetLimits([...existing, asset]);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(asset.path, buffer, { mode: 0o600 });
  try {
    await inspectAssetLimits(asset, buffer);
    validateAssetLimits([...existing, asset]);
    return asset;
  } catch (error) {
    await rm(asset.path, { force: true });
    throw error;
  }
}
