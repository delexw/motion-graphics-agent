export interface SkillSource {
  id: string;
  name: string;
  repository: string;
  optional?: boolean;
  /** Optional skill directory inside the upstream repository. */
  sourceDirectory?: string;
  /** Reviewed Markdown collection with its original upstream layout. */
  collection?: { revision: string; entrypoint: string };
}

/** App-owned registration; upstream skill contents are installed at startup. */
export interface BundledSkill extends SkillSource {
  purpose: "visual_authoring" | "research";
  workspacePath: string;
  claudeName: string;
  guidance: string;
  sceneGuidance?: string;
  nodePackageType?: "commonjs" | "module";
}

/** A verified reference collection staged for a capability, outside the SDK plugin. */
export interface BundledSkillReference extends SkillSource {
  optional: true;
  collection: NonNullable<SkillSource["collection"]>;
  compatibility: { runtime: string; supportedVersions: RegExp };
  workspacePath: (workspace: string, revision: string) => string;
}

export type BundledSkillRegistration = BundledSkill | BundledSkillReference;
export type SkillRuntimeVersions = Readonly<Record<string, string | undefined>>;
