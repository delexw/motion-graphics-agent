/** Ownership for imported runtime assets; draft IDs are stable across room revisions. */
export type AssetOwner = { kind: "draft" | "project"; id: string };
