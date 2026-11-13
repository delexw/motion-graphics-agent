/** App-owned registration; upstream skill contents are installed at startup. */
export interface BundledSkill {
  id: string;
  name: string;
  purpose: "visual_authoring" | "research";
  workspacePath: string;
  claudeName: string;
  repository: string;
  /** Optional skill directory inside the upstream repository. */
  sourceDirectory?: string;
  guidance: string;
  sceneGuidance?: string;
  nodePackageType?: "commonjs" | "module";
}
