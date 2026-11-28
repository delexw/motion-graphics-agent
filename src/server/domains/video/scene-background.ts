import { SceneBackgroundTreatmentSchema } from "../../../shared/agents/scene-background";

const directions = {
  required:
    "Design detailed, layered backgrounds around the setting, depth and atmosphere the audience needs.",
  not_required:
    "Keep backgrounds simple. Use solid colour or intentional negative space where it suits the scene.",
  both: "Assign layered environments and clean backgrounds to the scenes that need them. Where a scene needs both, reserve a quiet area around the essential action or text.",
};

export function videoSceneBackgroundGuidance(value: unknown, heading = "Scene backgrounds") {
  const decision = SceneBackgroundTreatmentSchema.safeParse(value);
  if (!decision.success) return "";
  return `### ${heading}\n\n${directions[decision.data]}`;
}
