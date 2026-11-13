import { img2threejsSkill } from "./img2threejs";
import { anysearchSkill } from "./anysearch";
import { anatomySkill } from "./anatomy";
import { stageshowSkill } from "./stageshow";
import type { BundledSkill } from "./types";

/** Add each reviewed skill here; staging, prompts and Claude registration use this list. */
export const bundledSkills: readonly BundledSkill[] = [
  anatomySkill,
  img2threejsSkill,
  stageshowSkill,
  anysearchSkill,
];
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
