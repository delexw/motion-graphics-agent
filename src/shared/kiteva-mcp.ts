import type { assetLimits } from "./asset-limits";
import type { AssetOwner } from "./asset-owner";
import type { VideoRequest } from "./domains/video";

export const kitevaMcpPath = "/mcp";

export type KitevaIdeaSummary = {
  id: string;
  name: string;
  kind: "draft" | "project";
  phase: string;
};

/** Public agent-facing data only: no workspaces, credentials, source code or event logs. */
export type KitevaMcpResult =
  | { kind: "search"; ideas: KitevaIdeaSummary[] }
  | {
      kind: "idea";
      id: string;
      request: Record<string, unknown>;
      revision?: number;
      draftId?: string;
      assets?: KitevaMcpAsset[];
    }
  | {
      kind: "created";
      id: string;
      request: VideoRequest;
      url: string;
      started: false;
      draftId: string;
    }
  | { kind: "started"; id: string; projectId: string; phase: string; url: string; draftId?: string }
  | { kind: "asset_imported"; target: AssetOwner; asset: KitevaMcpAsset; revision?: number }
  | { kind: "assets"; target: AssetOwner; assets: KitevaMcpAsset[]; revision?: number }
  | {
      kind: "options";
      defaults: Partial<VideoRequest>;
      settingsSchema: Record<string, unknown>;
      uploadLimits: typeof assetLimits;
      supportedExtensions: string[];
    }
  | {
      kind: "styles";
      styles: { id: string; name: string; category: string; visualDirection: string }[];
    }
  | { kind: "error"; message: string };

export type KitevaMcpAsset = {
  id: string;
  originalName: string;
  kind: string;
  bytes: number;
  owner?: AssetOwner;
  attached: boolean;
};
