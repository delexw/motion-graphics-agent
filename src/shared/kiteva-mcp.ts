import type { RequestSettingsReview } from "./request-settings-review";
import type { assetLimits } from "./asset-limits";
import type { AssetOwner } from "./asset-owner";
import type { MusicStyleGroup } from "./music-styles";
import type { CreativeRequest } from "./contracts";

export const kitevaMcpPath = "/mcp";

export type KitevaIdeaSummary = {
  id: string;
  name: string;
  kind: "draft" | "project";
  phase: string;
};

/** Public agent-facing data only: no workspaces, credentials, source code or event logs. */
export type KitevaMcpResult =
  | import("./project-reuse").ProjectReuseMcpResult
  | { kind: "search"; ideas: KitevaIdeaSummary[] }
  | {
      kind: "idea";
      id: string;
      request: Record<string, unknown>;
      languageSettings?: import("./language-tracks").LanguageTrackRow[];
      revision?: number;
      draftId?: string;
      assets?: KitevaMcpAsset[];
    }
  | {
      kind: "created";
      revision?: number;
      id: string;
      request: CreativeRequest;
      languageSettings?: import("./language-tracks").LanguageTrackRow[];
      url: string;
      started: false;
      draftId: string;
    }
  | { kind: "started"; id: string; projectId: string; phase: string; url: string; draftId?: string }
  | { kind: "asset_imported"; target: AssetOwner; asset: KitevaMcpAsset; revision?: number }
  | {
      kind: "upload_requested";
      uploadId: string;
      uploadUrl: string;
      method: "PUT";
      headers: Record<string, string>;
      expiresAt: string;
    }
  | { kind: "assets"; target: AssetOwner; assets: KitevaMcpAsset[]; revision?: number }
  | {
      kind: "options";
      outputType: CreativeRequest["outputType"];
      defaults: Partial<CreativeRequest>;
      languageDefaults?: { generateNarration: boolean; showSubtitles: boolean };
      settingsSchema: Record<string, unknown>;
      musicStyleGroups: readonly MusicStyleGroup[];
      uploadLimits: typeof assetLimits;
      supportedExtensions: string[];
    }
  | {
      kind: "styles";
      styles: { id: string; name: string; category: string; visualDirection: string }[];
    }
  | {
      kind: "settings_conflict";
      message: string;
      details: RequestSettingsReview;
      draftId?: string;
      revision: number;
    }
  | { kind: "settings_check_unavailable"; message: string }
  | { kind: "error"; message: string };

export type KitevaMcpAsset = {
  id: string;
  originalName: string;
  kind: string;
  bytes: number;
  owner?: AssetOwner;
  attached: boolean;
};

export type KitevaMcpToolResponse = {
  content: { type: "text"; text: string }[];
  structuredContent: KitevaMcpResult;
  isError?: boolean;
};
