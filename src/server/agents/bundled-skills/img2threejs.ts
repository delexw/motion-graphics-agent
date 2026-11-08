import { img2threejsPrompt } from "./img2threejs-prompt";
import type { BundledSkill } from "./types";

export const img2threejsSkillPath = ".agents/skills/img2threejs";
export const img2threejsSkill: BundledSkill = {
  id: "img2threejs",
  name: "img2threejs",
  purpose: "visual_authoring",
  workspacePath: img2threejsSkillPath,
  claudeName: "bundled-authoring:img2threejs",
  repository: "https://github.com/img2threejs/img2threejs.git",
  guidance: img2threejsPrompt(img2threejsSkillPath),
};
