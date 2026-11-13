import { stageshowSceneGuidance } from "./stageshow-scene-guidance";
import type { BundledSkill } from "./types";
import { stageshowPrompt } from "./stageshow-prompt";

export const stageshowSkill: BundledSkill = {
  id: "stageshow",
  name: "Stageshow",
  purpose: "visual_authoring",
  workspacePath: ".agents/skills/stageshow",
  claudeName: "bundled-authoring:stageshow",
  repository: "https://github.com/benjitaylor/skills.git",
  sourceDirectory: "stageshow",
  sceneGuidance: stageshowSceneGuidance,
  guidance: stageshowPrompt(".agents/skills/stageshow"),
};
