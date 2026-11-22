import { img2threejsSkill } from "./img2threejs";
import { anysearchSkill } from "./anysearch";
import { anatomySkill } from "./anatomy";
import { stageshowSkill } from "./stageshow";
import { bevyCommunitySkills } from "../capabilities/bevy/community-skills";
import type { BundledSkill, BundledSkillRegistration, SkillRuntimeVersions } from "./types";

/** Single registry for update, staging and provider registration. */
export const bundledSkillRegistry: readonly BundledSkillRegistration[] = [
  anatomySkill,
  img2threejsSkill,
  stageshowSkill,
  anysearchSkill,
  bevyCommunitySkills,
];

export function compatibleBundledSkills(runtimeVersions: SkillRuntimeVersions = {}) {
  return bundledSkillRegistry.filter((skill) => {
    if (!("compatibility" in skill)) return true;
    const { runtime, supportedVersions } = skill.compatibility;
    return supportedVersions.test(runtimeVersions[runtime] ?? "");
  });
}

export const bundledSkills = bundledSkillRegistry.filter(
  (skill): skill is BundledSkill => "claudeName" in skill,
);

export const bundledSkillsGuidance = bundledSkills
  .map((skill) => `### ${skill.name}\n\n${skill.guidance}`)
  .join("\n\n");

/** Selected skill scene rules apply to authoring and its independent reviewers alike. */
export function selectedSkillSceneGuidance(selectedIds: readonly string[] = []): string {
  return bundledSkills
    .filter((skill) => selectedIds.includes(skill.id))
    .map((skill) => skill.sceneGuidance)
    .filter(Boolean)
    .join("\n\n");
}
