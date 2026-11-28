import type { CreativeRequest } from "./contracts";
import type { RoomLibraryAsset } from "./room";
import {
  acceptsBriefAttachment,
  BriefRequirementsSchema,
  type BriefRequirements,
} from "./brief-sections";
import { validateAssetLimits } from "./asset-limits";
export type BriefAttachmentSection = "main" | "images" | "videos" | "music";
export const emptyRequirements = (): BriefRequirements => ({
  main: { instructions: "", assetIds: [] },
  images: { instructions: "", assetIds: [] },
  videos: { instructions: "", assetIds: [] },
  music: { instructions: "", assetIds: [] },
  urls: { instructions: "" },
});
export function roomMaterialSection(name: string): BriefAttachmentSection | undefined {
  return (["main", "images", "videos", "music"] as const).find((section) =>
    acceptsBriefAttachment(section, name),
  );
}
/** Reclassify legacy image-section clips using saved file metadata, preserving notes and IDs. */
export function normalizeBriefAttachmentSections(
  requirements: BriefRequirements,
  assets: readonly Pick<RoomLibraryAsset, "id" | "originalName">[],
): BriefRequirements {
  const next = structuredClone(requirements);
  next.videos ||= { instructions: "", assetIds: [] };
  const videoIds = next.images.assetIds.filter((id) =>
    assets.some((asset) => asset.id === id && roomMaterialSection(asset.originalName) === "videos"),
  );
  next.images.assetIds = next.images.assetIds.filter((id) => !videoIds.includes(id));
  next.videos.assetIds = [...new Set([...next.videos.assetIds, ...videoIds])];
  return next;
}
export function toggleRoomAsset<T extends Pick<CreativeRequest, "assetIds" | "requirements">>(
  request: T,
  asset: RoomLibraryAsset,
  selected: RoomLibraryAsset[],
): T {
  const section = roomMaterialSection(asset.originalName);
  if (!section) throw Error(`${asset.originalName} can’t be used in a brief`);
  const removing = request.assetIds.includes(asset.id);
  const ids = removing
    ? request.assetIds.filter((id) => id !== asset.id)
    : [...request.assetIds, asset.id];
  if (!removing)
    validateAssetLimits(
      [...selected.filter((item) => item.id !== asset.id), asset].map((item) => ({
        ...item,
        name: item.originalName,
      })),
    );
  const requirements = normalizeBriefAttachmentSections(
    request.requirements || emptyRequirements(),
    [...selected, asset],
  );
  requirements[section].assetIds = removing
    ? requirements[section].assetIds.filter((id) => id !== asset.id)
    : [...requirements[section].assetIds, asset.id];
  return { ...request, assetIds: ids, requirements };
}

/** Apply attachment rules without requiring the rest of an in-progress brief to be complete. */
export function toggleSavedDraftAttachment(
  request: Record<string, unknown>,
  asset: RoomLibraryAsset,
  selected: RoomLibraryAsset[],
) {
  const attachments = toggleRoomAsset(
    {
      assetIds: selected.map(({ id }) => id),
      requirements:
        request.requirements === undefined
          ? undefined
          : BriefRequirementsSchema.parse(request.requirements),
    },
    asset,
    selected,
  );
  return { ...request, ...attachments };
}
