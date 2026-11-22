import { workspacePaths } from "../../../runtime/workspace";
import type { BundledSkillReference } from "../../bundled-skills/types";

export const bevyCommunitySkills = {
  id: "bevy",
  name: "Bevy community skills",
  optional: true,
  compatibility: { runtime: "bevy", supportedVersions: /^0\.20\.\d+$/ },
  repository: "https://github.com/chrisgliddon/bevy-skills",
  collection: {
    revision: "475ed421de043b0a8c1d248243f1e937962dfd02",
    entrypoint: "skills/bevy/SKILL.md",
  },
  workspacePath: (workspace, revision) =>
    `${workspacePaths(workspace).inputs}/bevy-skills/${revision}`,
} satisfies BundledSkillReference;
